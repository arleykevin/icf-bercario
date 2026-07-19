-- =============================================================================
-- Fase 0 · RLS deny-by-default + grants + policies das tabelas base
-- Tabela SEM policy permissiva => acesso negado a `authenticated`.
-- `service_role` ignora RLS (usado só no servidor: onboarding, rotinas).
-- Ver PLANO.md §5.
-- =============================================================================

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.org_members   enable row level security;

-- Grants de TABELA (o acesso por LINHA é decidido pela RLS abaixo).
-- DELETE não é concedido em organizations/profiles: exclusão é soft-delete/serviço.
grant usage on schema public to authenticated;
grant select, update                 on public.organizations to authenticated;
grant select, insert, update         on public.profiles      to authenticated;
grant select, insert, update, delete on public.org_members   to authenticated;

-- ORGANIZATIONS -------------------------------------------------------------
-- Membros leem a própria escola; admin da escola edita.
-- Criação/remoção de organização: apenas service_role (onboarding server-side).
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- PROFILES ------------------------------------------------------------------
-- Fase 0: apenas o PRÓPRIO perfil. A visibilidade relacional (professor↔responsável
-- da mesma turma) é ADICIONADA na Fase 1 via public.can_see_profile(), quando existem
-- turmas/vínculos — evitando o vazamento do roster inteiro da escola.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ORG_MEMBERS ---------------------------------------------------------------
-- Vê a PRÓPRIA linha (ativa); o roster completo é só para admin (não expor a
-- composição de pessoal/famílias a qualquer membro). Admin vê tudo, inclusive histórico.
-- OBS: o PRIMEIRO admin de uma escola nova é semeado via service_role (bootstrap),
-- pois ainda não existe membership para satisfazer is_org_admin().
create policy org_members_select on public.org_members
  for select to authenticated
  using (
    public.is_org_admin(organization_id)
    or (deleted_at is null and is_active and profile_id = (select auth.uid()))
  );

create policy org_members_admin_insert on public.org_members
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy org_members_admin_update on public.org_members
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy org_members_admin_delete on public.org_members
  for delete to authenticated
  using (public.is_org_admin(organization_id));
