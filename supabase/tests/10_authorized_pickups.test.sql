-- =============================================================================
-- Autorizados a retirar: gerencia só responsável LEGAL ou admin; professor da
-- criança lê; nada vaza entre escolas; soft-delete revoga a visibilidade p/ não-admin.
-- Ver supabase/migrations/*_authorized_pickups.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(10);

insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Escola A', 'escola-a-pick'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Escola B', 'escola-b-pick');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a0',
   'authenticated', 'authenticated', 'admin.a@pick.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a7',
   'authenticated', 'authenticated', 'teacher.a@pick.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a9',
   'authenticated', 'authenticated', 'legal.a@pick.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a8',
   'authenticated', 'authenticated', 'nonlegal.a@pick.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b7',
   'authenticated', 'authenticated', 'teacher.b@pick.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a0', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7', 'teacher'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'guardian'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a8', 'guardian'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b7', 'teacher');

insert into public.classes (id, organization_id, name) values
  ('c1aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Turma A');
insert into public.children (id, organization_id, full_name, birth_date) values
  ('c8aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Criança A', '2024-01-10');
insert into public.enrollments (organization_id, child_id, class_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1');
insert into public.class_teachers (organization_id, class_id, teacher_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7');
insert into public.guardianships (organization_id, child_id, guardian_id, relationship, is_legal_guardian) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'mãe', true),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a8', 'tio', false);

-- === RESPONSÁVEL LEGAL adiciona autorizado ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select lives_ok(
  $$ insert into public.authorized_pickups (id, organization_id, child_id, name, relationship)
     values ('e1000000-0000-0000-0000-0000000000e1',
             'aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'Vovó Ana', 'avó') $$,
  'responsável legal adiciona pessoa autorizada a retirar');

-- === Responsável NÃO-legal e professor NÃO gerenciam ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a8"}';
select throws_ok(
  $$ insert into public.authorized_pickups (organization_id, child_id, name)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'Forjado') $$,
  '42501',
  'responsável NÃO-legal não adiciona autorizado');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select throws_ok(
  $$ insert into public.authorized_pickups (organization_id, child_id, name)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'Forjado prof') $$,
  '42501',
  'professor não adiciona autorizado (só lê)');

-- === LEITURA: professor da criança e responsável leem ===
select is(
  (select count(*) from public.authorized_pickups
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'professor da criança lê os autorizados (confere na retirada)');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a8"}';
select is(
  (select count(*) from public.authorized_pickups
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'responsável (mesmo não-legal) lê os autorizados');

-- === Cross-tenant ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000b7"}';
select is(
  (select count(*) from public.authorized_pickups
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'escola B não vê os autorizados da criança da escola A');

-- === Admin também gerencia ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a0"}';
select lives_ok(
  $$ insert into public.authorized_pickups (id, organization_id, child_id, name)
     values ('e1000000-0000-0000-0000-0000000000e2',
             'aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'Motorista') $$,
  'admin também adiciona autorizado');

-- === Soft-delete (revogar) esconde do não-admin ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select lives_ok(
  $$ update public.authorized_pickups set deleted_at = now()
     where id = 'e1000000-0000-0000-0000-0000000000e1' $$,
  'responsável legal revoga (soft-delete) um autorizado');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select is(
  (select count(*) from public.authorized_pickups
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'autorizado revogado some para o professor (só o vigente aparece)');

-- === Anti-forja estrutural ===
reset role;
select throws_ok(
  $$ insert into public.authorized_pickups (organization_id, child_id, name)
     values ('bbbb0000-0000-0000-0000-0000000000b1', 'c8aa0000-0000-0000-0000-0000000000a1', 'X') $$,
  '23503',
  'FK composta impede autorizado na org B p/ criança da org A');

select * from finish();
rollback;
