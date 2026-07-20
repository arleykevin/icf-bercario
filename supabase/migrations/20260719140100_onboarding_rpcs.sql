-- =============================================================================
-- Fase 1 · RPCs de onboarding (SECURITY DEFINER, search_path travado)
-- Encapsulam operações de bootstrap que a RLS deny-by-default bloquearia — com
-- verificação interna rígida (identidade, e-mail do convite, validade). Evitam
-- expor service_role ao app. Ver PLANO.md §5.2.
-- =============================================================================

-- Cria uma escola e torna o usuário atual o PRIMEIRO admin (self-service).
create or replace function public.create_school(p_name text, p_slug text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if not public.current_user_active() then
    raise exception 'usuario inativo' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_slug), '') = '' then
    raise exception 'nome/slug obrigatorios' using errcode = '22023';
  end if;

  insert into public.organizations (name, slug)
  values (btrim(p_name), lower(btrim(p_slug)))
  returning id into v_org;

  insert into public.org_members (organization_id, profile_id, role)
  values (v_org, v_uid, 'admin');

  return v_org;
end;
$$;

-- Retorna dados de exibição de um convite pendente/válido (para a tela /convite).
-- Acessível por quem tem o token (capability). Não expõe nada além do convite.
create or replace function public.get_invitation(p_token text)
returns table (
  organization_id   uuid,
  organization_name text,
  role              public.app_role,
  child_id          uuid,
  child_name        text,
  email             text,
  expires_at        timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    i.organization_id,
    o.name,
    i.role,
    i.child_id,
    split_part(c.full_name, ' ', 1),   -- só o primeiro nome (minimização de PII de menor)
    i.email,
    i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.children c on c.id = i.child_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.status = 'pending'
    and i.expires_at > now();
$$;

-- Aceita um convite: valida token + validade + e-mail do usuário == e-mail do convite,
-- então cria membership (+ vínculo de responsável + consentimento) de forma atômica.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_confirmed timestamptz;
  v_inv       public.invitations;
begin
  if v_uid is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if not public.current_user_active() then
    raise exception 'usuario inativo' using errcode = '42501';
  end if;

  select * into v_inv
  from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'convite invalido ou expirado' using errcode = 'P0002';
  end if;

  select email, email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;

  if lower(coalesce(v_email, '')) is distinct from lower(v_inv.email) then
    raise exception 'este convite e para outro e-mail' using errcode = '42501';
  end if;
  -- Exige e-mail verificado: impede aceitar com um e-mail alheio não comprovado.
  if v_confirmed is null then
    raise exception 'e-mail nao verificado' using errcode = '42501';
  end if;

  -- Membership (idempotente).
  insert into public.org_members (organization_id, profile_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, profile_id, role) do nothing;

  -- Vínculo de responsável + consentimento geral (se for guardian com criança).
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

  return v_inv.organization_id;
end;
$$;

grant execute on function public.create_school(text, text) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
