-- =============================================================================
-- Fase 1 (v1.1) · Medicamento: AUTORIZAÇÃO assinada (imutável) + ADMINISTRAÇÃO
-- Fluxo: o responsável LEGAL pré-autoriza um medicamento com validade (não-repúdio
-- por assinatura/hash). O educador registra cada administração; cada administração
-- EMITE um evento 'medication' na timeline do diário. Tudo IMUTÁVEL (sem update/
-- delete) — é registro médico-legal. Ver PLANO.md §4.2 e §5.
--
-- Segurança: só o RESPONSÁVEL LEGAL da criança assina (is_legal_guardian_of);
-- signer/timestamp/hash são fixados por TRIGGER (server-authoritative, o cliente não
-- forja). Administração exige uma autorização ATIVA da MESMA criança dentro da
-- validade (trigger). FK composta por tenant em ambas as tabelas.
-- =============================================================================

create type public.med_admin_status as enum
  ('administered', 'refused', 'skipped', 'postponed');

-- Helper: é responsável LEGAL da criança? (pode assinar consentimento/medicamento)
create or replace function public.is_legal_guardian_of(target_child uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and exists (
    select 1
    from public.guardianships g
    join public.children ch on ch.id = g.child_id and ch.deleted_at is null
    where g.guardian_id = (select auth.uid())
      and g.child_id = target_child
      and g.is_legal_guardian
      and g.deleted_at is null
  );
$$;
grant execute on function public.is_legal_guardian_of(uuid) to authenticated;

-- AUTORIZAÇÃO (imutável, assinada pelo responsável legal) --------------------
create table public.medication_authorizations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id        uuid not null,
  medication_name text not null,
  dosage          text not null,          -- ex.: "10 gotas", "5 ml"
  route           text,                   -- oral, tópico, nasal...
  instructions    text,                   -- "a cada 8h se febre > 37.8"
  valid_from      date not null default current_date,
  valid_until     date not null,
  signed_by       uuid not null references public.profiles(id),   -- fixado por trigger
  signed_at       timestamptz not null default now(),             -- fixado por trigger
  signature_hash  text not null,                                  -- fixado por trigger (não-repúdio)
  created_at      timestamptz not null default now(),
  constraint med_auth_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade,
  constraint med_auth_validity_chk check (valid_until >= valid_from),
  -- Alvo de FK composta: a administração aponta autorização da MESMA org (M2).
  constraint med_auth_org_id_key unique (organization_id, id)
);
create index med_auth_child_idx
  on public.medication_authorizations (child_id, valid_until desc);

-- ADMINISTRAÇÃO (imutável) --------------------------------------------------
create table public.medication_administrations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  child_id         uuid not null,
  authorization_id uuid not null,
  status           public.med_admin_status not null,
  administered_by  uuid not null references public.profiles(id),  -- fixado por trigger
  administered_at  timestamptz not null default now(),
  note             text,
  created_at       timestamptz not null default now(),
  constraint med_admin_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade,
  -- FK composta por tenant (M2): a administração só aponta autorização da mesma org.
  constraint med_admin_auth_tenant_fk
    foreign key (organization_id, authorization_id)
    references public.medication_authorizations (organization_id, id) on delete restrict
);
create index med_admin_child_idx
  on public.medication_administrations (child_id, administered_at desc);

-- TRIGGERS ------------------------------------------------------------------

-- Assinatura server-authoritative: fixa signer/timestamp e calcula o hash de
-- não-repúdio a partir do conteúdo + identidade (ignora o que o cliente mandar).
create or replace function public.med_auth_sign()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.signed_by := (select auth.uid());
  new.signed_at := now();
  -- Hash de integridade/não-repúdio cobrindo TODO o conteúdo clínico (inclui route
  -- e organization_id — M1). HMAC com segredo server-side fica para o endurecimento.
  new.signature_hash := encode(
    extensions.digest(
      coalesce(new.organization_id::text, '') || '|' ||
      coalesce(new.child_id::text, '') || '|' ||
      coalesce(new.medication_name, '') || '|' ||
      coalesce(new.dosage, '') || '|' ||
      coalesce(new.route, '') || '|' ||
      coalesce(new.instructions, '') || '|' ||
      coalesce(new.valid_from::text, '') || '|' ||
      coalesce(new.valid_until::text, '') || '|' ||
      coalesce(new.signed_by::text, '') || '|' ||
      coalesce(new.signed_at::text, ''),
      'sha256'),
    'hex');
  return new;
