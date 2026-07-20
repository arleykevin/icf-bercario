-- =============================================================================
-- Check-in/out + Presença: educador registra; responsável só lê; nada vaza entre
-- escolas; imutável; occurred_at em tempo quase real. Reusa o padrão do Diário.
-- Ver supabase/migrations/*_attendance.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(9);

insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Escola A', 'escola-a-att'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Escola B', 'escola-b-att');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a7',
   'authenticated', 'authenticated', 'teacher.a@att.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a9',
   'authenticated', 'authenticated', 'guardian.a@att.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b7',
   'authenticated', 'authenticated', 'teacher.b@att.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7', 'teacher'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'guardian'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b7', 'teacher');

insert into public.classes (id, organization_id, name) values
  ('c1aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Turma A');
insert into public.children (id, organization_id, full_name, birth_date) values
  ('c8aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Criança A', '2024-01-10');
insert into public.enrollments (organization_id, child_id, class_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1');
insert into public.class_teachers (organization_id, class_id, teacher_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7');
insert into public.guardianships (organization_id, child_id, guardian_id, relationship) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'mãe');

-- === PROFESSOR registra entrada ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select lives_ok(
  $$ insert into public.attendance_events (organization_id, child_id, kind, counterpart_name)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'checkin', 'Mãe') $$,
  'professor registra a entrada da criança');

select is(
  (select recorded_by from public.attendance_events
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1' limit 1),
  'a0000000-0000-0000-0000-0000000000a7'::uuid,
  'recorded_by é fixado no próprio educador');

select throws_ok(
  $$ insert into public.attendance_events (organization_id, child_id, kind, occurred_at)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'checkin', now() - interval '2 days') $$,
  '23514',
  'occurred_at antedatado é rejeitado');

-- === RESPONSÁVEL lê mas não registra ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select is(
  (select count(*) from public.attendance_events
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'responsável vê a presença do filho');
select throws_ok(
  $$ insert into public.attendance_events (organization_id, child_id, kind)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'checkout') $$,
  '42501',
  'responsável NÃO registra presença');

-- === Cross-tenant ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000b7"}';
select is(
  (select count(*) from public.attendance_events
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'escola B não vê a presença da criança da escola A');
select throws_ok(
  $$ insert into public.attendance_events (organization_id, child_id, kind)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'checkin') $$,
  '42501',
  'professor de outra escola não registra na Escola A');

-- === Imutabilidade ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select throws_ok(
  $$ update public.attendance_events set kind = 'checkout'
     where child_id = 'c8aa0000-0000-0000-0000-0000000000a1' $$,
  '42501',
  'registro de presença é imutável (UPDATE negado)');

-- === Anti-forja estrutural (FK composta) ===
reset role;
select throws_ok(
  $$ insert into public.attendance_events (organization_id, child_id, kind, recorded_by)
     values ('bbbb0000-0000-0000-0000-0000000000b1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'checkin', 'a0000000-0000-0000-0000-0000000000a7') $$,
  '23503',
  'FK composta impede registrar presença na org B p/ criança da org A');

select * from finish();
rollback;
