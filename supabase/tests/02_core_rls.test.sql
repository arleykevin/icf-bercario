-- =============================================================================
-- Isolamento do núcleo: professor só vê aluno da sua turma, responsável só o
-- próprio filho, nada atravessa a fronteira entre escolas (tenants), e o
-- soft-delete de uma criança REVOGA o acesso de professor/responsável.
-- Ver PLANO.md §5.3, §5.4 e as correções da auditoria RLS.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(15);

-- --- Seed: duas escolas isoladas ---
insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Escola A', 'escola-a'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Escola B', 'escola-b');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a0',
   'authenticated', 'authenticated', 'admin.a@test.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a7',
   'authenticated', 'authenticated', 'teacher.a@test.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a9',
   'authenticated', 'authenticated', 'guardian.a@test.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b9',
   'authenticated', 'authenticated', 'guardian.b@test.dev', now(), now());

-- Membership por organização (necessária: as triggers exigem professor/responsável
-- membros ativos da org antes de qualquer vínculo).
insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a0', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7', 'teacher'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'guardian'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b9', 'guardian');

insert into public.classes (id, organization_id, name) values
  ('c1aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Berçário A'),
  ('c1bb0000-0000-0000-0000-0000000000b1', 'bbbb0000-0000-0000-0000-0000000000b1', 'Berçário B');

insert into public.children (id, organization_id, full_name, birth_date) values
  ('c8aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Criança A', '2024-01-10'),
  ('c8bb0000-0000-0000-0000-0000000000b1', 'bbbb0000-0000-0000-0000-0000000000b1', 'Criança B', '2024-02-20');

insert into public.enrollments (organization_id, child_id, class_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'c8bb0000-0000-0000-0000-0000000000b1', 'c1bb0000-0000-0000-0000-0000000000b1');

insert into public.class_teachers (organization_id, class_id, teacher_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7');

insert into public.guardianships (organization_id, child_id, guardian_id, relationship) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'mãe'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'c8bb0000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b9', 'pai');

-- === PROFESSOR A ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';

select ok(public.teaches_class('c1aa0000-0000-0000-0000-0000000000a1'),
  'professor A leciona a turma da escola A');
select ok(not public.teaches_class('c1bb0000-0000-0000-0000-0000000000b1'),
  'professor A NÃO leciona turma da escola B');
select ok(public.teaches_child('c8aa0000-0000-0000-0000-0000000000a1'),
  'professor A vê a criança da sua turma');
select ok(not public.teaches_child('c8bb0000-0000-0000-0000-0000000000b1'),
  'professor A NÃO vê criança da escola B (isolamento entre escolas)');
select ok(not public.is_guardian_of('c8aa0000-0000-0000-0000-0000000000a1'),
  'professor A não é responsável pela criança');
select ok(public.can_see_profile('a0000000-0000-0000-0000-0000000000a9'),
  'professor A vê o perfil do responsável do seu aluno');
select ok(not public.can_see_profile('b0000000-0000-0000-0000-0000000000b9'),
  'professor A NÃO vê o perfil de responsável de outra escola');

-- === RESPONSÁVEL A ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';

select ok(public.is_guardian_of('c8aa0000-0000-0000-0000-0000000000a1'),
  'responsável A é responsável pelo próprio filho');
select ok(not public.is_guardian_of('c8bb0000-0000-0000-0000-0000000000b1'),
  'responsável A NÃO é responsável por criança de outra família/escola');
select ok(public.guardian_in_class('c1aa0000-0000-0000-0000-0000000000a1'),
  'responsável A enxerga a turma do próprio filho');
select ok(not public.guardian_in_class('c1bb0000-0000-0000-0000-0000000000b1'),
  'responsável A NÃO enxerga turma de outra escola');
select ok(not public.teaches_child('c8aa0000-0000-0000-0000-0000000000a1'),
  'responsável A não é professor da criança');

-- === RESPONSÁVEL B (outra escola) ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000b9"}';

select ok(not public.is_guardian_of('c8aa0000-0000-0000-0000-0000000000a1'),
  'responsável B NÃO alcança a criança da escola A');

-- === SOFT-DELETE revoga acesso (correção da auditoria, item #6) ===
update public.children set deleted_at = now()
  where id = 'c8aa0000-0000-0000-0000-0000000000a1';

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select ok(not public.teaches_child('c8aa0000-0000-0000-0000-0000000000a1'),
  'professor perde acesso à criança soft-deletada');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select ok(not public.is_guardian_of('c8aa0000-0000-0000-0000-0000000000a1'),
  'responsável perde acesso à criança soft-deletada');

select * from finish();
rollback;
