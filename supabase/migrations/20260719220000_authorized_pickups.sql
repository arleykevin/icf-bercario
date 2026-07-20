-- =============================================================================
-- Fase 1 (pilar MVP) · Perfil da criança: PESSOAS AUTORIZADAS A RETIRAR
-- (child_health já existe na Fase 1; aqui entram os autorizados.) MINIMIZAÇÃO LGPD:
-- guardamos SÓ nome + vínculo + telefone (+ foto opcional no futuro) — NUNCA o RG
-- (decisão PLANO §10.1). Ver PLANO.md §8 (item 12).
--
-- Segurança: quem GERENCIA é o responsável LEGAL ou o admin (segurança de retirada
-- de menor); o professor da criança LÊ (para conferir na porta). RLS deny-by-default
-- (is_org_member 1º) + FK composta por tenant. created_by fixado por trigger.
-- =============================================================================

create table public.authorized_pickups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id        uuid not null,
  name            text not null,
  relationship    text,                          -- avó, tio, motorista...
  phone           text,
  photo_path      text,                          -- Storage privado (futuro); nunca RG
  created_by      uuid references public.profiles(id),  -- fixado por trigger (imutável)
  updated_by      uuid references public.profiles(id),  -- fixado por trigger (auditoria)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint pickups_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);
create index authorized_pickups_child_idx
  on public.authorized_pickups (child_id) where deleted_at is null;

-- No UPDATE: created_by é IMUTÁVEL (auditoria de "quem cadastrou o autorizado") e
-- updated_by registra quem editou/revogou — registro de segurança física de menor
-- (correção M-1 da auditoria).
create or replace function public.authorized_pickups_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;
create trigger authorized_pickups_before_update
  before update on public.authorized_pickups
  for each row execute function public.authorized_pickups_before_update();

create or replace function public.authorized_pickups_set_creator()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin new.created_by := (select auth.uid()); return new; end $$;
create trigger authorized_pickups_set_creator_before_insert
  before insert on public.authorized_pickups
  for each row execute function public.authorized_pickups_set_creator();

-- RLS -----------------------------------------------------------------------
alter table public.authorized_pickups enable row level security;

grant select, insert, update on public.authorized_pickups to authenticated;

-- LEITURA: admin, professor da criança (confere na retirada) e responsável.
create policy pickups_select on public.authorized_pickups
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (
        deleted_at is null and (
          public.teaches_child(child_id) or public.is_guardian_of(child_id)
        )
      )
    )
  );

-- GERÊNCIA (adicionar): responsável LEGAL ou admin (segurança de retirada).
create policy pickups_insert on public.authorized_pickups
  for insert to authenticated
  with check (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or public.is_legal_guardian_of(child_id)
    )
  );

-- EDITAR/REMOVER (soft-delete): mesmos papéis.
create policy pickups_update on public.authorized_pickups
  for update to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or public.is_legal_guardian_of(child_id)
    )
  )
  with check (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or public.is_legal_guardian_of(child_id)
    )
  );
