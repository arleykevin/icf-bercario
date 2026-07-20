-- =============================================================================
-- Fase 1 · Aceite de convite DENTRO do app (sem depender do link/e-mail)
-- Motivação: quem é convidado não deveria ver "Criar escola" no /inicio. Detectamos
-- o convite pendente pelo e-mail VERIFICADO do usuário e deixamos aceitar ali.
--
-- Segurança: a garantia é a MESMA do accept_invitation(token) — o token só existia
-- para ENTREGAR o link fora do app (capability out-of-band). Para um usuário logado
-- cujo e-mail VERIFICADO bate com o e-mail do convite, a verificação de e-mail já
-- prova a identidade; enumerar id de convite não ajuda (só aceita quem tem o e-mail
-- verificado correspondente). Ver PLANO.md §5.1 e o accept_invitation por token.
-- =============================================================================

-- Convites pendentes para o e-mail do usuário atual (para exibição no /inicio).
-- SECURITY DEFINER: a RLS de invitations é admin-only; aqui expomos SÓ os convites
-- do próprio e-mail do usuário, com PII minimizada (1º nome do menor).
create or replace function public.my_pending_invitations()
returns table (
  invitation_id     uuid,
  organization_id   uuid,
  organization_name text,
  role              public.app_role,
  child_id          uuid,
  child_name        text
)
language sql stable security definer set search_path = ''
as $$
  select
    i.id,
    i.organization_id,
    o.name,
    i.role,
    i.child_id,
    split_part(c.full_name, ' ', 1)
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.children c on c.id = i.child_id
  join auth.users u on u.id = (select auth.uid())
  where i.status = 'pending'
    and i.expires_at > now()
    and lower(i.email) = lower(coalesce(u.email, ''))
    and public.current_user_active();
$$;

-- Aceita TODOS os convites pendentes que casam com o e-mail VERIFICADO do usuário.
-- Idempotente (membership/vínculo com on conflict do nothing). Retorna a quantidade
-- de convites aceitos.
create or replace function public.accept_invitation_by_email()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_confirmed timestamptz;
  v_inv       public.invitations;
  v_count     int := 0;
begin
  if v_uid is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if not public.current_user_active() then
    raise exception 'usuario inativo' using errcode = '42501';
  end if;

  select email, email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;

  -- Exige e-mail verificado: impede assumir vínculo com e-mail alheio não comprovado.
  if v_confirmed is null then
    raise exception 'e-mail nao verificado' using errcode = '42501';
  end if;

  for v_inv in
    select *
    from public.invitations
    where status = 'pending'
      and expires_at > now()
      and lower(email) = lower(coalesce(v_email, ''))
    for update
  loop
    insert into public.org_members (organization_id, profile_id, role)
    values (v_inv.organization_id, v_uid, v_inv.role)
    on conflict (organization_id, profile_id, role) do nothing;

    if v_inv.role = 'guardian' and v_inv.child_id is not null then
      insert into public.guardianships
        (organization_id, child_id, guardian_id, relationship, is_legal_guardian)
      values
        (v_inv.organization_id, v_inv.child_id, v_uid,
         coalesce(v_inv.relationship, 'responsável'), v_inv.is_legal_guardian)
      on conflict (child_id, guardian_id) do nothing;

      insert into public.consents
        (organization_id, child_id, guardian_id, purpose, terms_version)
      values
        (v_inv.organization_id, v_inv.child_id, v_uid, 'general_terms', 'v1');
    end if;

    update public.invitations
       set status = 'accepted', accepted_at = now(), accepted_by = v_uid
     where id = v_inv.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.my_pending_invitations()   to authenticated;
grant execute on function public.accept_invitation_by_email() to authenticated;
