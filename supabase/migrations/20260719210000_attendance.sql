-- =============================================================================
-- Fase 1 (pilar MVP) · Check-in / Check-out + Presença (IMUTÁVEL)
-- Registro imutável de entrada/saída da criança: quem entregou/retirou, quando, e
-- qual educador registrou (não-repúdio). Presença = derivada do último evento do dia.
-- Ver PLANO.md §8 (item 9).
--
-- Segurança: reusa o padrão do Diário — RLS deny-by-default (is_org_member 1º),
-- FK composta por tenant, recorded_by fixado por trigger, occurred_at em tempo quase
-- real, e append-only (sem update/delete). Educador registra; responsável só lê.
-- =============================================================================

create type public.attendance_kind as enum ('checkin', 'checkout');

create table public.attendance_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  child_id         uuid not null,
  kind             public.attendance_kind not null,
  occurred_at      timestamptz not null default now(),
  recorded_by      uuid references public.profiles(id),  -- fixado por trigger
  counterpart_name text,                                  -- quem entregou/retirou (nome)
  note             text,
  created_at       timestamptz not null default now(),
  constraint attendance_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);
create index attendance_child_time_idx
  on public.attendance_events (child_id, occurred_at desc);

-- recorded_by = quem registrou; occurred_at em tempo quase real (não-repúdio).
create or replace function public.attendance_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.recorded_by := (select auth.uid());
  if new.occurred_at > now() + interval '5 minutes'
     or new.occurred_at < now() - interval '18 hours' then
    raise exception 'occurred_at fora da faixa (registre em tempo quase real)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger attendance_before_insert
  before insert on public.attendance_events
  for each row execute function public.attendance_before_insert();

-- RLS -----------------------------------------------------------------------
alter table public.attendance_events enable row level security;

grant select, insert on public.attendance_events to authenticated;

-- LEITURA: admin, professor da criança, responsável da criança.
create policy attendance_select on public.attendance_events
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or public.teaches_child(child_id)
      or public.is_guardian_of(child_id)
    )
  );

-- REGISTRO: admin ou o professor que cuida da criança (responsável não registra).
create policy attendance_insert on public.attendance_events
  for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and public.is_org_member(organization_id)
    and (
      public.is_org_admin(organization_id)
      or public.teaches_child(child_id)
    )
  );
