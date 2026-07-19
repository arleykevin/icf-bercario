-- =============================================================================
-- Testa a LÓGICA de autorização que as policies RLS usam (is_org_admin,
-- is_org_member, auth_org_id, shares_org, is_admin) com dois tenants isolados.
-- Roda como postgres e injeta a identidade via request.jwt.claims -> auth.uid()
-- (as funções são SECURITY DEFINER e leem o claim, não o role).
--
-- Escopo Fase 0: valida os predicados de isolamento entre escolas. Testes E2E de
-- VISIBILIDADE por RLS (troca de role) entram na Fase 1 com dados de turma/criança.
-- Ver PLANO.md §5.3, §5.4, §7.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(11);

-- --- Seed determinístico (rollback limpa tudo) ---
insert into public.organizations (id, name, slug) values
  ('aaaa0000-0000-0000-0000-000000000001', 'Escola A', 'escola-a'),
  ('bbbb0000-0000-0000-0000-000000000002', 'Escola B', 'escola-b');

-- Usuários do Auth: o trigger on_auth_user_created cria os profiles.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a',
   'authenticated', 'authenticated', 'admin.a@test.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-00000000001a',
   'authenticated', 'authenticated', 'guardian.a@test.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b',
   'authenticated', 'authenticated', 'admin.b@test.dev', now(), now());

insert into public.org_members (organization_id, profile_id, role) values
  ('aaaa0000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'admin'),
  ('aaaa0000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000001a', 'guardian'),
  ('bbbb0000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'admin');

-- === Identidade: ADMIN A (organização A) ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-00000000000a"}';

select ok(public.is_org_admin('aaaa0000-0000-0000-0000-000000000001'),
  'admin A é admin da org A');
select ok(not public.is_org_admin('bbbb0000-0000-0000-0000-000000000002'),
  'admin A NÃO é admin da org B (isolamento entre escolas)');
select ok(public.is_org_member('aaaa0000-0000-0000-0000-000000000001'),
  'admin A é membro da org A');
select ok(not public.is_org_member('bbbb0000-0000-0000-0000-000000000002'),
  'admin A NÃO é membro da org B');
select is(public.auth_org_id(), 'aaaa0000-0000-0000-0000-000000000001'::uuid,
  'auth_org_id() de A resolve para a org A');
select ok(public.is_admin(),
  'admin A é admin em alguma organização');
select ok(public.shares_org('a1000000-0000-0000-0000-00000000001a'),
  'admin A compartilha organização com o guardião A');
select ok(not public.shares_org('b0000000-0000-0000-0000-00000000000b'),
  'admin A NÃO compartilha organização com o admin B');

-- === Identidade: GUARDIÃO A (organização A) ===
set local "request.jwt.claims" to '{"sub":"a1000000-0000-0000-0000-00000000001a"}';

select ok(not public.is_org_admin('aaaa0000-0000-0000-0000-000000000001'),
  'guardião A NÃO é admin da org A');
select ok(public.is_org_member('aaaa0000-0000-0000-0000-000000000001'),
  'guardião A é membro da org A');
select ok(not public.is_admin(),
  'guardião A NÃO é admin de nenhuma organização');

select * from finish();
rollback;
