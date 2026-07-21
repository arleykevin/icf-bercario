-- =============================================================================
-- Fase 3 · Web Push (infra). Assinaturas de push por dispositivo/usuário.
-- Envio com payload GENÉRICO ("Nova atualização") — nunca PII/saúde na notificação
-- (PLANO §5.3, risco #12). O canal de FALLBACK para críticos (e-mail/SMS/WhatsApp)
-- fica plugável (decisão pendente).
--
-- EXCEÇÃO CONSCIENTE à regra #1 (organization_id): a assinatura é do USUÁRIO (um
-- profile pode estar em várias escolas e ter vários aparelhos); o envio busca por
-- profile_id. RLS por profile_id; o remetente usa service_role. RLS habilitada
-- satisfaz o meta-teste 00_rls_enabled.
-- =============================================================================

create table public.push_devices (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index push_devices_profile_idx on public.push_devices (profile_id);

alter table public.push_devices enable row level security;
grant select, insert, delete on public.push_devices to authenticated;

-- O usuário gerencia só os PRÓPRIOS dispositivos.
create policy push_devices_select on public.push_devices
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy push_devices_insert on public.push_devices
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy push_devices_delete on public.push_devices
  for delete to authenticated
  using (profile_id = (select auth.uid()));
