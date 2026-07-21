-- =============================================================================
-- Gestão de papéis: só admin muda; não rebaixa o último admin; sem guardian;
-- isolamento por tenant. Ver 20260720160000_member_roles.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(5);

insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000g1', 'Escola A', 'escola-a-role'),
  ('bbbb0000-0000-0000-0000-0000000000g1', 'Escola B', 'escola-b-role');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000g0',
   'authenticated', 'authenticated', 'admina@role.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000g2',
   'authenticated', 'authenticated', 'admin2a@role.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000g7',
   'authenticated', 'authenticated', 'teachera@role.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000g0',
   'authenticated', 'authenticated', 'adminb@role.dev', now(), now());

insert into public.org_members (id, organization_id, profile_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000g0', 'aaaa0000-0000-0000-0000-0000000000g1', 'a0000000-0000-0000-0000-0000000000g0', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000g2', 'aaaa0000-0000-0000-0000-0000000000g1', 'a0000000-0000-0000-0000-0000000000g2', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000g7', 'aaaa0000-0000-0000-0000-0000000000g1', 'a0000000-0000-0000-0000-0000000000g7', 'teacher'),
  ('bbbbbbbb-0000-0000-0000-0000000000g0', 'bbbb0000-0000-0000-0000-0000000000g1', 'b0000000-0000-0000-0000-0000000000g0', 'admin');

-- (1) Não-admin não muda papel.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000g7"}';
select throws_ok(
  $$ select public.set_member_role('aaaaaaaa-0000-0000-0000-0000000000g7', 'staff') $$,
  '42501', 'professor não muda papéis');

-- (2) Admin muda professor -> staff.
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000g0"}';
select lives_ok(
  $$ select public.set_member_role('aaaaaaaa-0000-0000-0000-0000000000g7', 'staff') $$,
  'admin muda professor para equipe');

-- (3) Não rebaixa o último admin (org B só tem adminB).
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000g0"}';
select throws_ok(
  $$ select public.set_member_role('bbbbbbbb-0000-0000-0000-0000000000g0', 'teacher') $$,
  'P0001', 'não rebaixa o último admin');

-- (4) Não define guardian pela gestão de equipe.
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000g0"}';
select throws_ok(
  $$ select public.set_member_role('aaaaaaaa-0000-0000-0000-0000000000g2', 'guardian') $$,
  'P0001', 'papel guardian é inválido para equipe');

-- (5) Cross-tenant: admin de B não muda vínculo da org A.
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000g0"}';
select throws_ok(
  $$ select public.set_member_role('aaaaaaaa-0000-0000-0000-0000000000g2', 'staff') $$,
  '42501', 'admin da org B não muda papel na org A');

select * from finish();
rollback;
