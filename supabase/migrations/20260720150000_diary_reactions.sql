-- =============================================================================
-- Fase 3 · Reação e comentário dos pais no diário (engajamento).
-- O responsável reage (❤️) ou comenta um registro; professor/admin veem. Não é
-- FK à diary_entries (tabela PARTICIONADA — FK exigiria a chave de partição);
-- o tenant/criança são ancorados pela FK composta a children.
-- =============================================================================

create table public.diary_reactions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id        uuid not null,
  diary_entry_id  uuid not null,               -- referência lógica ao registro
  author_id       uuid not null references public.profiles(id),
  kind            text not null default 'heart' check (kind in ('heart', 'comment')),
  comment         text,
  created_at      timestamptz not null default now(),
  constraint diary_reactions_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade,
  constraint diary_reactions_comment_chk
    check (kind <> 'comment' or (comment is not null and length(trim(comment)) > 0))
);

create index diary_reactions_entry_idx
  on public.diary_reactions (diary_entry_id);
-- No máximo um ❤️ por pessoa por registro.
create unique index diary_reactions_one_heart
  on public.diary_reactions (diary_entry_id, author_id) where kind = 'heart';

-- Autoria fixada no servidor.
create or replace function public.diary_reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := (select auth.uid());
  return new;
end;
$$;

create trigger diary_reactions_before_insert
  before insert on public.diary_reactions
  for each row execute function public.diary_reactions_before_insert();

alter table public.diary_reactions enable row level security;
grant select, insert, delete on public.diary_reactions to authenticated;

-- Vê: quem enxerga o diário da criança (responsável/professor/admin).
create policy diary_reactions_select on public.diary_reactions
  for select to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.teaches_child(child_id)
    or public.is_guardian_of(child_id)
  );

-- Cria: só o RESPONSÁVEL da criança (autoria fixada por trigger).
create policy diary_reactions_insert on public.diary_reactions
  for insert to authenticated
  with check (public.is_guardian_of(child_id));

-- Remove: só o próprio autor (❤️ é toggle; comentário pode ser apagado por quem escreveu).
create policy diary_reactions_delete on public.diary_reactions
  for delete to authenticated
  using (author_id = (select auth.uid()));
