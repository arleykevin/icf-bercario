-- =============================================================================
-- Fase 0 · Tenant, identidade e membership
-- Multi-tenancy no dia zero: organization_id em toda tabela de negócio.
-- Ver PLANO.md §4.1 e §4.2.
-- =============================================================================

-- ORGANIZAÇÕES (tenant raiz — a escola) -------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  cnpj        text unique,
  timezone    text not null default 'America/Sao_Paulo',
  plan_id     text,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- PERFIS (1:1 com auth.users) -----------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  avatar_url  text,
  phone       text,
  is_active   boolean not null default true,   -- offboarding: gateado por current_user_active()
  locale      text not null default 'pt-BR',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- MEMBERSHIP: papel POR organização (multi-escola, acúmulo de papéis) --------
create table public.org_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            public.app_role not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organization_id, profile_id, role)
);

create index org_members_profile_idx on public.org_members (profile_id) where deleted_at is null;
create index org_members_org_idx     on public.org_members (organization_id) where deleted_at is null;

create trigger org_members_set_updated_at
  before update on public.org_members
  for each row execute function public.set_updated_at();

-- Cria automaticamente um profile quando um usuário do Auth é criado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