end;
$$;
create trigger med_auth_sign_before_insert
  before insert on public.medication_authorizations
  for each row execute function public.med_auth_sign();

-- Administração: exige autorização ATIVA da MESMA criança/org, dentro da validade;
-- fixa administered_by no próprio usuário.
create or replace function public.med_admin_validate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_auth public.medication_authorizations;
begin
  new.administered_by := (select auth.uid());

  -- Registro em tempo quase real (A1): administered_at não pode ser antedatado/pós-datado
  -- à toa — é o campo médico-legal "quando o remédio foi dado".
  if new.administered_at > now() + interval '5 minutes'
     or new.administered_at < now() - interval '12 hours' then
    raise exception 'administered_at fora da faixa (registre em tempo quase real)'
      using errcode = 'check_violation';
  end if;

  -- Criança inativa (soft-delete) não recebe administração (M3).
  if exists (
    select 1 from public.children
    where id = new.child_id and deleted_at is not null
  ) then
    raise exception 'crianca inativa' using errcode = 'check_violation';
  end if;

  select * into v_auth
  from public.medication_authorizations
  where id = new.authorization_id;

  if not found then
    raise exception 'autorizacao inexistente' using errcode = 'foreign_key_violation';
  end if;
  if v_auth.child_id <> new.child_id or v_auth.organization_id <> new.organization_id then
    raise exception 'autorizacao nao pertence a esta crianca/escola' using errcode = 'check_violation';
  end if;
  -- Validade contra a DATA da administração, não "hoje" (A1): impede datar a dose
  -- fora da janela em que a autorização estava vigente.
  if new.administered_at::date < v_auth.valid_from
     or new.administered_at::date > v_auth.valid_until then
    raise exception 'autorizacao fora da validade na data da administracao'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
create trigger med_admin_validate_before_insert
  before insert on public.medication_administrations
  for each row execute function public.med_admin_validate();

-- Após administrar, EMITE o evento 'medication' na timeline (não-repúdio: liga o
-- diary_entry à administração via medication_admin_id). Roda como definer (dono),
-- então grava na tabela particionada do diário sem recursão de RLS; os valores vêm
-- da administração já validada.
create or replace function public.med_admin_emit_diary()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_dose text;
  v_status_pt text := case new.status
    when 'administered' then 'administrado'
    when 'refused'      then 'recusado'
    when 'skipped'      then 'pulado'
    when 'postponed'    then 'adiado'
  end;
begin
  select medication_name, dosage into v_name, v_dose
  from public.medication_authorizations where id = new.authorization_id;

  insert into public.diary_entries
    (organization_id, child_id, entry_type, occurred_at, recorded_by,
     medication_admin_id, note, payload)
  values
    (new.organization_id, new.child_id, 'medication', new.administered_at,
     new.administered_by, new.id,
     trim(coalesce(v_name, 'Medicamento') || ' ' || coalesce(v_dose, '')) || ' — ' || v_status_pt,
     jsonb_build_object('name', v_name, 'dosage', v_dose, 'status', new.status));

  return new;
end;
$$;
create trigger med_admin_emit_diary_after_insert
  after insert on public.medication_administrations
  for each row execute function public.med_admin_emit_diary();

-- RLS -----------------------------------------------------------------------
alter table public.medication_authorizations  enable row level security;
alter table public.medication_administrations enable row level security;

grant select, insert on public.medication_authorizations  to authenticated;
grant select, insert on public.medication_administrations to authenticated;

-- AUTORIZAÇÃO: veem admin/professor/responsável da criança; assina só o resp. LEGAL.
create policy med_auth_select on public.medication_authorizations
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or public.teaches_child(child_id)
      or public.is_guardian_of(child_id)
    )
  );

create policy med_auth_insert on public.medication_authorizations
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.is_legal_guardian_of(child_id)
  );

-- ADMINISTRAÇÃO: veem admin/professor/responsável; registra admin ou professor.
create policy med_admin_select on public.medication_administrations
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or public.teaches_child(child_id)
      or public.is_guardian_of(child_id)
    )
  );

create policy med_admin_insert on public.medication_administrations
  for insert to authenticated
  with check (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or public.teaches_child(child_id)
    )
  );
