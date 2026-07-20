-- =============================================================================
-- Rate limiting (PLANO.md §5.3 / §9 riscos #4 e #16) — Fase 2 endurecimento.
--
-- Contador de janela fixa, backed por Postgres (a stack não tem Redis/Upstash
-- provisionado; se um dia tiver, troca-se só a camada de storage no app).
--
-- SEGURANÇA: esta é uma tabela de INFRA, não-tenant (login é pré-autenticação, não
-- há organization_id). Ela NÃO tem policies de propósito — nega todo acesso direto
-- de anon/authenticated. O acesso acontece só via a função SECURITY DEFINER, com
-- EXECUTE concedido apenas a service_role (o servidor chama pelo admin client e
-- deriva o identificador — IP — dos headers, para o cliente não poder forjá-lo e
-- travar a conta de uma vítima). RLS fica habilitada para satisfazer o meta-teste
-- 00_rls_enabled.
-- =============================================================================

create table if not exists public.rate_limit_counters (
  bucket text not null,
  identifier text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, identifier, window_start)
);

comment on table public.rate_limit_counters is
  'Contadores de rate limit (infra, não-tenant). Sem policies: acesso só via service_role/SECURITY DEFINER.';

-- Índice para a coleta de lixo (purga de janelas antigas).
create index if not exists rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;
-- (Sem CREATE POLICY de propósito: deny-by-default total para anon/authenticated.)
-- Defesa em profundidade: revoga os grants de tabela que o Supabase concede por
-- default a anon/authenticated. RLS não filtra TRUNCATE — sem este revoke, esses
-- papéis teriam TRUNCATE na tabela (não explorável via PostgREST hoje, mas contraria
-- o deny-by-default do projeto).
revoke all on public.rate_limit_counters from anon, authenticated;

-- -----------------------------------------------------------------------------
-- rate_limit_touch: consome uma batida no bucket/identificador e diz se está
-- dentro do limite. Janela FIXA de p_window_seconds: ao virar a fronteira o
-- contador zera (uma rajada pode chegar a ~2x max cruzando a virada — limitação
-- inerente de janela fixa, aceitável aqui). `allowed = hits <= max`.
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_touch(
  p_bucket text,
  p_identifier text,
  p_max integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_bucket is null or p_identifier is null
     or coalesce(p_max, 0) <= 0 or coalesce(p_window_seconds, 0) <= 0 then
    raise exception 'rate_limit_touch: parâmetros inválidos';
  end if;

  -- Início da janela fixa atual (alinhado a múltiplos de p_window_seconds).
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters as c (bucket, identifier, window_start, hits)
  values (p_bucket, left(p_identifier, 200), v_window_start, 1)
  on conflict (bucket, identifier, window_start)
    do update set hits = c.hits + 1
  returning c.hits into v_hits;

  return query select
    (v_hits <= p_max),
    greatest(p_max - v_hits, 0),
    case
      when v_hits <= p_max then 0
      else ceil(extract(epoch from
        (v_window_start + make_interval(secs => p_window_seconds)) - clock_timestamp()
      ))::integer
    end;
end;
$$;

-- Revoga de public E de anon/authenticated: o Supabase concede EXECUTE a esses
-- papéis por default privileges, então `from public` sozinho não bastaria.
revoke all on function public.rate_limit_touch(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rate_limit_touch(text, text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- rate_limit_peek: lê o contador da janela atual SEM incrementar. Usado no login
-- para bloquear ANTES de tocar a Auth quando já houve falhas demais deste IP
-- (allowed = hits < max, pois esta tentativa ainda não foi contada).
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_peek(
  p_bucket text,
  p_identifier text,
  p_max integer,
  p_window_seconds integer
)
returns table(allowed boolean, hits integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_bucket is null or p_identifier is null
     or coalesce(p_max, 0) <= 0 or coalesce(p_window_seconds, 0) <= 0 then
    raise exception 'rate_limit_peek: parâmetros inválidos';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  select c.hits into v_hits
  from public.rate_limit_counters c
  where c.bucket = p_bucket
    and c.identifier = left(p_identifier, 200)
    and c.window_start = v_window_start;

  v_hits := coalesce(v_hits, 0);
  return query select (v_hits < p_max), v_hits;
end;
$$;

revoke all on function public.rate_limit_peek(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rate_limit_peek(text, text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- rate_limit_reset: zera as batidas de um bucket/identificador (todas as janelas).
-- Usado no LOGIN bem-sucedido: quem acerta a senha nunca fica travado pelas
-- próprias tentativas anteriores nem por falhas de terceiros no mesmo IP.
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_reset(
  p_bucket text,
  p_identifier text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_bucket is null or p_identifier is null then
    return;
  end if;
  delete from public.rate_limit_counters
  where bucket = p_bucket and identifier = left(p_identifier, 200);
end;
$$;

revoke all on function public.rate_limit_reset(text, text)
  from public, anon, authenticated;
grant execute on function public.rate_limit_reset(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- rate_limit_gc: purga janelas antigas. Chamar periodicamente (pg_cron ou um
-- cron do host chamando um Route Handler). Sem isso a tabela só cresce.
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_gc(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_counters
  where window_start < clock_timestamp()
    - make_interval(secs => greatest(coalesce(p_older_than_seconds, 86400), 60));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.rate_limit_gc(integer) from public, anon, authenticated;
grant execute on function public.rate_limit_gc(integer) to service_role;
