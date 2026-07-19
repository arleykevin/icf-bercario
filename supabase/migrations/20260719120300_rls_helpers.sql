-- =============================================================================
-- Fase 0 · Funções auxiliares de autorização (base da RLS)
-- SECURITY DEFINER: rodam como owner (que ignora RLS) para evitar recursão de
-- policy sobre org_members. search_path travado em ''. Ver PLANO.md §5.3.
--
-- Todo helper é gateado por current_user_active(): um profile desativado
-- (offboarding) perde acesso em TODAS as organizações de uma vez.
-- =============================================================================

-- O profile do usuário atual está ativo? (offboarding real — PLANO.md §5.2)
create or replace function public.current_user_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active and p.deleted_at is null
  );
$$;

-- Organização "corrente" do usuário (primeira ativa) — conveniência de Fase 0.
create or replace function public.auth_org_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select om.organization_id
  from public.org_members om
  where om.profile_id = (select auth.uid())
    and om.is_active and om.deleted_at is null
    and public.current_user_active()
  order by om.created_at asc
  limit 1;
$$;

-- É membro ativo da organização alvo?
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and exists (
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
  select public.current_user_active() and exists (
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
  select public.current_user_active() and exists (
    select 1 from public.org_members om
    where om.profile_id = (select auth.uid())
      and om.role = 'admin'
      and om.is_active and om.deleted_at is null
  );
$$;

grant execute on function
  public.current_user_active(),
  public.auth_org_id(),
  public.is_org_member(uuid),
  public.is_org_admin(uuid),
  public.is_admin()
to authenticated;

-- Nota: a visibilidade de PERFIS DE OUTRAS PESSOAS (professor↔responsável↔co-responsável)
-- é resolvida por public.can_see_profile() na Fase 1, quando existem turmas/vínculos.
-- Aqui (Fase 0) profiles_select permite apenas o próprio perfil.
