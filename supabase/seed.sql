-- =============================================================================
-- Seed SINTÉTICO para desenvolvimento local (supabase db reset).
-- NUNCA use dados reais aqui. Ver PLANO.md §7.
-- =============================================================================

insert into public.organizations (id, name, slug, timezone)
values (
  '11111111-1111-1111-1111-111111111111',
  'Instituto Cinthia França',
  'icf',
  'America/Sao_Paulo'
)
on conflict (slug) do nothing;
