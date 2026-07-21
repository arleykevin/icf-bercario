-- =============================================================================
-- Retenção / eliminação LGPD (PLANO.md §4.3, §8 item 14) — Fase 2.
--
-- Tabela de temporalidade (art. 15/16 LGPD): dado deixa de ser mantido quando a
-- finalidade se encerra. Ao SAIR a criança (children.deleted_at), o diário de
-- ROTINA e as FOTOS são ELIMINADOS após um período de carência (default 90 dias,
-- decisão do projeto; ajustável por escola em organizations.settings).
--
-- RETIDOS por mais tempo (prazo de responsabilização): registros de SAÚDE e de
-- MEDICAMENTO (entry_type health/medication) e as tabelas medication_* — não são
-- tocados aqui. Idem comunicados/presença (registro institucional).
--
-- A eliminação é DEFINITIVA (hard delete): o diário é imutável para os usuários
-- (append-only via RLS), mas esta função roda como owner (SECURITY DEFINER) e a
-- eliminação por temporalidade é uma exceção legítima e auditada. As FOTOS ficam
-- no Storage; a função retorna os caminhos para o cron apagá-las de lá.
-- =============================================================================

create or replace function public.run_diary_retention(p_default_grace integer default 90)
returns table(org_id uuid, deleted_count integer, media_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Elimina o diário de rotina de crianças que saíram há mais que a carência,
  -- capturando (org, media_path) do que foi apagado.
  --
  -- A carência por-org vem de organizations.settings, que QUALQUER admin pode
  -- gravar livremente. Por isso o parse é DEFENSIVO: só aceita dígitos (regex),
  -- senão cai no default — um valor inválido de UMA escola NÃO pode abortar a
  -- rotina (que processa todas numa CTE só) nem desligar a eliminação da
  -- plataforma inteira. Teto de 3650 dias (~10 anos) impede reter indefinidamente.
  drop table if exists _purged;
  create temporary table _purged on commit drop as
  with expired_children as (
    select c.id as child_id, c.organization_id
    from public.children c
    join public.organizations o on o.id = c.organization_id
    where c.deleted_at is not null
      and c.deleted_at < clock_timestamp() - make_interval(
        days => least(
          greatest(
            coalesce(
              case
                when o.settings ->> 'diary_retention_days' ~ '^\d+$'
                  then (o.settings ->> 'diary_retention_days')::int
                else null
              end,
              p_default_grace
            ),
            1
          ),
          3650
        )
      )
  ),
  del as (
    delete from public.diary_entries d
    where d.entry_type not in ('health', 'medication')
      and (d.organization_id, d.child_id) in (
        select organization_id, child_id from expired_children
      )
    returning d.organization_id as organization_id, d.media_path as media_path
  )
  select organization_id, media_path from del;

  -- Auditoria por organização (accountability LGPD). actor nulo = rotina do sistema.
  insert into public.audit_events (organization_id, actor_id, action, metadata)
  select p.organization_id, null, 'data.retention_purge',
         jsonb_build_object('diario_eliminado', count(*))
  from _purged p
  group by p.organization_id;

  return query
  select p.organization_id,
         count(*)::int,
         array_remove(array_agg(p.media_path), null)
  from _purged p
  group by p.organization_id;
end;
$$;

-- Rotina de sistema: só service_role (chamada pelo cron via admin client).
revoke all on function public.run_diary_retention(integer) from public, anon, authenticated;
grant execute on function public.run_diary_retention(integer) to service_role;
