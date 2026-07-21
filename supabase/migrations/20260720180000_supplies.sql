-- =============================================================================
-- Fase 3 · Suprimentos (loop fechado): professor sinaliza que um item da criança
-- está acabando (fraldas, lenços, pomada…); o responsável vê e repõe; professor/
-- admin marca como resolvido. Ver PLANO §8 item 16.
-- =============================================================================

create table public.supply_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id        uuid not null,
  item            text not null,
  status          text not null default 'open' check (status in ('open', 'resolved')),
  requested_by    uuid references public.profiles(id),
  resolved_by     uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  constraint supply_requests_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);

create index supply_requests_child_idx
  on public.supply_requests (child_id, status, created_at desc);

-- Autoria e estado iniciais fixados no servidor.
create or replace function public.supply_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.requested_by := (select auth.uid());
  new.status := 'open';
  new.resolved_by := null;
  new.resolved_at := null;
  return new;
end;
$$;

create trigger supply_requests_before_insert
  before insert on public.supply_requests
  for each row execute function public.supply_requests_before_insert();

-- No update, congela os imutáveis e carimba quem/quando resolveu.
create or replace function public.supply_requests_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.child_id        := old.child_id;
  new.item            := old.item;
  new.requested_by    := old.requested_by;
  new.created_at      := old.created_at;
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_by := (select auth.uid());
    new.resolved_at := now();
  end if;
  return new;
end;
$$;

create trigger supply_requests_before_update
  before update on public.supply_requests
  for each row execute function public.supply_requests_before_update();

alter table public.supply_requests enable row level security;
grant select, insert, update on public.supply_requests to authenticated;

-- Vê: professor/responsável/admin da criança.
create policy supply_requests_select on public.supply_requests
  for select to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.teaches_child(child_id)
    or public.is_guardian_of(child_id)
  );

-- Sinaliza: professor da criança ou admin.
create policy supply_requests_insert on public.supply_requests
  for insert to authenticated
  with check (
    public.is_org_admin(organization_id)
    or public.teaches_child(child_id)
  );

-- Resolve: professor da criança ou admin.
create policy supply_requests_update on public.supply_requests
  for update to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.teaches_child(child_id)
  )
  with check (
    public.is_org_admin(organization_id)
    or public.teaches_child(child_id)
  );
