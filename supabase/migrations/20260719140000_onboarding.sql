-- =============================================================================
-- Fase 1 · Onboarding: convites (invitations) e consentimento LGPD (consents)
-- Bootstrap de escola e aceite de convite via RPCs SECURITY DEFINER — o app NÃO
-- usa service_role para isso (menor superfície). Ver PLANO.md §5.1, §8 (Fase 1 item 7).
-- =============================================================================

create type public.invite_status  as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.consent_status as enum ('granted', 'revoked');

-- CONVITES ------------------------------------------------------------------
-- Guardado o HASH do token (nunca o token puro). child_id/relationship só para guardian.
create table public.invitations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  email             text not null,                 -- sempre armazenado em minúsculas
  role              public.app_role not null,
  child_id          uuid,
  relationship      text,
  is_legal_guardian boolean not null default false,
  token_hash        text not null unique,          -- sha256(token) em hex
  status            public.invite_status not null default 'pending',
  invited_by        uuid references public.profiles(id),
  expires_at        timestamptz not null,
  accepted_at       timestamptz,
  accepted_by       uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  -- FK composta: convite de guardian só aponta para criança DA MESMA org.
  constraint invitations_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);
create index invitations_org_status_idx on public.invitations (organization_id, status);
create index invitations_email_idx on public.invitations (email) where status = 'pending';

-- CONSENTIMENTO LGPD (imutável, versionado, granular por finalidade) ----------
create table public.consents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id        uuid,
  guardian_id     uuid not null references public.profiles(id),
  purpose         text not null,        -- 'general_terms' | 'health' | 'photo_gallery' | 'marketing'
  status          public.consent_status not null default 'granted',
  terms_version   text not null,
  ip_address      inet,
  user_agent      text,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint consents_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade,
  constraint consents_purpose_chk
    check (purpose in ('general_terms', 'health', 'photo_gallery', 'marketing'))
);
create index consents_child_purpose_idx on public.consents (child_id, purpose) where status = 'granted';

-- RLS -----------------------------------------------------------------------
alter table public.invitations enable row level security;
alter table public.consents    enable row level security;

grant select, insert, update on public.invitations to authenticated;
grant select, insert         on public.consents    to authenticated;  -- imutável: sem update/delete

-- INVITATIONS: só admin da org gerencia. O aceite é feito por RPC (get/accept), não
-- por SELECT direto do convidado.
create policy invitations_admin_select on public.invitations
  for select to authenticated
  using (public.is_org_admin(organization_id));

create policy invitations_admin_insert on public.invitations
  for insert to authenticated
  with check (public.is_org_admin(organization_id) and invited_by = (select auth.uid()));

create policy invitations_admin_update on public.invitations
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- CONSENTS: responsável vê/gera os próprios; admin vê os da org. Imutável (revogar =
-- novo registro com status 'revoked').
create policy consents_select on public.consents
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id) or guardian_id = (select auth.uid())
    )
  );

create policy consents_insert_self on public.consents
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and guardian_id = (select auth.uid())
    -- não deixa forjar consentimento para criança de que não é responsável
    and (child_id is null or public.is_guardian_of(child_id))
  );
