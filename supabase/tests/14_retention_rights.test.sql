-- =============================================================================
-- Retenção LGPD + direitos do titular.
--  Retenção: run_diary_retention elimina o diário de ROTINA de criança que saiu
--  há mais que a carência, RETÉM saúde/medicamento, e não toca quem não expirou;
--  não é executável por authenticated.
--  Direitos: responsável registra pedido do próprio filho (autoria fixada);
--  não-responsável é barrado; admin resolve; não-admin não; isolamento por tenant.
-- Ver 20260720130000_retention.sql e 20260720140000_data_requests.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(11);

insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000d1', 'Escola A', 'escola-a-ret'),
  ('bbbb0000-0000-0000-0000-0000000000d1', 'Escola B', 'escola-b-ret');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000d0',
   'authenticated', 'authenticated', 'admina@ret.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000d9',
   'authenticated', 'authenticated', 'guard@ret.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000d8',
   'authenticated', 'authenticated', 'teacher@ret.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000d0',
   'authenticated', 'authenticated', 'adminb@ret.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d0', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d9', 'guardian'),
  ('aaaa0000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d8', 'teacher'),
  ('bbbb0000-0000-0000-0000-0000000000d1', 'b0000000-0000-0000-0000-0000000000d0', 'admin');

insert into public.children (id, organization_id, full_name, birth_date, deleted_at) values
  ('c8aa0000-0000-0000-0000-0000000000d1', 'aaaa0000-0000-0000-0000-0000000000d1',
   'Criança que saiu', '2023-01-10', now() - interval '100 days'),
  ('c8aa0000-0000-0000-0000-0000000000d2', 'aaaa0000-0000-0000-0000-0000000000d1',
   'Criança ativa', '2023-02-10', null);

insert into public.guardianships
  (organization_id, child_id, guardian_id, relationship, is_legal_guardian) values
  ('aaaa0000-0000-0000-0000-0000000000d1', 'c8aa0000-0000-0000-0000-0000000000d2',
   'a0000000-0000-0000-0000-0000000000d9', 'mãe', true);

-- Diário: 2 rotina + 1 saúde para quem saiu; 1 rotina para quem ficou.
insert into public.diary_entries (organization_id, child_id, entry_type, occurred_at) values
  ('aaaa0000-0000-0000-0000-0000000000d1', 'c8aa0000-0000-0000-0000-0000000000d1', 'feeding', now() - interval '100 days'),
  ('aaaa0000-0000-0000-0000-0000000000d1', 'c8aa0000-0000-0000-0000-0000000000d1', 'sleep',   now() - interval '100 days'),
  ('aaaa0000-0000-0000-0000-0000000000d1', 'c8aa0000-0000-0000-0000-0000000000d1', 'health',  now() - interval '100 days'),
  ('aaaa0000-0000-0000-0000-0000000000d1', 'c8aa0000-0000-0000-0000-0000000000d2', 'feeding', now() - interval '100 days');

-- === (1) Retenção não é executável por authenticated ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000d0"}';
select throws_ok(
  $$ select public.run_diary_retention(90) $$,
  '42501',
  'run_diary_retention não é executável por authenticated');

-- === Roda o purge como serviço ===
set local role service_role;
-- Um valor de settings INVÁLIDO não pode derrubar a rotina (cai no default):
update public.organizations
  set settings = '{"diary_retention_days":"trinta"}'::jsonb
  where id = 'aaaa0000-0000-0000-0000-0000000000d1';
select public.run_diary_retention(90);

-- === (2)/(3)/(4) Efeitos ===
select is(
  (select count(*)::int from public.diary_entries
    where child_id = 'c8aa0000-0000-0000-0000-0000000000d1'
      and entry_type in ('feeding', 'sleep')),
  0,
  'diário de rotina de quem saiu foi eliminado');
select is(
  (select count(*)::int from public.diary_entries
    where child_id = 'c8aa0000-0000-0000-0000-0000000000d1'
      and entry_type = 'health'),
  1,
  'registro de saúde é RETIDO (prazo de responsabilização)');
select is(
  (select count(*)::int from public.diary_entries
    where child_id = 'c8aa0000-0000-0000-0000-0000000000d2'),
  1,
  'diário de quem NÃO saiu é preservado');

-- === (5) Responsável registra pedido do próprio filho ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000d9"}';
select lives_ok(
  $$ insert into public.data_requests (organization_id, child_id, request_type)
     values ('aaaa0000-0000-0000-0000-0000000000d1',
             'c8aa0000-0000-0000-0000-0000000000d2', 'access') $$,
  'responsável registra pedido de acesso');

-- === (6) Autoria fixada pelo trigger ===
set local role service_role;
select is(
  (select requested_by from public.data_requests
    where child_id = 'c8aa0000-0000-0000-0000-0000000000d2'),
  'a0000000-0000-0000-0000-0000000000d9'::uuid,
  'requested_by fixado no servidor = responsável');

-- === (7) Não-responsável é barrado ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000d8"}';
select throws_ok(
  $$ insert into public.data_requests (organization_id, child_id, request_type)
     values ('aaaa0000-0000-0000-0000-0000000000d1',
             'c8aa0000-0000-0000-0000-0000000000d2', 'deletion') $$,
  '42501',
  'professor (não-responsável) não registra pedido');

-- === (8) Responsável vê o próprio pedido ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000d9"}';
select is(
  (select count(*)::int from public.data_requests
    where child_id = 'c8aa0000-0000-0000-0000-0000000000d2'),
  1,
  'responsável vê o próprio pedido');

-- === (9) Admin resolve ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000d0"}';
select lives_ok(
  $$ update public.data_requests set status = 'done'
     where child_id = 'c8aa0000-0000-0000-0000-0000000000d2' $$,
  'admin resolve o pedido');

-- === (10) Não-admin não altera o status (RLS de update) ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000d9"}';
update public.data_requests set status = 'rejected'
  where child_id = 'c8aa0000-0000-0000-0000-0000000000d2';
set local role service_role;
select is(
  (select status from public.data_requests
    where child_id = 'c8aa0000-0000-0000-0000-0000000000d2'),
  'done',
  'update do responsável não altera o status (só admin resolve)');

-- === (11) Isolamento por tenant ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000d0"}';
select is(
  (select count(*)::int from public.data_requests
    where organization_id = 'aaaa0000-0000-0000-0000-0000000000d1'),
  0,
  'admin da org B não vê pedidos da org A');

select * from finish();
rollback;
