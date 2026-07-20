-- =============================================================================
-- Rate limiting (infra, não-tenant). Verifica que:
--  (1) a tabela de contadores nega acesso direto a anon/authenticated mesmo COM
--      linha presente (prova a RLS, não "tabela vazia");
--  (2) os RPCs NÃO são executáveis por anon/authenticated (só service_role);
--  (3) touch: janela fixa libera até o limite e bloqueia depois;
--  (4) peek não incrementa e reflete o estouro; reset zera.
-- Ver supabase/migrations/20260720100000_rate_limit.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(10);

-- Semeia uma linha como service_role (bypassa RLS) para os testes de leitura
-- provarem que a RLS ESCONDE (e não que a tabela está vazia).
set local role service_role;
insert into public.rate_limit_counters (bucket, identifier, window_start, hits)
values ('seed', 'seed-id', now(), 1);

-- === (1) Acesso direto negado mesmo com linha presente ===
set local role anon;
select is(
  (select count(*)::int from public.rate_limit_counters),
  0,
  'anon não enxerga contador existente (RLS deny-by-default esconde a linha)');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.rate_limit_counters),
  0,
  'authenticated não enxerga o contador');

-- === (2) RPCs não-executáveis por não-serviço ===
set local role anon;
select throws_ok(
  $$ select public.rate_limit_touch('x', 'y', 1, 60) $$,
  '42501',
  'anon não executa rate_limit_touch');
select throws_ok(
  $$ select public.rate_limit_peek('x', 'y', 1, 60) $$,
  '42501',
  'anon não executa rate_limit_peek');

set local role authenticated;
select throws_ok(
  $$ select public.rate_limit_reset('x', 'y') $$,
  '42501',
  'authenticated não executa rate_limit_reset');

-- === (3) touch: janela fixa libera até o limite, bloqueia depois ===
set local role service_role;
select is(
  (select allowed from public.rate_limit_touch('t_login', 'ip-1', 2, 300)),
  true,
  '1ª batida dentro do limite (max 2)');
select is(
  (select allowed from public.rate_limit_touch('t_login', 'ip-1', 2, 300)),
  true,
  '2ª batida ainda dentro do limite');
select is(
  (select allowed from public.rate_limit_touch('t_login', 'ip-1', 2, 300)),
  false,
  '3ª batida estoura o limite → bloqueada');

-- === (4) peek reflete o estouro sem incrementar; reset zera ===
select is(
  (select allowed from public.rate_limit_peek('t_login', 'ip-1', 2, 300)),
  false,
  'peek vê o estouro (hits=3 >= max=2) sem contar nova batida');

select rate_limit_reset('t_login', 'ip-1');
select is(
  (select allowed from public.rate_limit_peek('t_login', 'ip-1', 2, 300)),
  true,
  'após reset, peek libera de novo (contador zerado)');

select * from finish();
rollback;
