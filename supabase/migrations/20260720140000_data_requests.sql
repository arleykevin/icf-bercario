-- =============================================================================
-- Direitos do titular (LGPD art. 18) — Fase 2. O responsável registra pedidos de
-- ACESSO (portabilidade/cópia) ou ELIMINAÇÃO dos dados do próprio filho; o admin/
-- DPO acompanha e resolve. A eliminação NÃO é automática: registros de menor têm
-- retenção legal (saúde/medicamento) — o admin trata caso a caso.
-- =============================================================================

create table public.data_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  child_id         uuid not null,
  requested_by     uuid not null references public.profiles(id),
  request_type     text not null check (request_type in ('access', 'deletion')),
  status           text not null default 'open'
                     check (status in ('open', 'done', 'rejected')),
  note             text,
  resolution_note  text,
  resolved_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Anti-forja cross-tenant: a criança tem de ser DA MESMA organização.
  constraint data_requests_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);

create index data_requests_org_idx
  on public.data_requests (organization_id, status, created_at desc);

create trigger data_requests_set_updated_at
  before update on public.data_requests
  for each row execute function public.set_updated_at();

-- INSERT: fixa autoria e estado inicial no servidor (o cliente não escolhe).
create or replace function public.data_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.requested_by := (select auth.uid());
  new.status := 'open';
  new.resolved_by := null;
  new.resolution_note := null;
  return new;
end;
$$;

create trigger data_requests_before_insert
  before insert on public.data_requests
  for each row execute function public.data_requests_before_insert();

-- UPDATE: só admin (RLS) resolve; aqui congelamos os campos imutáveis e fixamos
-- quem resolveu.
create or replace function public.data_requests_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.child_id        := old.child_id;
  new.requested_by    := old.requested_by;
  new.request_type    := old.request_type;
  new.note            := old.note;
  new.created_at      := old.created_at;
  new.resolved_by     := (select auth.uid());
  return new;
end;
$$;

create trigger data_requests_before_update
  before update on public.data_requests
  for each row execute function public.data_requests_before_update();

alter table public.data_requests enable row level security;
grant select, insert, update on public.data_requests to authenticated;

-- Responsável cria pedido do PRÓPRIO filho (requested_by fixado por trigger).
create policy data_requests_insert on public.data_requests
  for insert to authenticated
  with check (public.is_guardian_of(child_id));

-- Vê: admin da org OU o próprio solicitante.
create policy data_requests_select on public.data_requests
  for select to authenticated
  using (
    public.is_org_admin(organization_id)
    or requested_by = (select auth.uid())
  );

-- Resolve: só admin da org.
create policy data_requests_admin_update on public.data_requests
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- record_data_export: registra na auditoria imutável um ACESSO/EXPORT dos dados
-- de uma criança (accountability LGPD). Só responsável do filho ou admin da org.
-- -----------------------------------------------------------------------------
create or replace function public.record_data_export(p_org uuid, p_child uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_guardian_of(p_child) or public.is_org_admin(p_org)) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  insert into public.audit_events
    (organization_id, actor_id, action, target_type, target_id)
  values (p_org, (select auth.uid()), 'data.exported', 'child', p_child);
end;
$$;

revoke all on function public.record_data_export(uuid, uuid) from public, anon;
grant execute on function public.record_data_export(uuid, uuid) to authenticated;
