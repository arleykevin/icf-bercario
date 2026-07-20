-- =============================================================================
-- Calendário: escrita só admin; evento da escola inteira (class_id null) visível a
-- todos os membros; evento de turma só à turma; nada atravessa entre escolas;
-- não-admin não vê soft-deletado. Ver supabase/migrations/*_calendar.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(9);

-- --- Seed (superusuário) ---
insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Escola A', 'escola-a-cal'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Escola B', 'escola-b-cal');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a0',
   'authenticated', 'authenticated', 'admin.a@cal.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a7',
   'authenticated', 'authenticated', 'teacher.a1@cal.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a9',
   'authenticated', 'authenticated', 'guardian.a@cal.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b7',
   'authenticated', 'authenticated', 'teacher.b@cal.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a0', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7', 'teacher'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'guardian'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b7', 'teacher');

insert into public.classes (id, organization_id, name) values
  ('c1aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Turma A1'),
  ('c1aa0000-0000-0000-0000-0000000000a2', 'aaaa0000-0000-0000-0000-0000000000a1', 'Turma A2');

insert into public.children (id, organization_id, full_name, birth_date) values
  ('c8aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Criança A', '2024-01-10');

insert into public.enrollments (organization_id, child_id, class_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1');

insert into public.class_teachers (organization_id, class_id, teacher_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7');

insert into public.guardianships (organization_id, child_id, guardian_id, relationship) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'mãe');

-- Eventos: escola inteira, turma A1, turma A2.
insert into public.calendar_events (id, organization_id, class_id, event_type, title, event_date) values
  ('e0000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000a1', null, 'meal', 'Almoço: arroz e frango', current_date),
  ('e0000000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'event', 'Passeio Turma A1', current_date),
  ('e0000000-0000-0000-0000-0000000000a2', 'aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a2', 'event', 'Reunião Turma A2', current_date);

-- === ESCRITA só admin ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a0"}';
select lives_ok(
  $$ insert into public.calendar_events (organization_id, class_id, event_type, title, event_date)
     values ('aaaa0000-0000-0000-0000-0000000000a1', null, 'holiday', 'Feriado', current_date + 1) $$,
  'admin cria evento no calendário');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select throws_ok(
  $$ insert into public.calendar_events (organization_id, class_id, event_type, title, event_date)
     values ('aaaa0000-0000-0000-0000-0000000000a1', null, 'event', 'Forjado', current_date) $$,
  '42501',
  'professor NÃO escreve no calendário (só a gestão)');

-- === LEITURA: escopo de escola/turma ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select ok(
  exists (select 1 from public.calendar_events where id = 'e0000000-0000-0000-0000-000000000001'),
  'responsável vê evento da escola inteira (class_id null)');
select is(
  (select count(*) from public.calendar_events where id = 'e0000000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'responsável vê evento da turma do próprio filho');
select is(
  (select count(*) from public.calendar_events where id = 'e0000000-0000-0000-0000-0000000000a2'),
  0::bigint,
  'responsável NÃO vê evento de outra turma da mesma escola');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select is(
  (select count(*) from public.calendar_events where id = 'e0000000-0000-0000-0000-0000000000a2'),
  0::bigint,
  'professor NÃO vê evento de turma que não leciona');

-- === Cross-tenant ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000b7"}';
select is(
  (select count(*) from public.calendar_events where organization_id = 'aaaa0000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'escola B não enxerga o calendário da escola A');

-- === Soft-delete: admin remove, não-admin deixa de ver ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a0"}';
select lives_ok(
  $$ update public.calendar_events set deleted_at = now()
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'admin faz soft-delete de um evento');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select is(
  (select count(*) from public.calendar_events where id = 'e0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'responsável não vê evento soft-deletado');

select * from finish();
rollback;
