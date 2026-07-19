-- =============================================================================
-- Fase 1 · RLS + grants do núcleo
-- Regra: is_org_member(organization_id) é SEMPRE o 1º predicado (tenant isolation);
-- depois o papel (admin / professor da turma / responsável da criança).
-- Deny-by-default: sem policy = sem acesso. Ver PLANO.md §5.
--
-- Correções da auditoria RLS: todo ramo NÃO-admin exige deleted_at is null
-- (soft-delete revoga acesso; admin mantém histórico); a segurança de tenant do
-- child_id/class_id vem das FKs compostas (ver core_entities). profiles_select é
-- reescrita para escopo relacional (can_see_profile), sem vazar a escola inteira.
-- =============================================================================

alter table public.classes        enable row level security;
alter table public.children       enable row level security;
alter table public.child_health   enable row level security;
alter table public.enrollments    enable row level security;
alter table public.class_teachers enable row level security;
alter table public.guardianships  enable row level security;

grant select, insert, update         on public.classes        to authenticated;
grant select, insert, update         on public.children       to authenticated;
grant select, insert, update         on public.child_health   to authenticated;
grant select, insert, update, delete on public.enrollments    to authenticated;
grant select, insert, update, delete on public.class_teachers to authenticated;
grant select, insert, update, delete on public.guardianships  to authenticated;

-- CLASSES -------------------------------------------------------------------
create policy classes_select on public.classes
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (deleted_at is null and (public.teaches_class(id) or public.guardian_in_class(id)))
    )
  );

create policy classes_admin_insert on public.classes
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy classes_admin_update on public.classes
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- CHILDREN ------------------------------------------------------------------
-- Responsável vê só o filho; professor só aluno da sua turma; admin só da sua escola.
-- Não-admin não enxerga criança soft-deletada.
create policy children_select on public.children
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (deleted_at is null and (public.teaches_child(id) or public.is_guardian_of(id)))
    )
  );

create policy children_admin_insert on public.children
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy children_admin_update on public.children
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- CHILD_HEALTH --------------------------------------------------------------
-- Leitura: admin, professor da criança, responsável. Escrita: admin ou responsável.
-- Tenant garantido pela FK composta (organization_id ↔ children). Soft-delete honrado.
create policy child_health_select on public.child_health
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (deleted_at is null and (public.teaches_child(child_id) or public.is_guardian_of(child_id)))
    )
  );

create policy child_health_insert on public.child_health
  for insert to authenticated
  with check (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id) or public.is_guardian_of(child_id)
    )
  );

create policy child_health_update on public.child_health
  for update to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (deleted_at is null and public.is_guardian_of(child_id))
    )
  )
  with check (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id) or public.is_guardian_of(child_id)
    )
  );

-- ENROLLMENTS ---------------------------------------------------------------
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (deleted_at is null and (public.teaches_class(class_id) or public.is_guardian_of(child_id)))
    )
  );

create policy enrollments_admin_write on public.enrollments
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- CLASS_TEACHERS ------------------------------------------------------------
create policy class_teachers_select on public.class_teachers
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (deleted_at is null and teacher_id = (select auth.uid()))
    )
  );

create policy class_teachers_admin_write on public.class_teachers
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- GUARDIANSHIPS -------------------------------------------------------------
create policy guardianships_select on public.guardianships
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (deleted_at is null and (guardian_id = (select auth.uid()) or public.teaches_child(child_id)))
    )
  );

create policy guardianships_admin_write on public.guardianships
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- PROFILES (reescrita) ------------------------------------------------------
-- Agora que existem turmas/vínculos, amplia a leitura de perfis para o escopo
-- RELACIONAL (professor↔responsável da mesma turma, co-responsáveis, admin da org),
-- em vez do roster inteiro da escola. Corrige o vazamento via shares_org (auditoria #4).
drop policy profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.can_see_profile(id));
