-- =============================================================================
-- Fase 0 · Funções auxiliares de autorização (base da RLS)
-- SECURITY DEFINER: rodam como owner (que ignora RLS) para evitar recursão de
-- policy sobre org_members. search_path travado em ''. Ver PLANO.md §5.3.
--
-- Fase 1 adicionará teaches_child(uuid) e is_guardian_of(uuid) junto com as
-- tabelas de turma/criança/guardianship.
-- =============================================================================

-- Organização "corrente" do usuário (primeira ativa) — conveniência de Fase 0.
create or replace function public.auth_org_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select om.organization_id
  from public.org_members om
  where om.profile_id = (select auth.uid())
    and om.is_active and om.deleted_at is null
  order by om.created_at asc
  limit 1;
$$;

-- É membro ativo da organização alvo?
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members om
    where om.profile_id = (select auth.uid())
      and om.organization_id = target_org
      and om.is_active and om.deleted_at is null
  );
$$;

-- É admin da organização alvo?
create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members om
    where om.profile_id = (select auth.uid())
      and om.organization_id = target_org
      and om.role = 'admin'
      and om.is_active and om.deleted_at is null
  );
$$;

-- É admin em ALGUMA organização ativa? (conveniência)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members om
    where om.profile_id = (select auth.uid())
      and om.role = 'admin'
      and om.is_active and om.deleted_at is null
  );
$$;

-- O usuário atual compartilha alguma organização ativa com o profile alvo?
create or replace function public.shares_org(target_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members a
    join public.org_members b on a.organization_id = b.organization_id
    where a.profile_id = (select auth.uid())
      and b.profile_id = target_profile
      and a.is_active and b.is_active
      and a.deleted_at is null and b.deleted_at is null
  );
$$;

grant execute on function
  public.auth_org_id(),
  public.is_org_member(uuid),
  public.is_org_admin(uuid),
  public.is_admin(),
  public.shares_org(uuid)
to authenticated;
