-- =============================================================================
-- Diário de Bordo: quem CUIDA registra, quem é RESPONSÁVEL lê, nada atravessa a
-- fronteira entre escolas, o diário é IMUTÁVEL (append-only) e a FK composta
-- impede forjar entrada para criança de outra org.
--
-- Diferente de 02 (que testa os helpers), aqui exercemos as POLICIES de verdade:
-- o runner roda como superusuário (ignora RLS), então trocamos para
-- `role authenticated` + jwt.claims para a RLS valer. Ver supabase/migrations/
-- *_diary*.sql e PLANO.md §5.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(13);

-- --- Seed (como superusuário, ignorando RLS) ---
insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Escola A', 'escola-a-diary'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Escola B', 'escola-b-diary');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a0',
   'authenticated', 'authenticated', 'admin.a@diary.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a7',
   'authenticated', 'authenticated', 'teacher.a@diary.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a9',
   'authenticated', 'authenticated', 'guardian.a@diary.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b7',
   'authenticated', 'authenticated', 'teacher.b@diary.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a0', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7', 'teacher'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'guardian'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b7', 'teacher');

-- Duas turmas na Escola A: o professor A leciona SÓ a turma A (não a A2).
insert into public.classes (id, organization_id, name) values
  ('c1aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Berçário A'),
  ('c1aa0000-0000-0000-0000-0000000000a2', 'aaaa0000-0000-0000-0000-0000000000a1', 'Berçário A2'),
  ('c1bb0000-0000-0000-0000-0000000000b1', 'bbbb0000-0000-0000-0000-0000000000b1', 'Berçário B');

insert into public.children (id, organization_id, full_name, birth_date) values
  ('c8aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Criança A',  '2024-01-10'),
  ('c8aa0000-0000-0000-0000-0000000000a2', 'aaaa0000-0000-0000-0000-0000000000a1', 'Criança A2', '2024-03-10'),
  ('c8bb0000-0000-0000-0000-0000000000b1', 'bbbb0000-0000-0000-0000-0000000000b1', 'Criança B',  '2024-02-20');

insert into public.enrollments (organization_id, child_id, class_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a2', 'c1aa0000-0000-0000-0000-0000000000a2'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'c8bb0000-0000-0000-0000-0000000000b1', 'c1bb0000-0000-0000-0000-0000000000b1');

insert into public.class_teachers (organization_id, class_id, teacher_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7');

insert into public.guardianships (organization_id, child_id, guardian_id, relationship) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'mãe');

-- =========================================================================
-- PROFESSOR A registra e o trigger deriva a turma
-- =========================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';

select lives_ok(
  $$ insert into public.diary_entries
       (organization_id, child_id, entry_type, occurred_at, recorded_by, note, payload)
     values ('aaaa0000-0000-0000-0000-0000000000a1',
             'c8aa0000-0000-0000-0000-0000000000a1',
             'feeding', now(),
             'a0000000-0000-0000-0000-0000000000a7',
             'Mamou bem', '{"item":"papa","acceptance":"boa"}'::jsonb) $$,
  'professor registra diário do próprio aluno');

select is(
  (select class_id from public.diary_entries
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1' and entry_type = 'feeding'
    limit 1),
  'c1aa0000-0000-0000-0000-0000000000a1'::uuid,
  'trigger derivou class_id da matrícula ativa (cliente não escolhe a turma)');

-- =========================================================================
-- RESPONSÁVEL A: lê o diário do filho, mas NÃO registra
-- =========================================================================
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';

select is(
  (select count(*) from public.diary_entries
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'responsável lê o diário do próprio filho');

select throws_ok(
  $$ insert into public.diary_entries (organization_id, child_id, entry_type, recorded_by)
     values ('aaaa0000-0000-0000-0000-0000000000a1',
             'c8aa0000-0000-0000-0000-0000000000a1',
             'note', 'a0000000-0000-0000-0000-0000000000a9') $$,
  '42501',
  'responsável NÃO registra diário (é leitor)');

-- =========================================================================
-- PROFESSOR B (outra escola): não lê nem escreve na Escola A
-- =========================================================================
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000b7"}';

select is(
  (select count(*) from public.diary_entries
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'professor de outra escola não enxerga o diário (isolamento de tenant)');

select throws_ok(
  $$ insert into public.diary_entries (organization_id, child_id, entry_type, recorded_by)
     values ('aaaa0000-0000-0000-0000-0000000000a1',
             'c8aa0000-0000-0000-0000-0000000000a1',
             'note', 'b0000000-0000-0000-0000-0000000000b7') $$,
  '42501',
  'professor de outra escola não registra na Escola A');

-- =========================================================================
-- PROFESSOR A: escopo por turma DENTRO da mesma escola (não registra p/ A2)
-- =========================================================================
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';

select throws_ok(
  $$ insert into public.diary_entries (organization_id, child_id, entry_type, recorded_by)
     values ('aaaa0000-0000-0000-0000-0000000000a1',
             'c8aa0000-0000-0000-0000-0000000000a2',
             'note', 'a0000000-0000-0000-0000-0000000000a7') $$,
  '42501',
  'professor não registra p/ criança de turma que não leciona (mesma escola)');

-- Faixa de occurred_at (registro médico-legal não antedata/pós-data arbitrariamente).
select throws_ok(
  $$ insert into public.diary_entries (organization_id, child_id, entry_type, occurred_at, recorded_by)
     values ('aaaa0000-0000-0000-0000-0000000000a1',
             'c8aa0000-0000-0000-0000-0000000000a1',
             'note', now() + interval '5 days',
             'a0000000-0000-0000-0000-0000000000a7') $$,
  '23514',
  'occurred_at fora da faixa é rejeitado pelo trigger');

-- Acesso DIRETO à partição folha é negado (RLS habilitada na folha + sem grant).
select throws_ok(
  $$ select 1 from public.diary_entries_default $$,
  '42501',
  'acesso direto à partição diary_entries_default é bloqueado');

-- =========================================================================
-- IMUTABILIDADE: nem o admin altera/apaga (append-only; correção = novo registro)
-- =========================================================================
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a0"}';

select throws_ok(
  $$ update public.diary_entries set note = 'editado'
     where child_id = 'c8aa0000-0000-0000-0000-0000000000a1' $$,
  '42501',
  'UPDATE negado — diário é imutável');

select throws_ok(
  $$ delete from public.diary_entries
     where child_id = 'c8aa0000-0000-0000-0000-0000000000a1' $$,
  '42501',
  'DELETE negado — diário é imutável');

select lives_ok(
  $$ insert into public.diary_entries (organization_id, child_id, entry_type, recorded_by, note)
     values ('aaaa0000-0000-0000-0000-0000000000a1',
             'c8aa0000-0000-0000-0000-0000000000a2',
             'mood', 'a0000000-0000-0000-0000-0000000000a0', 'Tranquila') $$,
  'admin registra p/ qualquer criança da escola (sem escopo de turma)');

-- =========================================================================
-- ANTI-FORJA ESTRUTURAL: mesmo ignorando a RLS, a FK composta barra vincular a
-- criança de outra org. (rodado como superusuário para isolar a FK)
-- =========================================================================
reset role;
select throws_ok(
  $$ insert into public.diary_entries (organization_id, child_id, entry_type, recorded_by)
     values ('bbbb0000-0000-0000-0000-0000000000b1',
             'c8aa0000-0000-0000-0000-0000000000a1',
             'note', 'a0000000-0000-0000-0000-0000000000a0') $$,
  '23503',
  'FK composta impede registrar diário na org B apontando p/ criança da org A');

select * from finish();
rollback;
