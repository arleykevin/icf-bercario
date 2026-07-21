-- =============================================================================
-- Fase 3 · Documentos da criança (carteira de vacina, laudos, etc.) — Storage
-- PRIVADO. Mesma superfície do child-media: bucket privado, policies em
-- storage.objects extraem org/child do caminho e reusam os helpers DEFINER.
-- Caminho: <organization_id>/<child_id>/<uuid>.<ext>.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'child-documents', 'child-documents', false, 15728640,  -- 15 MiB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create table public.child_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id        uuid not null,
  uploaded_by     uuid references public.profiles(id),
  doc_type        text not null default 'other'
                    check (doc_type in ('vaccine', 'medical', 'authorization', 'other')),
  title           text not null,
  storage_path    text not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint child_documents_child_tenant_fk
    foreign key (organization_id, child_id)
    references public.children (organization_id, id) on delete cascade
);

create index child_documents_child_idx
  on public.child_documents (child_id) where deleted_at is null;

-- Fixa autoria e valida o caminho (org/child/uuid.ext) no servidor.
create or replace function public.child_documents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.uploaded_by := (select auth.uid());
  if new.storage_path !~ (
    '^' || new.organization_id::text || '/' || new.child_id::text
        || '/[0-9a-f-]{36}[.](pdf|jpg|jpeg|png|webp)$'
  ) then
    raise exception 'storage_path nao corresponde a org/crianca'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger child_documents_before_insert
  before insert on public.child_documents
  for each row execute function public.child_documents_before_insert();

alter table public.child_documents enable row level security;
grant select, insert, delete on public.child_documents to authenticated;

-- Vê: admin/professor/responsável da criança.
create policy child_documents_select on public.child_documents
  for select to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.teaches_child(child_id)
    or public.is_guardian_of(child_id)
  );

-- Envia: responsável (carteira de vacina) ou admin.
create policy child_documents_insert on public.child_documents
  for insert to authenticated
  with check (
    public.is_org_admin(organization_id)
    or public.is_guardian_of(child_id)
  );

-- Remove: quem enviou ou admin.
create policy child_documents_delete on public.child_documents
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    or public.is_org_admin(organization_id)
  );

-- ---- Storage policies (mesma lógica; org/child do caminho) ----
create policy child_documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'child-documents'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
    and (
      public.is_org_admin(((storage.foldername(name))[1])::uuid)
      or public.teaches_child(((storage.foldername(name))[2])::uuid)
      or public.is_guardian_of(((storage.foldername(name))[2])::uuid)
    )
  );

create policy child_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'child-documents'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
    and (
      public.is_org_admin(((storage.foldername(name))[1])::uuid)
      or public.is_guardian_of(((storage.foldername(name))[2])::uuid)
    )
  );

-- Remove no Storage: o dono do objeto (quem enviou) ou admin da org.
create policy child_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'child-documents'
    and (
      owner = (select auth.uid())
      or public.is_org_admin(((storage.foldername(name))[1])::uuid)
    )
  );
