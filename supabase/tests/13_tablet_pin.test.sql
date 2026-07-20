-- =============================================================================
-- PIN do tablet: hash isolado (nenhum acesso direto), operações sempre no PRÓPRIO
-- usuário, validação de formato e verificação correta.
-- Ver supabase/migrations/20260720120000_tablet_pin.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'a@pin.dev', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'b@pin.dev', now(), now());

-- === (1) Acesso direto ao hash é negado ===
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000e1"}';
select throws_ok(
  $$ select pin_hash from public.user_pins $$,
  '42501',
  'authenticated não lê a tabela de PINs diretamente (grants revogados)');

-- === (2) Validação de formato ===
select throws_ok(
  $$ select public.set_my_pin('12') $$,
  'P0001',
  'PIN curto demais é rejeitado');

-- === (3) Define PIN do próprio usuário ===
select lives_ok(
  $$ select public.set_my_pin('4821') $$,
  'usuário define o próprio PIN');

-- === (4)/(5) Verificação ===
select is(
  (select public.verify_my_pin('4821')),
  true,
  'PIN correto verifica');
select is(
  (select public.verify_my_pin('0000')),
  false,
  'PIN errado não verifica');

-- === (6) has_my_pin reflete ===
select is(
  (select public.has_my_pin()),
  true,
  'has_my_pin true após definir');

-- === (7)/(8) Isolamento entre usuários ===
set local "request.jwt.claims" to '{"sub":"b0000000-0000-0000-0000-0000000000e1"}';
select is(
  (select public.has_my_pin()),
  false,
  'usuário B não tem PIN (não vê o de A)');
select is(
  (select public.verify_my_pin('4821')),
  false,
  'usuário B não valida com o PIN de A');

-- === (9) Remoção ===
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-0000000000e1"}';
select public.clear_my_pin();
select is(
  (select public.has_my_pin()),
  false,
  'has_my_pin false após remover');

select * from finish();
rollback;
