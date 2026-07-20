-- =============================================================================
-- Fase 1 (v1.1) · Fotos na timeline do Diário — Storage PRIVADO de menores
-- Bucket privado 'child-media'. Caminho: <organization_id>/<child_id>/<uuid>.<ext>.
-- A autorização espelha a do diário: quem CUIDA envia; admin/professor/responsável
-- da criança veem. NUNCA URL pública — a UI usa signed URL de curta duração.
--
-- Segurança de storage (superfície nova): as policies em storage.objects extraem
-- org e child do PRÓPRIO caminho (storage.foldername) e reusam os mesmos helpers
-- SECURITY DEFINER do diário (teaches_child / is_guardian_of / is_org_admin). Assim
-- é impossível ler/enviar foto de criança de outra escola ou de turma que não é sua.
-- Ver PLANO.md §5.6 (Storage) e a RLS do diário.
-- =============================================================================

-- Bucket privado, com limite de tamanho e mime types travados (defesa extra).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'child-media', 'child-media', false, 8388608,  -- 8 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Referência do arquivo na entrada do diário (imutável: gravada no INSERT).
alter table public.diary_entries add column if not exists media_path text;

-- Helpers de leitura do caminho: [1] = organization_id, [2] = child_id.
-- (storage.foldername devolve só as PASTAS; o basename <uuid>.<ext> fica de fora.)

-- LEITURA: admin da org, professor da criança ou responsável da criança.
create policy child_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'child-media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
    and (
      public.is_org_admin(((storage.foldername(name))[1])::uuid)
      or public.teaches_child(((storage.foldername(name))[2])::uuid)
      or public.is_guardian_of(((storage.foldername(name))[2])::uuid)
    )
  );

-- ENVIO: admin ou o professor que cuida da criança (responsável NÃO envia foto).
create policy child_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'child-media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
    and (
      public.is_org_admin(((storage.foldername(name))[1])::uuid)
      or public.teaches_child(((storage.foldername(name))[2])::uuid)
    )
  );

-- Sem UPDATE/DELETE por authenticated: foto de diário é imutável como o registro.
-- (Retenção/expurgo fica para rotina administrativa via service_role.)

-- Defesa-em-profundidade (auditoria): media_path, se houver, TEM de casar a org/criança
-- da própria linha do diário. Como o diário é imutável, isto impede que um media_path
-- forjado (via insert REST direto) grude num registro médico-legal. A RLS de storage já
-- barra a LEITURA de caminho alheio; aqui barramos a ESCRITA na origem. Reescreve o
-- trigger before_insert do diário adicionando essa checagem (o resto é idêntico).
create or replace function public.diary_entries_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.occurred_at > now() + interval '1 day'
     or new.occurred_at < now() - interval '400 days' then
    raise exception 'occurred_at fora da faixa permitida (% )', new.occurred_at
      using errcode = 'check_violation';
  end if;

  -- media_path tem de ser exatamente <organization_id>/<child_id>/<uuid>.<ext>.
  if new.media_path is not null
     and new.media_path !~ (
       '^' || new.organization_id::text || '/' || new.child_id::text
           || '/[0-9a-f-]{36}[.](jpg|png|webp)$'
     ) then
    raise exception 'media_path nao corresponde a org/crianca desta entrada'
      using errcode = 'check_violation';
  end if;

  select e.class_id into new.class_id
  from public.enrollments e
  where e.child_id = new.child_id
    and e.status = 'active'
    and e.deleted_at is null
  order by e.started_at desc
  limit 1;

  return new;
end;
$$;
