-- =============================================================================
-- Offboarding automatizado (PLANO.md §9 risco #11: ex-funcionário com acesso
-- residual) — Fase 2 endurecimento.
--
-- Desativar o vínculo (org_members.is_active=false) já corta o acesso NA HORA: a
-- autorização é checada ao vivo na RLS (is_org_member/is_org_admin lêem a membership
-- corrente), não no JWT. O ban via Admin API (app-side) é defesa em profundidade
-- para quem sai da plataforma inteira. Toda ação fica numa trilha de AUDITORIA
-- imutável.
-- =============================================================================

-- TRILHA DE AUDITORIA (append-only, por organização) ------------------------
create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid references public.profiles(id),  -- quem fez (null = sistema)
  action          text not null,                        -- ex.: 'member.offboarded'
  target_type     text,
  target_id       uuid,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index audit_events_org_idx on public.audit_events (organization_id, created_at desc);

alter table public.audit_events enable row level security;

-- Só SELECT para admin. Sem INSERT/UPDATE/DELETE para authenticated: a trilha é
-- IMUTÁVEL e só é escrita pelas funções SECURITY DEFINER (que rodam como owner,
-- ignorando RLS e sem precisar de grant de escrita).
grant select on public.audit_events to authenticated;

create policy audit_events_admin_select on public.audit_events
  for select to authenticated
  using (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- offboard_member: revoga o acesso de um membro numa organização.
--  - exige is_org_admin(p_org) do CHAMADOR;
--  - impede remover o ÚLTIMO admin ativo (não órfã a escola);
--  - desativa TODOS os vínculos (org,profile) — o usuário pode ter mais de um papel;
--  - se o alvo não tiver mais vínculo ativo em NENHUMA org, desativa o profile
--    (offboarding total → o app então bane a conta via Admin API);
--  - grava a auditoria.
-- Retorna o alvo e se foi offboarding total (para o app decidir banir a sessão).
-- -----------------------------------------------------------------------------
create or replace function public.offboard_member(
  p_org uuid,
  p_profile uuid
)
returns table(target uuid, fully_offboarded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_target_admin boolean;
  v_other_admin_exists boolean;
  v_affected integer;
  v_still_member boolean;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Apenas administradores da escola podem remover acessos.'
      using errcode = '42501';
  end if;

  -- O RPC é a fronteira real (chamável direto via PostgREST): a proibição de
  -- auto-remoção fica aqui, não só na UI.
  if p_profile = (select auth.uid()) then
    raise exception 'Você não pode remover o próprio acesso.'
      using errcode = 'P0001';
  end if;

  -- SERIALIZA os offboardings da mesma org (e do mesmo profile) nesta transação.
  -- Sem isso, dois admins removendo um ao outro ao mesmo tempo passariam ambos na
  -- guarda do último admin (READ COMMITTED não vê a alteração não-commitada do
  -- outro) e a escola ficaria órfã. Ordem org→profile evita deadlock.
  perform pg_advisory_xact_lock(hashtext('offboard_org'), hashtext(p_org::text));
  perform pg_advisory_xact_lock(hashtext('offboard_profile'), hashtext(p_profile::text));

  -- Guarda do último admin.
  select exists (
    select 1 from public.org_members
    where organization_id = p_org and profile_id = p_profile
      and role = 'admin' and is_active and deleted_at is null
  ) into v_is_target_admin;

  if v_is_target_admin then
    select exists (
      select 1 from public.org_members
      where organization_id = p_org and role = 'admin'
        and is_active and deleted_at is null
        and profile_id <> p_profile
    ) into v_other_admin_exists;
    if not v_other_admin_exists then
      raise exception 'Não é possível remover o último administrador da escola.'
        using errcode = 'P0001';
    end if;
  end if;

  -- Desativa todos os vínculos ativos do alvo nesta org.
  update public.org_members
  set is_active = false, deleted_at = now(), updated_at = now()
  where organization_id = p_org and profile_id = p_profile
    and (is_active or deleted_at is null);
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    raise exception 'Membro não encontrado nesta escola.' using errcode = 'P0001';
  end if;

  -- Ainda é membro ativo de alguma org?
  select exists (
    select 1 from public.org_members
    where profile_id = p_profile and is_active and deleted_at is null
  ) into v_still_member;

  if not v_still_member then
    update public.profiles set is_active = false, updated_at = now()
    where id = p_profile;
  end if;

  insert into public.audit_events
    (organization_id, actor_id, action, target_type, target_id, metadata)
  values (
    p_org, (select auth.uid()), 'member.offboarded', 'profile', p_profile,
    jsonb_build_object('vinculos_desativados', v_affected,
                       'offboarding_total', not v_still_member)
  );

  return query select p_profile, (not v_still_member);
end;
$$;

revoke all on function public.offboard_member(uuid, uuid) from public, anon;
grant execute on function public.offboard_member(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- record_offboard_ban: registra na trilha imutável o DESFECHO do ban da conta
-- (revogação de sessão via Admin API, feita no servidor). Sem isto, uma falha
-- silenciosa do ban deixaria a sessão do ex-funcionário viva sem rastro — lacuna
-- de compliance (LGPD). Só admin da org registra.
-- -----------------------------------------------------------------------------
create or replace function public.record_offboard_ban(
  p_org uuid,
  p_profile uuid,
  p_ok boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  insert into public.audit_events
    (organization_id, actor_id, action, target_type, target_id, metadata)
  values (
    p_org, (select auth.uid()), 'member.session_revoked', 'profile', p_profile,
    jsonb_build_object('sucesso', coalesce(p_ok, false))
  );
end;
$$;

revoke all on function public.record_offboard_ban(uuid, uuid, boolean) from public, anon;
grant execute on function public.record_offboard_ban(uuid, uuid, boolean) to authenticated;
