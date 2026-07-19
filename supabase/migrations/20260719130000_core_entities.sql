-- =============================================================================
-- Fase 1 · Núcleo de dados: turmas, crianças, saúde, matrículas e vínculos
-- Tudo multi-tenant (organization_id). Saúde fica em tabela separada (RLS mais
-- estrita). Ver PLANO.md §4.2.
--
-- ISOLAMENTO ESTRUTURAL (correção da auditoria RLS, item #1/#2/#7): children e
-- classes têm chave única (organization_id, id), e TODA tabela de vínculo usa FK
-- COMPOSTA (organization_id, child_id/class_id) — é impossível criar um vínculo na
-- org A apontando para uma criança/turma da org B. Isso fecha na raiz o vazamento
-- cross-tenant que dependia de forjar guardianship/enrollment/child_health.
-- =============================================================================

-- TURMAS --------------------------------------------------------------------
create table public.classes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  year            int,
  age_group       text,                         -- ex.: 'bercario-1', 'maternal-2'
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint classes_org_id_key unique (organization_id, id)   -- alvo de FK composta
);
create index classes_org_idx on public.classes (organization_id) where deleted_at is null;

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

-- CRIANÇAS ------------------------------------------------------------------
create table public.children (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name       text not null,
  birth_date      date not null,
  gender          text,
  photo_path      text,                          -- Storage PRIVADO (nunca URL pública)
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint children_org_id_key unique (organization_id, id)  -- alvo de FK composta
);
create index children_org_idx on public.children (organization_id) where deleted_at is null;

create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

-- SAÚDE (separada do cadastro básico) ---------------------------------------
create table public.child_health (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  child_id             uuid not null,
  blood_type           text,
  allergies            text,
  dietary_restrictions text,
  medical_notes        text,
  updated_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (child_id),
  -- FK composta: a saúde só pode apontar para uma criança DA MESMA org.
  constraint child_health_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);

create trigger child_health_set_updated_at
  before update on public.child_health
  for each row execute function public.set_updated_at();

-- MATRÍCULA: criança <-> turma (N:N) ----------------------------------------
create table public.enrollments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id        uuid not null,
  class_id        uuid not null,
  status          text not null default 'active',   -- active | inactive
  started_at      date not null default current_date,
  ended_at        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (child_id, class_id),
  constraint enrollments_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade,
  constraint enrollments_class_tenant_fk
    foreign key (organization_id, class_id)
    references public.classes (organization_id, id) on delete cascade
);
create index enrollments_class_idx on public.enrollments (class_id) where deleted_at is null;
create index enrollments_child_idx on public.enrollments (child_id) where deleted_at is null;

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function public.set_updated_at();

-- PROFESSOR <-> TURMA (N:N) --------------------------------------------------
-- teacher_id é um profile (multi-org por design) → FK composta não serve; um
-- trigger valida que o professor é membro ativo da mesma organização (item #7).
create table public.class_teachers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_id        uuid not null,
  teacher_id      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (class_id, teacher_id),
  constraint class_teachers_class_tenant_fk
    foreign key (organization_id, class_id)
    references public.classes (organization_id, id) on delete cascade
);
create index class_teachers_teacher_idx on public.class_teachers (teacher_id) where deleted_at is null;
create index class_teachers_class_idx   on public.class_teachers (class_id) where deleted_at is null;

-- RESPONSÁVEL <-> CRIANÇA (N:N) ---------------------------------------------
create table public.guardianships (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  child_id          uuid not null,
  guardian_id       uuid not null references public.profiles(id) on delete restrict,
  relationship      text not null,                    -- mãe, pai, avó, tio...
  is_legal_guardian boolean not null default false,   -- pode assinar consentimento/medicação
  is_emergency      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (child_id, guardian_id),
  constraint guardianships_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);
create index guardianships_guardian_idx on public.guardianships (guardian_id) where deleted_at is null;
create index guardianships_child_idx    on public.guardianships (child_id) where deleted_at is null;

create trigger guardianships_set_updated_at
  before update on public.guardianships
  for each row execute function public.set_updated_at();

-- Integridade de tenant para vínculos que apontam a um PROFILE (multi-org) ----
-- Rejeita vincular como professor/responsável alguém que não é membro ativo da org.
create or replace function public.assert_org_member(p_org uuid, p_profile uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.org_members om
    where om.organization_id = p_org
      and om.profile_id = p_profile
      and om.is_active and om.deleted_at is null
  ) then
    raise exception 'profile % nao e membro ativo da organizacao %', p_profile, p_org
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.class_teachers_assert_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_org_member(new.organization_id, new.teacher_id);
  return new;
end;
$$;
create trigger class_teachers_member_check
  before insert or update on public.class_teachers
  for each row execute function public.class_teachers_assert_member();

create or replace function public.guardianships_assert_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_org_member(new.organization_id, new.guardian_id);
  return new;
end;
$$;
create trigger guardianships_member_check
  before insert or update on public.guardianships
  for each row execute function public.guardianships_assert_member();
