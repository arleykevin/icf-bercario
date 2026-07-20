-- =============================================================================
-- Fase 1 (v2 antecipada, pedido do usuário) · Calendário: cardápio da semana +
-- eventos institucionais. Multi-tenant; escopo por escola (class_id null) ou por
-- turma. Diferente do diário/medicamento, é dado OPERACIONAL (mutável) — a gestão
-- cria/edita/exclui (soft-delete). Ver PLANO.md §3 (v2) e memory projeto-calendario.
--
-- Segurança: RLS deny-by-default com is_org_member 1º. Eventos da escola inteira
-- (class_id null) todos os membros veem; eventos de turma só a turma (professor/
-- responsável) + admin. Escrita só admin. FK composta impede apontar turma de outra
-- escola.
-- =============================================================================

create type public.calendar_event_type as enum ('meal', 'event', 'holiday', 'reminder');

create table public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_id        uuid,                       -- null = escola inteira
  event_type      public.calendar_event_type not null default 'event',
  title           text not null,
  description     text,
  event_date      date not null,
  start_time      time,                       -- null = dia inteiro
  end_time        time,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- FK composta: evento de turma só aponta turma DA MESMA org (nullable = ignora se null).
  constraint calendar_class_tenant_fk
    foreign key (organization_id, class_id)
    references public.classes (organization_id, id) on delete cascade,
  constraint calendar_time_chk check (end_time is null or start_time is null or end_time >= start_time)
);
create index calendar_org_date_idx
  on public.calendar_events (organization_id, event_date) where deleted_at is null;
create index calendar_class_date_idx
  on public.calendar_events (class_id, event_date) where deleted_at is null;

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- Autoria server-authoritative (auditoria): created_by é sempre quem inseriu.
create or replace function public.calendar_set_creator()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;
create trigger calendar_events_set_creator
  before insert on public.calendar_events
  for each row execute function public.calendar_set_creator();

-- RLS -----------------------------------------------------------------------
alter table public.calendar_events enable row level security;

grant select, insert, update, delete on public.calendar_events to authenticated;

-- LEITURA: membro da org vê eventos da escola inteira; eventos de turma só a turma
-- (professor/responsável) + admin. Não-admin não vê soft-deletado.
create policy calendar_select on public.calendar_events
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (
        deleted_at is null and (
          class_id is null
          or public.teaches_class(class_id)
          or public.guardian_in_class(class_id)
        )
      )
    )
  );

-- ESCRITA (criar/editar/excluir): só a gestão (admin da org).
create policy calendar_admin_write on public.calendar_events
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
