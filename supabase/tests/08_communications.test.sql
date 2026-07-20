-- =============================================================================
-- Comunicado + "Ciente": publica admin (qualquer) ou professor (só a própria turma);
-- responsável dá "Ciente" (imutável, 1x) só em comunicado que pode ver; nada vaza
-- entre escolas. Ver supabase/migrations/*_communications.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(11);

-- --- Seed (superusuário) ---
insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Escola A', 'escola-a-com'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Escola B', 'escola-b-com');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a0',
   'authenticated', 'authenticated', 'admin.a@com.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a7',
   'authenticated', 'authenticated', 'teacher.a1@com.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a9',
   'authenticated', 'authenticated', 'guardian.a@com.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b7',
   'authenticated', 'authenticated', 'teacher.b@com.dev', now(), now());

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

insert into public.communications (id, organization_id, class_id, title, body) values
  ('f0000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000a1', null, 'Reunião geral', 'Sexta 18h'),
  ('f0000000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'Passeio A1', 'Levar boné'),
  ('f0000000-0000-0000-0000-0000000000a2', 'aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a2', 'Aviso A2', 'Só turma A2');

-- === PUBLICAÇÃO ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a0"}';
select lives_ok(
  $$ insert into public.communications (organization_id, class_id, title, body)
     values ('aaaa0000-0000-0000-0000-0000000000a1', null, 'Comunicado admin', 'ok') $$,
  'admin publica comunicado da escola inteira');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select lives_ok(
  $$ insert into public.communications (organization_id, class_id, title, body)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'Aviso da turma', 'ok') $$,
  'professor publica comunicado da própria turma');

select throws_ok(
  $$ insert into public.communications (organization_id, class_id, title, body)
     values ('aaaa0000-0000-0000-0000-0000000000a1', null, 'Forjado geral', 'x') $$,
  '42501',
  'professor NÃO publica comunicado da escola inteira');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select throws_ok(
  $$ insert into public.communications (organization_id, class_id, title, body)
     values ('aaaa0000-0000-0000-0000-0000000000a1', null, 'Forjado resp', 'x') $$,
  '42501',
  'responsável NÃO publica comunicado');

-- === "CIENTE" ===
select lives_ok(
  $$ insert into public.communication_acks (organization_id, communication_id, child_id)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-000000000001',
             'c8aa0000-0000-0000-0000-0000000000a1') $$,
  'responsável dá "Ciente" num comunicado da escola inteira');

select is(
  (select guardian_id from public.communication_acks
    where communication_id = 'f0000000-0000-0000-0000-000000000001' limit 1),
  'a0000000-0000-0000-0000-0000000000a9'::uuid,
  'guardian_id do Ciente é fixado no próprio usuário (não forjável)');

select throws_ok(
  $$ insert into public.communication_acks (organization_id, communication_id)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000a2') $$,
  '42501',
  'responsável NÃO dá Ciente em comunicado de outra turma');

select throws_ok(
  $$ insert into public.communication_acks (organization_id, communication_id)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-000000000001') $$,
  '23505',
  'Ciente é único por responsável/comunicado (sem duplicar)');

-- Professor NÃO consta no livro de aceites (só responsáveis dão "Ciente").
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select throws_ok(
  $$ insert into public.communication_acks (organization_id, communication_id)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-000000000001') $$,
  '42501',
  'professor não dá "Ciente" em comunicado geral (só responsáveis)');

-- === Cross-tenant + imutabilidade ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000b7"}';
select is(
  (select count(*) from public.communications
    where organization_id = 'aaaa0000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'escola B não enxerga comunicados da escola A');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a0"}';
select throws_ok(
  $$ update public.communications set title = 'editado'
     where id = 'f0000000-0000-0000-0000-000000000001' $$,
  '42501',
  'comunicado é imutável (UPDATE negado até p/ admin)');

select * from finish();
rollback;
