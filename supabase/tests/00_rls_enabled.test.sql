-- =============================================================================
-- Meta-teste de segurança: QUEBRA o build se qualquer tabela do schema public
-- ficar sem RLS. Este é o backstop contra a falha nº1 do projeto (RLS ausente).
-- Ver PLANO.md §5.4 (ameaça #1) e §7.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(1);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and rowsecurity = false),
  0,
  'Toda tabela em public tem RLS habilitada (deny-by-default)'
);

select * from finish();
rollback;
