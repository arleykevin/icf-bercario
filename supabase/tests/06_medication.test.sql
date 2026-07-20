-- =============================================================================
-- Medicamento: só o RESPONSÁVEL LEGAL assina a autorização (imutável, assinada);
-- o educador administra dentro da validade; responsável não administra; nada vaza
-- entre escolas; administered_at é quase-tempo-real (não-repúdio). Ver
-- supabase/migrations/*_medication.sql e a auditoria adversarial (A1/M2/M3).
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(11);

-- --- Seed (superusuário) ---
insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'Escola A', 'escola-a-med'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'Escola B', 'escola-b-med');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a0',
   'authenticated', 'authenticated', 'admin.a@med.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a7',
   'authenticated', 'authenticated', 'teacher.a@med.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a9',
   'authenticated', 'authenticated', 'legal.a@med.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b7',
   'authenticated', 'authenticated', 'teacher.b@med.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a0', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7', 'teacher'),
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'guardian'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b7', 'teacher');

insert into public.classes (id, organization_id, name) values
  ('c1aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Berçário A');

insert into public.children (id, organization_id, full_name, birth_date) values
  ('c8aa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000a1', 'Criança A', '2024-01-10');

insert into public.enrollments (organization_id, child_id, class_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1');

insert into public.class_teachers (organization_id, class_id, teacher_id) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c1aa0000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a7');

-- Responsável LEGAL da criança A.
insert into public.guardianships (organization_id, child_id, guardian_id, relationship, is_legal_guardian) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
   'a0000000-0000-0000-0000-0000000000a9', 'mãe', true);

-- === RESPONSÁVEL LEGAL assina autorizações ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';

select lives_ok(
  $$ insert into public.medication_authorizations
       (id, organization_id, child_id, medication_name, dosage, route, valid_until)
     values ('d1000000-0000-0000-0000-0000000000d1',
             'aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'Dipirona', '10 gotas', 'oral', current_date + 7) $$,
  'responsável legal assina autorização de medicamento');

select ok(
  (select signature_hash is not null and signed_by = 'a0000000-0000-0000-0000-0000000000a9'
   from public.medication_authorizations where id = 'd1000000-0000-0000-0000-0000000000d1'),
  'assinatura fixada pelo servidor (hash + signed_by = quem assinou)');

select lives_ok(
  $$ insert into public.medication_authorizations
       (id, organization_id, child_id, medication_name, dosage, valid_from, valid_until)
     values ('d1000000-0000-0000-0000-0000000000d2',
             'aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'Amoxicilina', '5 ml', current_date - 10, current_date - 1) $$,
  'autorização vencida pode ser criada (a validade é checada na administração)');

-- === PROFESSOR não assina (só o responsável legal) ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a7"}';
select throws_ok(
  $$ insert into public.medication_authorizations
       (organization_id, child_id, medication_name, dosage, valid_until)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'Ibuprofeno', '3 ml', current_date + 5) $$,
  '42501',
  'professor NÃO assina autorização (só o responsável legal)');

-- === PROFESSOR administra dentro da validade e emite evento no diário ===
select lives_ok(
  $$ insert into public.medication_administrations
       (organization_id, child_id, authorization_id, status)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'd1000000-0000-0000-0000-0000000000d1', 'administered') $$,
  'professor administra com autorização vigente');

select ok(
  exists (select 1 from public.diary_entries
          where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'
            and entry_type = 'medication'),
  'administração emitiu o evento medication na timeline');

-- === Administração fora da validade (na data) é barrada ===
select throws_ok(
  $$ insert into public.medication_administrations
       (organization_id, child_id, authorization_id, status)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'd1000000-0000-0000-0000-0000000000d2', 'administered') $$,
  '23514',
  'não administra com autorização fora da validade');

-- === administered_at antedatado é barrado (A1) ===
select throws_ok(
  $$ insert into public.medication_administrations
       (organization_id, child_id, authorization_id, status, administered_at)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'd1000000-0000-0000-0000-0000000000d1', 'administered', now() - interval '2 days') $$,
  '23514',
  'administered_at antedatado é rejeitado (registro em tempo quase real)');

-- === RESPONSÁVEL não administra ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a9"}';
select throws_ok(
  $$ insert into public.medication_administrations
       (organization_id, child_id, authorization_id, status)
     values ('aaaa0000-0000-0000-0000-0000000000a1', 'c8aa0000-0000-0000-0000-0000000000a1',
             'd1000000-0000-0000-0000-0000000000d1', 'administered') $$,
  '42501',
  'responsável NÃO administra medicamento (só educador/admin)');

-- === Imutabilidade: nem admin edita a autorização ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000a0"}';
select throws_ok(
  $$ update public.medication_authorizations set dosage = '20 gotas'
     where id = 'd1000000-0000-0000-0000-0000000000d1' $$,
  '42501',
  'autorização é imutável (UPDATE negado até p/ admin)');

-- === Cross-tenant: outra escola não enxerga ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000b7"}';
select is(
  (select count(*) from public.medication_authorizations
    where child_id = 'c8aa0000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'escola B não enxerga autorização de medicamento da escola A');

select * from finish();
rollback;
