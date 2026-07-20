-- =============================================================================
-- Fase 1 (pilar MVP) · Comunicado + "Ciente" (IMUTÁVEL)
-- A gestão/educador publica um comunicado (escola inteira ou turma); o responsável
-- registra "Ciente" — um aceite IMUTÁVEL com identidade/timestamp (não-repúdio).
-- Ver PLANO.md §5 e §8 (item 10). Web Push fica p/ o fast-follow.
--
-- Segurança: comunicado e "ciente" são append-only (sem update/delete). RLS
-- deny-by-default (is_org_member 1º); escopo por escola/turma como o calendário.
-- created_by/guardian_id fixados por trigger (server-authoritative). FK composta.
-- =============================================================================

create type public.comm_priority as enum ('normal', 'urgent');

create table public.communications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_id        uuid,                          -- null = escola inteira
  title           text not null,
  body            text not null,
  priority        public.comm_priority not null default 'normal',
  requires_ack    boolean not null default true, -- pede "Ciente"?
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  constraint communications_class_tenant_fk
    foreign key (organization_id, class_id)
    references public.classes (organization_id, id) on delete cascade,
  -- alvo de FK composta do "ciente"
  constraint communications_org_id_key unique (organization_id, id)
);
create index communications_org_created_idx
  on public.communications (organization_id, created_at desc);
create index communications_class_idx
  on public.communications (class_id) where class_id is not null;

-- "CIENTE" (aceite imutável, 1 por responsável por comunicado) --------------
create table public.communication_acks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  communication_id uuid not null,
  child_id         uuid,                          -- opcional: por qual criança
  guardian_id      uuid not null references public.profiles(id),  -- fixado por trigger
  acked_at         timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (communication_id, guardian_id),
  constraint ack_comm_tenant_fk
    foreign key (organization_id, communication_id)
    references public.communications (organization_id, id) on delete cascade,
  constraint ack_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);
create index acks_comm_idx on public.communication_acks (communication_id);

-- Triggers: autoria server-authoritative -----------------------------------
create or replace function public.communications_set_creator()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin new.created_by := (select auth.uid()); return new; end $$;
create trigger communications_set_creator_before_insert
  before insert on public.communications
  for each row execute function public.communications_set_creator();

create or replace function public.acks_set_guardian()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin new.guardian_id := (select auth.uid()); return new; end $$;
create trigger acks_set_guardian_before_insert
  before insert on public.communication_acks
  for each row execute function public.acks_set_guardian();

-- É responsável (guardian) de alguma criança DESTA org? Usado no "Ciente" de
-- comunicado da escola inteira, para que só RESPONSÁVEIS constem no livro de aceites
-- (correção da auditoria: aceite é registro de não-repúdio LGPD/ECA).
create or replace function public.is_guardian_in_org(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and exists (
    select 1
    from public.guardianships g
    join public.children ch on ch.id = g.child_id and ch.deleted_at is null
    where g.guardian_id = (select auth.uid())
      and ch.organization_id = target_org
      and g.deleted_at is null
  );
$$;
grant execute on function public.is_guardian_in_org(uuid) to authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.communications      enable row level security;
alter table public.communication_acks  enable row level security;

grant select, insert on public.communications     to authenticated;
grant select, insert on public.communication_acks to authenticated;

-- COMUNICADO: membros veem escola-inteira; comunicado de turma só a turma + admin.
create policy communications_select on public.communications
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or class_id is null
      or public.teaches_class(class_id)
      or public.guardian_in_class(class_id)
    )
  );

-- Publica: admin (qualquer escopo) ou professor (só a própria turma).
create policy communications_insert on public.communications
  for insert to authenticated
  with check (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (class_id is not null and public.teaches_class(class_id))
    )
  );

-- "CIENTE": admin vê todos; responsável vê os próprios.
create policy acks_select on public.communication_acks
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or guardian_id = (select auth.uid())
    )
  );

-- Registra "Ciente" só o próprio responsável, e só em comunicado que ele PODE ver
-- (destinado à escola inteira ou à turma do filho). child_id, se houver, tem de ser
-- filho dele.
create policy acks_insert_self on public.communication_acks
  for insert to authenticated
  with check (
    guardian_id = (select auth.uid())
    and public.is_org_member(organization_id)
    and (child_id is null or public.is_guardian_of(child_id))
    and exists (
      select 1 from public.communications c
      where c.id = communication_id
        and c.organization_id = organization_id
        and (
          (c.class_id is null and public.is_guardian_in_org(organization_id))
          or public.guardian_in_class(c.class_id)
        )
    )
  );
