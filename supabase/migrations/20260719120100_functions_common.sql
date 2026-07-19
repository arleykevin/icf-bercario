-- =============================================================================
-- Fase 0 · Funções comuns
-- =============================================================================

-- Mantém updated_at coerente em qualquer tabela com trigger BEFORE UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
