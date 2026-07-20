-- =============================================================================
-- Fase 1 · Diário de Bordo (diary_entries): tabela POLIMÓRFICA e PARTICIONADA.
-- Uma única tabela p/ todos os tipos de evento (mamar, dormir, trocar, humor,
-- febre, atividade, nota) → 1 timeline, 1 conjunto de policies, insert em lote
-- trivial. Detalhes por tipo em colunas comuns + payload jsonb. Ver PLANO.md §4.2.
--
-- Segurança estrutural (mesma lição da auditoria RLS do núcleo):
--  - FK COMPOSTA (organization_id, child_id) → children(organization_id, id):
--    impossível registrar diário para criança de OUTRA escola.
--  - class_id é DENORMALIZADO e derivado por TRIGGER a partir da matrícula ativa
--    da própria criança — o cliente NÃO escolhe a turma (senão daria p/ forjar
--    class_id e vazar a entrada p/ professores de outra turma).
--  - Diário é APPEND-ONLY/IMUTÁVEL: sem UPDATE/DELETE via RLS (ver *_diary_rls).
--    Correção = novo registro (LGPD art. 18 → histórico não se apaga; PLANO §5).
-- =============================================================================

create type public.diary_entry_type as enum
  ('feeding', 'sleep', 'diaper', 'health', 'medication', 'mood', 'activity', 'note');

create table public.diary_entries (
  id                  uuid not null default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  child_id            uuid not null,
  class_id            uuid references public.classes(id) on delete set null,  -- denormalizado (trigger)
  entry_type          public.diary_entry_type not null,
  occurred_at         timestamptz not null default now(),   -- quando o fato aconteceu (chave de partição)
  note                text,
  temperature_c       numeric(3,1),                          -- febre (só health)
  medication_admin_id uuid,                                  -- FK lógica p/ Fase 1.1 (medicamento assinado)
  payload             jsonb not null default '{}'::jsonb,    -- extras tipados por tipo (validados por zod na borda)
  batch_id            uuid,                                  -- agrupa "ações em lote" (registro p/ vários de uma vez)
  idempotency_key     uuid not null default gen_random_uuid(),  -- dedupe do outbox offline (Fase 1.1)
  recorded_by         uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  -- PK inclui a chave de partição (exigência do Postgres p/ tabela particionada).
  primary key (id, occurred_at),
  -- Idempotência do outbox: a chave de partição precisa entrar no unique. Como a
  -- idempotency_key é um UUID gerado 1x por evento (com seu occurred_at fixo), isto
  -- é tão forte quanto (organization_id, idempotency_key) para o caso do outbox.
  constraint diary_entries_idem_key unique (organization_id, idempotency_key, occurred_at),
  -- Anti-forja cross-tenant: a criança tem de ser DA MESMA organização.
  constraint diary_entries_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade,
  constraint diary_entries_temp_chk
    check (temperature_c is null or (temperature_c >= 30 and temperature_c <= 45)),
  constraint diary_entries_payload_chk
    check (jsonb_typeof(payload) = 'object')
) partition by range (occurred_at);

-- Partição default (catch-all). Particionamento mensal via pg_partman fica p/ o
-- endurecimento — com volume baixo, a default resolve e mantém a estrutura pronta.
create table public.diary_entries_default
  partition of public.diary_entries default;

-- Índices das consultas quentes (timeline por criança / por turma; lote).
create index diary_entries_child_time_idx
  on public.diary_entries (child_id, occurred_at desc) where deleted_at is null;
create index diary_entries_class_time_idx
  on public.diary_entries (class_id, occurred_at desc) where deleted_at is null;
create index diary_entries_batch_idx
  on public.diary_entries (batch_id) where batch_id is not null;

create trigger diary_entries_set_updated_at
  before update on public.diary_entries
  for each row execute function public.set_updated_at();

-- Guard de inserção do diário:
--  1) class_id é SEMPRE derivado da matrícula ativa da criança (ignora valor do
--     cliente) — a enrollment é garantidamente da mesma org (FK composta), então o
--     SECURITY DEFINER não consegue setar turma de outra org.
--  2) occurred_at é limitado a uma faixa sã — num registro médico-legal IMUTÁVEL,
--     não deixa antedatar/pós-datar arbitrariamente (o carimbo à prova de adulteração
--     de fato é created_at = now()). CHECK não serve aqui porque now() não é immutable.
create or replace function public.diary_entries_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.occurred_at > now() + interval '1 day'
     or new.occurred_at < now() - interval '400 days' then
    raise exception 'occurred_at fora da faixa permitida (% )', new.occurred_at
      using errcode = 'check_violation';
  end if;

  select e.class_id into new.class_id
  from public.enrollments e
  where e.child_id = new.child_id
    and e.status = 'active'
    and e.deleted_at is null
  order by e.started_at desc
  limit 1;

  return new;
end;
$$;

create trigger diary_entries_before_insert
  before insert on public.diary_entries
  for each row execute function public.diary_entries_before_insert();
