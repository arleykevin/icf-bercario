-- =============================================================================
-- Offboarding: só admin remove acesso; trava o último admin; desativa vínculo e
-- (se saiu de tudo) o profile; auditoria imutável e isolada por tenant.
-- Ver supabase/migrations/20260720110000_offboarding.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(13);

insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-0000000000f1', 'Escola A', 'escola-a-off'),
  ('bbbb0000-0000-0000-0000-0000000000f1', 'Escola B', 'escola-b-off');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000f0',
   'authenticated', 'authenticated', 'admina@off.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000f2',
   'authenticated', 'authenticated', 'admin2a@off.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000f7',
   'authenticated', 'authenticated', 'teachera@off.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000f0',
   'authenticated', 'authenticated', 'adminb@off.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f0', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f2', 'admin'),
  ('aaaa0000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f7', 'teacher'),
  ('bbbb0000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-0000000000f0', 'admin');

-- === (1) Não-admin não faz offboarding ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000f7"}';
select throws_ok(
  $$ select public.offboard_member(
       'aaaa0000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f7') $$,
  '42501',
  'professor (não-admin) não pode remover acessos');

-- === (1b) Self-offboard bloqueado no RPC ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000f0"}';
select throws_ok(
  $$ select public.offboard_member(
       'aaaa0000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f0') $$,
  'P0001',
  'admin não remove o próprio acesso (self-check no RPC)');

-- === (1c) Cross-tenant: admin da org A não faz offboarding na org B ===
select throws_ok(
  $$ select public.offboard_member(
       'bbbb0000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-0000000000f0') $$,
  '42501',
  'admin da org A não faz offboarding na org B');

-- === (2) Admin remove professor (offboarding total: sem outro vínculo) ===
select is(
  (select fully_offboarded from public.offboard_member(
     'aaaa0000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f7')),
  true,
  'admin remove professor e é offboarding total');

-- === (3)/(4) Efeitos (checados via service_role, que bypassa RLS) ===
set local role service_role;
select is(
  (select bool_or(is_active) from public.org_members
    where organization_id = 'aaaa0000-0000-0000-0000-0000000000f1'
      and profile_id = 'a0000000-0000-0000-0000-0000000000f7'),
  false,
  'vínculo do professor foi desativado');
select is(
  (select is_active from public.profiles
    where id = 'a0000000-0000-0000-0000-0000000000f7'),
  false,
  'profile do professor desativado (não é membro de nenhuma escola)');

-- === (5) Trava do último admin ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000f0"}';
select throws_ok(
  $$ select public.offboard_member(
       'bbbb0000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-0000000000f0') $$,
  'P0001',
  'não remove o último administrador da escola');

-- === (6) Remove 2º admin quando resta outro ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000f0"}';
select is(
  (select fully_offboarded from public.offboard_member(
     'aaaa0000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f2')),
  true,
  'admin remove o 2º admin (ainda resta um)');

-- === (7) Auditoria visível ao admin da org ===
select cmp_ok(
  (select count(*)::int from public.audit_events
    where organization_id = 'aaaa0000-0000-0000-0000-0000000000f1'),
  '>=', 2,
  'auditoria registra as remoções para o admin da org A');

-- === (8) Isolamento por tenant ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000f0"}';
select is(
  (select count(*)::int from public.audit_events
    where organization_id = 'aaaa0000-0000-0000-0000-0000000000f1'),
  0,
  'admin da org B não vê a auditoria da org A');

-- === (9) Auditoria imutável (sem INSERT para authenticated) ===
select throws_ok(
  $$ insert into public.audit_events (organization_id, action)
     values ('bbbb0000-0000-0000-0000-0000000000f1', 'forjado') $$,
  '42501',
  'auditoria é append-only: authenticated não insere');
select throws_ok(
  $$ update public.audit_events set action = 'x' $$,
  '42501',
  'auditoria é append-only: authenticated não faz UPDATE');
select throws_ok(
  $$ delete from public.audit_events $$,
  '42501',
  'auditoria é append-only: authenticated não faz DELETE');

select * from finish();
rollback;
