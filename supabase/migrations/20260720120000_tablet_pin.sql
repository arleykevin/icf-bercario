-- =============================================================================
-- PIN de bloqueio do tablet de sala (PLANO.md §9 risco #10: tablet compartilhado
-- deixado logado) — Fase 2.
--
-- O PIN é uma trava RÁPIDA de tela para o mesmo usuário logado retomar sem digitar
-- a senha toda. A revogação REAL da sessão continua sendo o auto-logout por
-- inatividade (o cookie de sessão segue válido enquanto travado — o PIN protege
-- contra acesso oportunista, não contra quem tem devtools).
--
-- SEGURANÇA: o hash do PIN fica numa tabela SEPARADA (não em profiles), com RLS
-- negando todo acesso direto e grants revogados. Se ficasse em profiles, vazaria
-- via can_see_profile (um admin leria o bcrypt de um PIN de 4 dígitos e o quebraria
-- offline em segundos). Só as funções SECURITY DEFINER (que operam no PRÓPRIO
-- usuário) tocam a tabela.
--
-- EXCEÇÃO CONSCIENTE à regra #1 (organization_id): user_pins NÃO tem organization_id
-- de propósito — o PIN é do USUÁRIO (um profile pode estar em várias escolas), não
-- de um tenant. O acesso é 100% negado a anon/authenticated e escopado por auth.uid()
-- nas funções DEFINER; a RLS habilitada satisfaz o meta-teste 00_rls_enabled.
-- =============================================================================

create table public.user_pins (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  pin_hash    text not null,
  updated_at  timestamptz not null default now()
);

alter table public.user_pins enable row level security;
-- Sem policies de propósito: deny-by-default. Acesso só via SECURITY DEFINER.
revoke all on public.user_pins from anon, authenticated;

-- Define/atualiza o PIN do PRÓPRIO usuário (bcrypt via pgcrypto). 4 a 8 dígitos.
create or replace function public.set_my_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'O PIN deve ter de 4 a 8 dígitos.' using errcode = 'P0001';
  end if;

  insert into public.user_pins (profile_id, pin_hash)
  values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (profile_id)
    do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- Remove o PIN do próprio usuário.
create or replace function public.clear_my_pin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  delete from public.user_pins where profile_id = v_uid;
end;
$$;

-- O próprio usuário tem PIN configurado?
create or replace function public.has_my_pin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_pins where profile_id = (select auth.uid())
  );
$$;

-- Confere o PIN do próprio usuário. Retorna false se não houver PIN/entrada nula.
create or replace function public.verify_my_pin(p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hash text;
begin
  if v_uid is null or p_pin is null then
    return false;
  end if;
  select pin_hash into v_hash from public.user_pins where profile_id = v_uid;
  if v_hash is null then
    return false;
  end if;
  return extensions.crypt(p_pin, v_hash) = v_hash;
end;
$$;

revoke all on function public.set_my_pin(text) from public, anon;
revoke all on function public.clear_my_pin() from public, anon;
revoke all on function public.has_my_pin() from public, anon;
revoke all on function public.verify_my_pin(text) from public, anon;
grant execute on function public.set_my_pin(text) to authenticated;
grant execute on function public.clear_my_pin() to authenticated;
grant execute on function public.has_my_pin() to authenticated;
grant execute on function public.verify_my_pin(text) to authenticated;
