# Plano Mestre — PWA de Berçário/Creche (Brasil)

> **Documento consolidado (tech lead)** a partir de 6 análises especialistas: Arquitetura, Modelo de Dados, Produto, Segurança/LGPD, UX/PWA e DevOps.
> **Natureza dos dados:** menores de idade + saúde (febre, medicamento, evacuação, alergias) — a combinação **mais sensível** sob a LGPD (art. 11 e art. 14) somada à proteção reforçada do ECA. **Este é o eixo que subordina todas as decisões deste plano.**
> Status: **plano de construção**. Nada aqui foi implementado ainda.

---

## 1. Resumo Executivo

O plano original tinha visão de produto correta (PWA para matar a fricção de download; diário de bordo como core; "reduzir ruído de notificação" como posicionamento) mas falhava na execução: deixava decisões estruturais em aberto ("React+Vite OU Next.js"), tratava segurança e privacidade como features "para depois", inflava o MVP misturando v1+v2+v3, e apresentava um schema perigoso (sem `organization_id`/tenant, `professor_id` como FK única, `foto_url` público, saúde em texto livre, e ausência total das tabelas mais sensíveis: consentimento, autorização de medicamento, autorizados, auditoria). Este plano mestre fecha essas lacunas: **decide o stack**, **redesenha o schema com privacidade e multi-tenancy no dia zero**, **corta o MVP para 5 pilares honestos**, e eleva **segurança/LGPD ao entregável de maior prioridade** (RLS deny-by-default testada no CI, buckets privados, autorização de medicamento imutável, consentimento versionado, governança formal).

**Decisões-chave que mudam vs. o documento original:**

- **Framework decidido: Next.js 15 (App Router) na Vercel.** Descartado React+Vite — dados de saúde de menores exigem uma fronteira de servidor confiável (secrets, audit, assinatura de medicamento, push).
- **Multi-tenancy desde o schema:** `organization_id NOT NULL` em toda tabela e como 1º predicado de toda policy RLS.
- **RBAC por organização** (`org_members`), não enum fixo no perfil — o mesmo e-mail pode ser professor numa escola e responsável noutra.
- **MVP recortado para 5 pilares** (diário+lote, check-in/out+presença, resumo do dia, comunicado com "Ciente", perfil com saúde/autorizados). Chat, galeria avançada, calendário e OAuth Google saem para v2.
- **Check-in/Check-out e Resumo do Dia promovidos a MVP** (eram omissões vs. concorrência — Brightwheel, Tadpoles).
- **Segurança é decisão de schema e de RLS, tomada agora:** deny-by-default, testes de RLS no CI (pgTAP) que quebram o build, buckets privados com URL assinada, autorização de medicamento imutável com não-repúdio, minimização de RG.
- **Governança LGPD formal antes do go-live:** DPO, Política/Termos, ROPA, RIPD, plano de resposta a incidente (Res. CD/ANPD 15/2024).
- **Ambientes isolados** (projeto Supabase por ambiente; preview jamais aponta para produção), migrations versionadas, PITR com restore testado.

---

## 2. Stack e Arquitetura Recomendada

| Área | Decisão | Justificativa curta |
|---|---|---|
| **Framework** | **Next.js 15 (App Router)** na Vercel | Fronteira de servidor confiável (Route Handlers/Server Actions) para secrets, audit, assinatura de medicamento e push. SPA Vite deixaria a RLS como única barreira. |
| **Backend/BaaS** | **Supabase** (Postgres, Auth/GoTrue, RLS, Realtime, Storage) | RLS nativo = autorização por linha, ideal para isolamento por escola/família. |
| **PWA / Service Worker** | **Serwist** (não next-pwa) | next-pwa está abandonado e frágil no App Router; Serwist é o sucessor mantido, Workbox por baixo, suporte a Background Sync. |
| **Offline do diário** | **Event log append-only + outbox (IndexedDB/Dexie) + Background Sync + idempotency key (UUID v7)** | Evento de diário é fato imutável; append-only elimina ~90% dos conflitos; dedupe por idempotency key no servidor. |
| **Conflitos** | Append-only = sem conflito (só dedupe). Campos mutáveis (perfil, alergias) = last-write-wins + versão otimista | Nunca fazer merge cego de dado de saúde. |
| **Estado / forms** | **TanStack Query** (server-state, cache offline-persistente) + **Zustand** (UI-state) + **react-hook-form + zod** (schema compartilhado cliente↔servidor) | Separa server-state de UI-state; zod como fonte única da verdade elimina drift. Descartar SWR. |
| **Realtime** | **Broadcast/Presence** para chat; **TanStack revalidate** para timeline | `postgres_changes` avalia cada mudança por conexão com RLS — não escala; reservá-lo a poucos canais filtrados. |
| **Push** | **Web Push VAPID** enviado do servidor (lib `web-push`, runtime Node) | iOS exige PWA instalada em standalone (16.4+); fallback e-mail/SMS para avisos críticos. |
| **Runtimes** | **Edge** = middleware de auth; **Node** = push/crypto/`service_role`/audit | `web-push` depende de `crypto` do Node e não roda em Edge. |
| **Design system** | **shadcn/ui + Tailwind + Radix** | Radix entrega foco/ARIA de fábrica; shadcn dá propriedade do código. |
| **Observabilidade** | **Sentry** com scrubbing de PII (`beforeSend`) antes do 1º deploy | Enviar dado de saúde de menor sem redigir viola LGPD art. 14 — bloqueante. |
| **Testes** | Vitest (unidade) + Playwright (E2E) + **pgTAP (RLS)** no CI | Isolamento de RLS testado a cada migração. |

**Regra de ouro transversal:** **RLS é defesa-em-profundidade, não a única barreira.** O cliente valida por UX; o servidor valida por segurança. `service_role` e chave VAPID privada **nunca** tocam o bundle do cliente.

**Estrutura de código (feature-based colocation):**

```
app/
  (auth)/ (pais)/ (professor)/ (admin)/
  api/                 # Route Handlers (push, webhooks) — runtime Node
  manifest.ts
features/
  diario/ comunicacao/ seguranca/   # componentes, hooks, queries, schema zod, outbox por feature
lib/
  supabase/ (clients server/browser)  push/  offline/ (Dexie, fila, sync)  audit/
sw.ts                # Serwist
middleware.ts        # auth na borda (Edge)
```

---

## 3. Escopo de Produto Refinado e Faseado

O documento original chamava de "MVP" ~13 features (na prática MVP+v2+v3). **Recorte honesto: lance um MVP que faça um dia inteiro de berçário funcionar de ponta a ponta para uma turma real** — com o modelo de dados já multi-filho, multi-responsável e multi-tenant. Empurre o resto.

| Fase | Escopo | Racional |
|---|---|---|
| **MVP (v1)** | **1. Diário de Bordo** (alimentação, sono, higiene/fralda, humor/atividade) **+ Ações em Lote** offline-first. **2. Check-in/Check-out + Presença** (quem entregou/retirou, registro imutável). **3. Resumo do Dia** (digest automático de fim de dia). **4. Comunicado + "Ciente"** (unidirecional, com tracking de leitura). **5. Perfil da Criança**: saúde/alergias, autorizados, multi-responsável (modelo completo, UI mínima). Onboarding de escola + convite de pais (magic link + consentimento LGPD no mesmo passo) + **bulk import CSV** de alunos. | Berçário se vende e se retém pelo diário funcionando bem, não pela amplitude. Check-in/out (prova de custódia) e Resumo do Dia (artefato nº1 de valor dos pais) são table stakes que faltavam. |
| **v1.1 (fast-follow)** | Fotos inline na timeline + reação/comentário curto dos pais. **Autorização de medicamento assíncrona** (pré-autorização com validade + solicitação pontual, com auditoria). Lista de Suprimentos com loop fechado (professor sinaliza → pai repõe → marca). Upload de documentos (carteira de vacina, laudos). UI de gestão de papéis do responsável. | Alto engajamento e valor sensível, mas não bloqueiam o "dia funcionar". |
| **v2** | Chat 1:1 com quiet hours / silenciamento por jornada do professor. Calendário (cardápio da semana, eventos institucionais). Modo Férias/Ausência, aniversários. Galeria com tags avançadas e álbuns. OAuth Google. | Complexidade que não move a agulha de adoção inicial. |
| **v3** | Relatórios pedagógicos/BNCC, marcos de desenvolvimento, portfólio. Integrações (financeiro/ERP), exportação, multi-unidade/rede. Tiers premium. | Expansão e monetização avançada. |

**Cortes explícitos do MVP (seja honesto):** OAuth Google (comece com e-mail/senha + magic link), chat completo, cardápio/calendário, galeria com tags avançadas. São complexidade que atrasa o time-to-first-value.

**Notificações como mecanismo (o diferencial declarado):** digest diário como padrão; tempo real reservado a eventos que exigem ação (febre, pedido de autorização de medicamento, comunicado urgente, check-out por pessoa não usual); canal **crítico/saúde nunca silenciável**; quiet hours para pais; anti-duplicação (agrupar eventos da mesma criança).

**Tenancy e billing:** SaaS **por escola** (o pai não paga). `plan_id` e limites (nº alunos/turmas, cota de mídia, retenção) modelados desde já mesmo com billing manual na v1, para não travar upsell.

---

## 4. Modelo de Dados (PostgreSQL / Supabase)

### 4.1 Decisões transversais

- **Tenant:** `organization_id uuid NOT NULL` em toda tabela de negócio — base da RLS.
- **Identidade:** `profiles.id = auth.users.id` (1:1). Papéis vivem em `org_members` (papel *por organização*), permitindo acúmulo de papéis e multi-escola.
- **Soft-delete:** `deleted_at timestamptz` em toda tabela; dados de saúde com `ON DELETE RESTRICT`. Purga física só por rotina de anonimização registrada em `audit_log`.
- **Timestamps/autoria:** `created_at`/`updated_at` (trigger) + `created_by`/`recorded_by = auth.uid()`.
- **Imutáveis (sem UPDATE/DELETE via RLS):** `consents`, `announcement_reads`, assinaturas de medicação, `audit_log` — valor probatório.
- **Chaves:** `uuid` (`gen_random_uuid()`), evita enumeração e facilita merge offline.

### 4.2 Destaques do schema

**Decisão central — Diário como tabela polimórfica única particionada (`diary_entries`)** em vez de tabela-por-tipo: a timeline por criança e as Ações em Lote são as consultas mais quentes; uma tabela única dá 1 assinatura Realtime, 1 conjunto de policies RLS, insert em lote trivial e particionamento por `occurred_at`. Detalhes por tipo ficam em colunas tipadas comuns + `payload jsonb` validado por `CHECK` condicional. **Medicamento é exceção:** tem workflow de assinatura próprio e apenas *emite* um `diary_entry` de tipo `medication` para a timeline.

**Extensões, enums e helper de timestamp:**

```sql
create extension if not exists pgcrypto;   -- gen_random_uuid, crypto de campo
create extension if not exists pg_trgm;    -- busca por nome

create type app_role as enum ('admin','teacher','staff','guardian');
create type diary_entry_type as enum
  ('feeding','sleep','diaper','health','medication','mood','activity','note');
create type med_auth_status  as enum ('pending','signed','revoked','expired');
create type med_admin_status as enum ('administered','refused','skipped','postponed');
create type consent_status   as enum ('granted','revoked');

create or replace function set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
```

**Tenant, identidade e papéis (membership por organização):**

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique, cnpj text unique,
  timezone text not null default 'America/Sao_Paulo',
  plan_id text, settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table profiles (                         -- 1:1 com auth.users
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null, avatar_url text, phone text,
  is_active boolean not null default true,       -- offboarding: checado na policy
  locale text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table org_members (                       -- papel POR organização
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role app_role not null, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (organization_id, profile_id, role)
);
create index on org_members (profile_id) where deleted_at is null;
```

**Crianças, vínculos M:N (professor↔turma e responsável↔criança):**

```sql
create table children (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null, birth_date date not null, gender text,
  photo_path text,                               -- Storage PRIVADO (nunca URL pública)
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index on children (organization_id) where deleted_at is null;

-- Saúde SEPARADA do cadastro básico (RLS/auditoria mais estritas)
create table child_health (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  blood_type text, allergies text, dietary_restrictions text, medical_notes text,
  updated_at timestamptz not null default now(),
  unique (child_id)
);

create table class_teachers (                    -- professor <-> turma (N:N)
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  deleted_at timestamptz, unique (class_id, teacher_id)
);

create table guardianships (                     -- responsável <-> criança (N:N)
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  guardian_id uuid not null references profiles(id) on delete restrict,
  relationship text not null,
  is_legal_guardian boolean not null default false,  -- pode assinar consentimento/medicação
  is_emergency boolean not null default false,
  deleted_at timestamptz, unique (child_id, guardian_id)
);
create index on guardianships (guardian_id) where deleted_at is null;
```

**Diário de bordo (polimórfico, particionado, com `class_id` denormalizado e `batch_id` para ações em lote):**

```sql
create table diary_entries (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  class_id uuid references classes(id),          -- denormalizado p/ policy do professor
  entry_type diary_entry_type not null,
  occurred_at timestamptz not null,              -- quando o fato aconteceu
  note text,
  temperature_c numeric(3,1),                    -- febre
  medication_admin_id uuid,                      -- FK lógica p/ administração
  payload jsonb not null default '{}'::jsonb,    -- extras tipados por CHECK
  batch_id uuid,                                 -- agrupa "ações em lote"
  idempotency_key uuid not null,                 -- dedupe do outbox offline
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (id, occurred_at),                 -- PK inclui chave de partição
  unique (organization_id, idempotency_key)
) partition by range (occurred_at);

create index on diary_entries (child_id, occurred_at desc) where deleted_at is null;
create index on diary_entries (class_id, occurred_at desc) where deleted_at is null;
create index on diary_entries (batch_id) where batch_id is not null;
```

**Medicamento — autorização assinada (imutável) + administração via RPC validada:**

```sql
create table medication_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  authorized_by uuid not null references profiles(id),  -- responsável legal
  medication_name text not null, dosage text not null,
  route text, frequency text, condition_note text,
  starts_at timestamptz not null default now(), ends_at timestamptz,  -- janela de validade
  status med_auth_status not null default 'pending',
  signed_at timestamptz, signature_ip inet, signature_ua text,
  content_hash bytea,                           -- SHA-256 do conteúdo canônico (não-repúdio)
  document_path text,                           -- receita/PDF em Storage privado
  created_at timestamptz not null default now(),
  constraint chk_signed check (status <> 'signed' or signed_at is not null)
);

create table medication_administrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  authorization_id uuid not null references medication_authorizations(id) on delete restrict,
  administered_by uuid not null references profiles(id),
  administered_at timestamptz not null default now(),
  dose_given text, status med_admin_status not null default 'administered', note text,
  created_at timestamptz not null default now()
);
```
> **Regra:** `INSERT` em `medication_administrations` só via RPC `SECURITY DEFINER` que valida autorização `status='signed'`, não revogada e `now()` dentro de `[starts_at, ends_at]` — gravando atomicamente e emitindo o `diary_entry`.

**Check-in/Check-out (prova de custódia — novo no MVP):**

```sql
create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  kind text not null check (kind in ('check_in','check_out')),
  occurred_at timestamptz not null default now(),
  handled_by uuid references profiles(id),          -- funcionário que registrou
  pickup_person_id uuid references authorized_pickups(id),  -- quem entregou/retirou
  signature_path text, photo_path text,
  created_at timestamptz not null default now()      -- imutável (append-only)
);
create index on attendance_events (child_id, occurred_at desc);
```

**Consentimento LGPD (art. 14) — imutável, versionado, granular por finalidade:**

```sql
create table consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  guardian_id uuid not null references profiles(id),
  purpose text not null,        -- 'health','photo_gallery','marketing','general_terms'
  status consent_status not null default 'granted',
  terms_version text not null,  -- ex.: 'privacidade-v3'
  ip_address inet, user_agent text,
  granted_at timestamptz not null default now(), revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on consents (child_id, purpose) where status = 'granted';
-- Sem UPDATE/DELETE: revogar = novo registro com status='revoked'.
```

**Autorizados a retirar (minimização de RG), avisos+Ciente, galeria+tags, suprimentos, preferências/push, audit log** seguem o mesmo padrão (`organization_id NOT NULL`, soft-delete, imutabilidade onde há valor jurídico). Destaques:

```sql
create table authorized_pickups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  child_id uuid not null references children(id) on delete restrict,
  full_name text not null, relationship text,
  document_cpf_enc bytea,        -- MINIMIZAR: preferir NÃO guardar; se preciso, cifrado (Vault)
  photo_path text,               -- Storage privado (rosto p/ conferência)
  registered_by uuid references profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), deleted_at timestamptz
);

create table announcement_reads (               -- "Ciente" imutável (valor jurídico)
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  announcement_id uuid not null references announcements(id) on delete cascade,
  reader_id uuid not null references profiles(id),
  acknowledged_at timestamptz not null default now(),
  ip_address inet, user_agent text,
  unique (announcement_id, reader_id)
);

create table audit_log (                          -- append-only, tamper-evident
  id bigint generated always as identity primary key,
  organization_id uuid not null, actor_id uuid,
  action text not null,          -- 'view_health','download_photo','sign_medication',...
  entity_table text, entity_id uuid, child_id uuid, metadata jsonb,
  prev_hash bytea, row_hash bytea,               -- encadeamento por hash
  ip_address inet, user_agent text,
  created_at timestamptz not null default now()
) partition by range (created_at);
```

### 4.3 Particionamento e retenção

| Tabela | Estratégia | Retenção |
|---|---|---|
| `diary_entries` | `RANGE (occurred_at)` mensal | Quente 12m; arquivar/anonimizar após saída + prazo legal |
| `messages` (v2) | `RANGE (sent_at)` mensal | Quente 6–12m |
| `audit_log` | `RANGE (created_at)` mensal | 12–24m (evidência LGPD) |
| Mídia (Storage) | metadados no Postgres; binário em bucket privado | Ligado a consentimento; remover ao revogar/saída |

Operação: `pg_partman` ou função cron para criar partições futuras. Índices parciais `WHERE deleted_at IS NULL` mantêm o caminho quente enxuto.

---

## 5. Segurança e Privacidade (LGPD/ECA) — a seção mais robusta

> **Regra de ouro do projeto:** privacidade e segurança são decisões de **schema** e de **RLS**, tomadas **agora** no greenfield — não features para "depois do MVP". RLS mal configurada é **a falha mais provável e mais grave** deste projeto.

### 5.1 Compliance LGPD / ECA

**Base legal por finalidade** (postura conservadora: consentimento específico do responsável sobreposto à execução do contrato):

| Finalidade | Dado | Base legal |
|---|---|---|
| Diário, timeline, comunicados, "Ciente" | Rotina | Execução de contrato (art. 7, V) + melhor interesse (art. 14) |
| Saúde: febre, evacuação, alergias | **Sensível** (art. 11) | Consentimento específico e destacado (art. 11, I) + proteção da incolumidade física (art. 11, II, "e") |
| Administração de medicamento | **Sensível** | Consentimento do responsável (autorização digital) + incolumidade física |
| Foto na galeria privada | Imagem de criança | Consentimento granular (opt-in) + execução de contrato |
| Foto em **marketing/divulgação** | Imagem de criança | **Consentimento SEPARADO, opt-in, revogável** (finalidade distinta; direito de imagem) |
| Autorizados a retirar (foto/vínculo) | Dado de terceiro adulto | Legítimo interesse (art. 7, IX + LIA) na segurança da criança; **minimizar RG** |

> **Nota jurídica:** um berçário **não é serviço de saúde** — **não** invoque "tutela da saúde" (art. 11, II, "f", exclusiva de profissionais/serviços de saúde). Use **consentimento + proteção da incolumidade física**.

**Direitos do titular (art. 18) → técnica:** export de dados da criança (JSON/PDF, roteado por RLS + revalidação server-side); correção de diário via **novo registro** (não apagar histórico); revogação por finalidade em `consents`; eliminação com rotina de anonimização.

**Ciclo de vida / retenção após saída da criança:** diário/chat/fotos → eliminar/anonimizar em 30–90 dias; registros de medicamento/ocorrência de saúde → reter pelo prazo de responsabilização; dados contratuais → prazos fiscais/civis; logs de acesso → ~6 meses (Marco Civil art. 15).

**Governança (obrigatória antes do go-live):** Encarregado/DPO (art. 41) publicado; Política de Privacidade + Termos em linguagem clara; **ROPA** (art. 37); **RIPD/DPIA** (art. 38 — provavelmente exigível: grande escala de dados sensíveis de crianças); **plano de resposta a incidente** (art. 48 + Res. CD/ANPD 15/2024: notificação à ANPD e aos titulares em **3 dias úteis**).

### 5.2 Arquitetura de segurança técnica

- **Autenticação:** e-mail/senha + magic link (OAuth Google só v2). **MFA TOTP obrigatório para Admin** (exigir AAL2 nas operações sensíveis); verificação de senha vazada (HIBP); rate limit + captcha (Turnstile) após N falhas; anti-enumeração (resposta genérica, timing constante); refresh token rotation com detecção de reuso.
- **Autorização:** RLS deny-by-default, `organization_id` como 1º predicado, policies separadas por comando, `WITH CHECK` nas escritas, funções auxiliares `SECURITY DEFINER` com `search_path` travado. Autorização a partir de `app_metadata` (servidor) ou lookup no banco — **nunca** de `user_metadata` (editável pelo usuário).
- **`service_role` NUNCA no cliente:** só server-side (Route Handlers/Edge Functions), env sem `NEXT_PUBLIC_`. Cliente usa apenas anon key + JWT. Teste de CI que faz grep do bundle por vazamento.
- **Storage:** buckets **100% privados**; RLS em `storage.objects`; servir por **URL assinada de TTL ~60s** gerada server-side após revalidar visibilidade por criança; caminho prefixado por tenant `{org_id}/{class_id}/{foto_id}.jpg`; **remover EXIF/GPS** no upload (`sharp`).
- **Medicamento:** hash SHA-256 do conteúdo canônico, `guardian_id`, `signed_at` do servidor, IP, UA, AAL, versão do termo; imutável (RLS sem UPDATE/DELETE + trigger que lança exceção); administração só via RPC validada.
- **Audit log:** append-only, encadeado por hash; leituras sensíveis (detalhe de saúde, download de foto) roteadas por rota server-side que audita (Postgres não loga SELECT sozinho; alternativa: pgAudit).
- **Tablet compartilhado da sala:** auto-logout por inatividade (5–10 min); troca rápida de cuidador por **PIN** que reautentica (device não guarda segredo de longo prazo, identidade preservada para accountability); botão de logout que limpa Cache/IndexedDB/localStorage; SW com `NetworkOnly` para saúde/foto/chat (nunca cachear); MDM/kiosk.
- **Web:** CSP estrita baseada em nonce (sem `unsafe-inline`), HSTS, `frame-ancestors 'none'`, `Permissions-Policy` travando câmera/mic/geo; sanitização (DOMPurify) de qualquer HTML dinâmico; validação server-side com zod em toda rota privilegiada.
- **Push:** payload mínimo e genérico ("Nova atualização no diário") — **nunca** "febre 38,5 de João" na tela de bloqueio; assinar subscriptions por usuário; validar VAPID; rate limit.
- **Offboarding imediato:** `is_active=false` no profile (checado na policy) + revogação de refresh tokens via Admin API + remoção de vínculos de turma no ato. Não confiar só em claims de JWT (ficam obsoletas até o refresh).

### 5.3 Exemplos de políticas RLS (SQL)

**Funções auxiliares** (owned por role que ignora RLS; leem `auth.uid()`):

```sql
create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select om.organization_id from public.org_members om
  where om.profile_id = auth.uid() and om.is_active = true limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members om
    where om.profile_id = auth.uid() and om.role = 'admin' and om.is_active = true);
$$;

create or replace function public.teaches_child(target_child uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_teachers ct
    join public.enrollments e on e.class_id = ct.class_id
    where ct.teacher_id = auth.uid() and e.child_id = target_child
      and ct.deleted_at is null and e.deleted_at is null);
$$;

create or replace function public.is_guardian_of(target_child uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardianships g
    where g.guardian_id = auth.uid() and g.child_id = target_child
      and g.deleted_at is null);
$$;
```

**`children` — pai vê só o filho; professor só aluno da sua turma; admin só da sua org:**

```sql
alter table children enable row level security;

create policy children_select on children for select to authenticated
using (
  organization_id = public.auth_org_id()
  and ( public.is_admin()
        or public.teaches_child(id)
        or public.is_guardian_of(id) )
);

create policy children_insert on children for insert to authenticated
with check (organization_id = public.auth_org_id() and public.is_admin());

create policy children_update on children for update to authenticated
using      (organization_id = public.auth_org_id() and public.is_admin())
with check (organization_id = public.auth_org_id() and public.is_admin());
```

**`diary_entries` — leitura por professor da turma e responsável; pai NUNCA escreve; edição só em janela curta:**

```sql
alter table diary_entries enable row level security;

create policy diary_select on diary_entries for select to authenticated
using (
  organization_id = public.auth_org_id()
  and ( public.is_admin()
        or public.teaches_child(child_id)
        or public.is_guardian_of(child_id) )
);

create policy diary_insert on diary_entries for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and recorded_by = auth.uid()
  and ( public.is_admin() or public.teaches_child(child_id) )
);

create policy diary_update on diary_entries for update to authenticated
using (
  organization_id = public.auth_org_id()
  and ( public.is_admin()
        or (recorded_by = auth.uid() and created_at > now() - interval '24 hours') )
)
with check (organization_id = public.auth_org_id());
-- Sem DELETE para pai/professor: correção = novo registro.
```

**`medication_authorizations` — só o responsável cria/assina como ele mesmo; imutável:**

```sql
alter table medication_authorizations enable row level security;

create policy medauth_select on medication_authorizations for select to authenticated
using (
  organization_id = public.auth_org_id()
  and ( public.is_admin()
        or public.teaches_child(child_id)
        or public.is_guardian_of(child_id) )
);

create policy medauth_insert on medication_authorizations for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.is_guardian_of(child_id)
  and authorized_by = auth.uid()          -- assina como ele mesmo (não-repúdio)
);
-- Sem policy de UPDATE/DELETE => registro assinado é imutável.
```

**`storage.objects` — leitura restrita ao tenant (checagem fina por criança na rota que assina a URL):**

```sql
create policy storage_tenant_read on storage.objects for select to authenticated
using (
  bucket_id = 'fotos-criancas'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
);
```

### 5.4 Threat Model (STRIDE) — priorizado

| # | Ameaça | STRIDE | Sev. | Mitigação |
|---|---|---|---|---|
| 1 | RLS ausente/larga vaza dados entre crianças/escolas | Info Disclosure / EoP | **Crítico** | Deny-by-default; `organization_id` 1º predicado; policies por comando com `WITH CHECK`; testes pgTAP no CI + meta-teste `rowsecurity=false`; revisão de 2 pessoas em policies |
| 2 | Foto de criança em bucket público / URL perene | Info Disclosure | **Crítico** | Buckets privados; URL assinada TTL ~60s revalidada server-side; strip de EXIF; nunca cachear no SW |
| 3 | Vazamento da `service_role` (bundle/git/logs) | Info Disclosure / EoP | **Crítico** | Server-only, sem `NEXT_PUBLIC_`; secret scanning (gitleaks + push protection); rotação; ambientes separados |
| 4 | Takeover da conta Admin (phishing/stuffing) | Spoofing | **Crítico** | MFA TOTP obrigatório (AAL2); HIBP; rate limit + captcha; alerta de login anômalo |
| 5 | Pai acessa outra criança via IDOR | Info Disclosure | **Crítico** | RLS backstop + revalidação server-side; IDs do cliente nunca decidem autorização; testes de IDOR por papel |
| 6 | Tablet compartilhado deixado logado | Spoofing / Info Disclosure | **Alto** | Auto-logout 5–10 min; PIN por cuidador; logout limpa storage; SW NetworkOnly em rotas sensíveis; MDM |
| 7 | Ex-funcionário com token/vínculo ativo | EoP / Info Disclosure | **Alto** | `is_active=false` na policy; revogação de sessões via Admin API; remoção de vínculo no ato; TTL curto |
| 8 | Adulteração/repúdio de autorização de medicamento | Repudiation / Tampering | **Alto** | Registro imutável + hash SHA-256 + `signed_at` do servidor + IP/UA/AAL; administração só via RPC validada; audit encadeado |
| 9 | Exfiltração em massa por conta comprometida/insider | Info Disclosure | **Alto** | Rate limit por usuário/IP; limite de linhas; detecção de anomalia; audit de downloads |
| 10 | Foto de grupo revela outras crianças; EXIF revela localização | Info Disclosure | **Alto** | Política pedagógica (só fotos onde o filho é sujeito); strip de EXIF; visibilidade por tag validada na policy e na rota |
| 11 | Claims editáveis (`user_metadata`) forjando tenant/role | EoP | **Alto** | Autorização só de `app_metadata` (servidor) ou lookup no banco; validar assinatura do JWT |
| 12 | Push vaza saúde na tela de bloqueio; spam do endpoint | Info Disclosure | **Médio-Alto** | Payload genérico; PII só no app autenticado; assinar subscriptions; validar VAPID; rate limit |
| 13 | Supply chain (npm malicioso) / XSS rouba token | Tampering / Info Disclosure | **Médio-Alto** | Dependabot + `npm audit` + lockfile; CSP nonce; DOMPurify; evitar `dangerouslySetInnerHTML`; cookie httpOnly via SSR |
| 14 | "Ciente" sem prova robusta | Repudiation | **Médio** | `announcement_reads` imutável (user_id, timestamp, IP); audit append-only |
| 15 | Restore de backup ressuscita dado eliminado | Info Disclosure / Compliance | **Médio** | Política de propagação da eliminação aos backups (ou expiração natural documentada); restore test trimestral |
| 16 | Abuso de login/reset (DoS, enumeração) | DoS / Info Disclosure | **Médio** | WAF + rate limit (Upstash); resposta genérica e timing constante; captcha; confirmação de e-mail |

### 5.5 Checklist de segurança (bloqueante para go-live)

- [ ] `organization_id NOT NULL` em toda tabela de negócio e como 1º predicado de toda policy.
- [ ] RLS habilitada (deny-by-default) em **todas** as tabelas; meta-teste de CI falha se `rowsecurity=false`.
- [ ] Testes pgTAP positivos e **negativos** (acesso cross-tenant/cross-turma retorna 0 linhas) bloqueando merge.
- [ ] `service_role` e VAPID privada apenas server-side; grep do bundle no CI; secret scanning.
- [ ] Buckets privados; URL assinada TTL curto; EXIF removido no upload.
- [ ] MFA obrigatório para Admin; HIBP; rate limit + captcha; anti-enumeração.
- [ ] Autorização de medicamento imutável com hash/identidade/timestamp; administração via RPC validada.
- [ ] Consentimento versionado e granular por finalidade (opt-in separado para marketing).
- [ ] Minimização de RG dos autorizados (preferir não armazenar; se preciso, cifrado no Vault).
- [ ] Audit log append-only para saúde, download de foto e mudança de autorizados.
- [ ] Modelo de sessão do tablet (auto-logout, PIN, logout limpa storage, SW NetworkOnly).
- [ ] CSP/HSTS/headers; validação zod server-side; push com payload genérico.
- [ ] Offboarding ligado ao RH (flag + revogação de sessões).
- [ ] Governança: DPO publicado, Política/Termos, ROPA, RIPD concluída, plano de incidente, DPAs assinados.
- [ ] Ambientes isolados; preview jamais com dados reais; pentest antes do go-live.

---

## 6. UX e Design

**Princípio central: um design system, dois modos de interação** — professor (operar sob pressão) e pais (sentir e confiar) compartilham tokens/componentes/ícones, mas divergem em densidade, tom de microcopy e navegação.

**Professor / Cuidador:** uma mão / polegar / parte de baixo da tela (bottom-nav + FAB); meta dura de ≤3 toques por refeição e ≤5 para a turma; ações em lote como padrão; alvos ≥48px; troca rápida de aluno (chips com foto+nome); densidade alta tolerada (grid com status-dots comeu/dormiu/trocou).

**Pais / Responsáveis:** timeline emocional e visual (cards grandes, foto em destaque); calma não alarme (vermelho só para saúde real); linguagem afetiva ("O João aceitou bem a papinha 🍲"); baixa densidade, um objetivo por tela; **privacidade percebida visível**.

**Design system:** shadcn/ui + Tailwind + Radix. Tokens CSS (tema claro/escuro definido desde o token 0): `--brand` (calmo, evitar azul-clínico), `--critical` (vermelho só para saúde/urgência), `--surface`, `--text`, `--radius: 0.75rem`, `--touch-min: 48px`. Tipografia base ≥16px (corpo dos pais 17–18px) em `rem` (respeita font-size do sistema — chave para avós). Ícones **sempre com rótulo textual** (Lucide).

**Fluxo crítico — Ações em Lote** (o coração operacional e o mais arriscado): padrão **Selecionar → Aplicar → Ajustar exceções → Confirmar → Desfazer**. Ex. sono da turma: entra em modo seleção (checkboxes grandes) → "selecionar todos" e desmarcar exceções (contador vivo "18 de 20") → bottom sheet [Sono] com padrão pré-preenchido (hora = agora) → **pré-visualização das crianças afetadas com override individual** → confirmar (optimistic UI) → **toast "Desfazer" 5–10s antes do commit definitivo**. Nunca sobrescrever silenciosamente (sinalizar conflito se já há sono aberto).

**Offline visível:** banner de status ("Você está offline — registros ficam salvos aqui"); fila com badge "3 registros aguardando envio"; distinção clara **"salvo no dispositivo" vs. "sincronizado com a escola"**; optimistic UI com rollback visível.

**Privacidade percebida (confiança = feature):** rótulo de audiência na mídia ("Enviada apenas para: pais do João") com confirmação obrigatória de tags antes de publicar; badge de dado sensível ("visível apenas para você e os responsáveis"); professor vê quem deu "Ciente"; pai vê "quem da escola tem acesso ao perfil do meu filho"; consentimento LGPD como UI de primeira classe (destacado, reversível, legível).

**Acessibilidade (WCAG 2.1 AA — requisito, não opcional):** contraste AA (status sempre com ícone+rótulo, não só cor); foco visível (Radix ajuda); labels ARIA + live regions para toasts; erro atrelado ao campo (`aria-describedby`); `prefers-reduced-motion`; alt text nas fotos.

**PWA UX:** install prompt não intrusivo (convite próprio após entrega de valor — fim da 1ª semana / 3º registro), instrução manual no iOS; push só just-in-time; ícones maskable + splash; skeletons (nunca spinner de tela cheia em Wi-Fi de creche); empty states que ensinam.

**Notificações:** canais separados — **Crítico/Saúde** (push imediato, não silenciável), **Rotina** (agrupado em digest), **Social/Mural** (badge in-app). Quiet hours para pais; silenciamento por jornada do professor (v2). Princípio: o pai pode desligar quase tudo sem perder o crítico.

---

## 7. Infra, DevOps e Qualidade

**Ambientes — projeto Supabase próprio por ambiente (nunca compartilhar produção):**

| Ambiente | Frontend | Supabase | Dados |
|---|---|---|---|
| Local | `next dev` | `supabase start` (Docker) | Seed sintético |
| Preview (por PR) | Deploy automático Vercel | Projeto/branch não-produtivo | **Seed sintético — nunca dados reais** |
| Staging | branch `staging` | Projeto staging | Sintético + réplica anonimizada |
| Production | branch `main` | Projeto prod (**sa-east-1 / São Paulo**) | Dados reais, acesso restrito + MFA no dashboard |

**CI/CD (GitHub Actions + Vercel) — gates bloqueantes em PR:** ESLint + Prettier; `tsc --noEmit`; Vitest (regras de domínio, ex. "medicamento só com autorização válida"); **testes de RLS contra `supabase start`** (positivos e negativos); Playwright E2E (login por papel, diário em lote offline→sync, autorização de medicamento, isolamento entre pais); `@axe-core/playwright` (a11y); `npm audit`/osv-scanner + Dependabot; gitleaks + push protection. Pós-merge: deploy Vercel + `supabase db push` com verificação de drift.

**Migrations versionadas e reversíveis:** fonte da verdade em `supabase/migrations/*.sql`; **nenhuma DDL manual no dashboard de produção** (gera drift). Fluxo: alterar local → `supabase db diff -f nome` → revisar no PR → aplicar em preview/staging → `db push` no merge. Migrations destrutivas em dado de saúde exigem revisão dupla + backup pontual. Seed determinístico e **exclusivamente sintético**.

**Testes de RLS (crítico) — exemplos:**

```sql
-- Teste de isolamento por papel (pgTAP)
begin;
select plan(3);
set local role authenticated;

set local request.jwt.claims to '{"sub":"<pai_A_uuid>","role":"authenticated"}';
select is((select count(*) from children where id = '<crianca_B_uuid>'), 0::bigint,
  'Pai do tenant A NAO ve crianca do tenant B');
select is((select count(*) from children where id = '<filho_do_pai_A>'), 1::bigint,
  'Pai ve o proprio filho');

set local request.jwt.claims to '{"sub":"<professor_uuid>","role":"authenticated"}';
select is((select count(*) from children where id = '<aluno_outra_turma>'), 0::bigint,
  'Professor NAO ve aluno de outra turma');

select * from finish();
rollback;
```

```sql
-- Meta-teste que QUEBRA o build se alguma tabela ficar sem RLS (deve retornar 0 linhas)
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

**Segredos:** `.env*` no `.gitignore`; `.env.example` documenta chaves sem valores; `NEXT_PUBLIC_*` só para anon key/URL; `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `WEBHOOK_SECRET` **server-only**, segregados por ambiente na Vercel; `vercel env pull` para local; rotação documentada.

**Observabilidade:** Sentry (front + edge) com **scrubbing de PII obrigatório antes do 1º deploy** (`beforeSend` removendo corpo de diário, nomes, RG; sem session replay em telas de saúde); logs estruturados sem PII; health check + alertas (pico de erros, indisponibilidade, falha de migration, billing).

**Analytics privacy-first:** **não usar Google Analytics** com dados de menores; preferir cookieless/self-host (Plausible ou PostHog self-host); zero PII em eventos.

**Backups:** PITR habilitado em produção; RPO ≤ 5 min, RTO ≤ 1 h; **teste de restore trimestral** em projeto isolado com evidência documentada; política de propagação da eliminação aos backups.

**Performance/custo:** budget de Core Web Vitals no CI (Lighthouse CI: LCP < 2,5s, INP < 200ms, CLS < 0,1); bundle inicial enxuto (code-splitting por rota); limitar canais Realtime por cliente; servir fotos via CDN com resize + cache; alertas de billing e teste de carga antes de escalar.

**Releases:** SemVer + changelog; **feature flags** (Vercel Edge Config) para liberar módulos sensíveis (medicamento, galeria) gradualmente; Instant Rollback da Vercel + migrations reversíveis; deploys de app e de banco desacoplados.

**LGPD operacional:** região sa-east-1 documentada; DPAs assinados com Supabase e Vercel; registro de subprocessadores; consentimento auditável; direitos do titular operacionalizados (export + exclusão efetiva banco+Storage+backups).

---

## 8. Roadmap de Implementação por Sprints/Fases

Sequência concreta do scaffold ao MVP. Sprints como blocos lógicos (dimensione conforme a equipe).

**Fase 0 — Fundação e segurança (bloqueante, antes de qualquer feature):**
1. Decidir/registrar Next.js 15; criar projetos Supabase por ambiente em sa-east-1; `.gitignore` + secret scanning; assinar/registrar DPAs.
2. Scaffold Next.js (App Router) + estrutura feature-based; clients `@supabase/ssr` (server/browser); middleware de auth; fronteira anon/`service_role`.
3. Migrations base: extensões, enums, helpers → `organizations`, `profiles`, `org_members`. **RLS deny-by-default** + funções auxiliares (`auth_org_id`, `is_admin`, `teaches_child`, `is_guardian_of`).
4. CI completo: lint, typecheck, Vitest, **RLS pgTAP + meta-teste**, Playwright skeleton, a11y, deps, gitleaks. Sentry com scrubbing.
5. PWA base: Serwist, manifest (standalone, ícones maskable), estratégias de cache; MFA admin.

**Fase 1 — Núcleo do MVP (o "dia funcionar de ponta a ponta"):**
6. Schema: `classes`, `children`, `child_health`, `enrollments`, `class_teachers`, `guardianships` + RLS e testes.
7. **Onboarding de escola + convite de pais** (magic link + consentimento LGPD no mesmo passo) + **bulk import CSV** de alunos.
8. **Diário de bordo** (polimórfico particionado) + timeline + **outbox offline** (Dexie + Background Sync + idempotency key) + **Ações em Lote** (padrão Selecionar→Aplicar→Exceções→Confirmar→Desfazer). Validar com professora real.
9. **Check-in/Check-out + Presença** (registro imutável, quem entregou/retirou).
10. **Comunicado + "Ciente"** (imutável) + preferências de notificação + `push_devices` + envio de Web Push (Route Handler Node) com payload genérico.
11. **Resumo do Dia** (job de fim de dia gerando digest).
12. **Perfil da criança**: saúde/alergias, autorizados (com minimização de RG), multi-responsável (UI mínima).
13. Design system aplicado (tokens, dark mode, WCAG AA); offline visível; privacidade percebida.

**Fase 2 — Governança e endurecimento (antes do go-live):**
14. DPO, Política/Termos, ROPA, **RIPD concluída**, plano de incidente, retenção/eliminação, painel de direitos do titular.
15. CSP/headers, rate limiting, offboarding automatizado, modelo de sessão do tablet, **pentest**, restore test, budget CWV.

**Fase 3 — v1.1 fast-follow:** fotos inline + reação; **autorização de medicamento assíncrona** (imutável, RPC validada, auditoria); suprimentos com loop fechado; upload de documentos/vacina; UI de gestão de papéis.

---

## 9. Riscos Principais e Mitigações (consolidado)

| Risco | Origem | Mitigação |
|---|---|---|
| RLS mal configurada vaza dados entre turmas/escolas (falha nº1) | Segurança/Dados/DevOps | Deny-by-default; `organization_id` 1º predicado; testes pgTAP negativos + meta-teste no CI bloqueando merge; revisão de 2 pessoas em policies |
| Foto de criança vazada por bucket público / URL perene | Segurança | Buckets privados; URL assinada TTL ~60s revalidada; strip de EXIF; nunca cachear no SW |
| `service_role`/VAPID no bundle do cliente | Arquitetura/Segurança | Server-only sem `NEXT_PUBLIC_`; grep do bundle no CI; secret scanning; rotação |
| Um único projeto Supabase dev/preview/prod expõe dados reais | DevOps | Projeto por ambiente; preview só com seed sintético; MFA no dashboard prod |
| Escopo de MVP inflado → nunca lança ou lança raso | Produto | Congelar MVP em 5 pilares; resto é v1.1+ |
| Multi-filho/multi-responsável retrofitado depois | Produto/Dados | `guardianships` N:N com papel desde o dia zero, mesmo que UI venha v1.1 |
| Autorização de medicamento mal desenhada = risco jurídico | Produto/Segurança | Dois caminhos (pré-autorização + solicitação pontual); registro imutável com hash/identidade/timestamp; administração via RPC validada |
| Conflitos de sync offline corrompem o diário | Arquitetura | Append-only + idempotency key (dedupe no servidor); mutáveis = LWW + versão otimista; nunca merge cego |
| Adoção do professor falha se captura for lenta (12+ bebês, sinal fraco) | Produto/UX | Ações em lote + offline-first como requisito não-funcional do MVP; testar com professora real |
| Web Push falha silenciosa no iOS | Arquitetura/Produto | Detectar capacidade (Notification + standalone); guiar Add-to-Home-Screen; fallback e-mail/SMS para críticos; monitorar entrega por plataforma |
| Notificações reproduzem o ruído que prometem eliminar | Produto/UX | Canais por criticidade; crítico nunca silenciável; digest para rotina; anti-duplicação |
| Sentry/analytics exfiltra dado de saúde de menor | Arquitetura/DevOps | `beforeSend` com denylist; sem replay em telas de saúde; analytics privacy-first; DPA + região adequada |
| Tablet compartilhado deixado logado | Segurança/UX | Auto-logout; PIN por cuidador; logout limpa storage; SW NetworkOnly em rotas sensíveis; MDM |
| Ex-funcionário com acesso residual | Segurança | `is_active=false` na policy; revogação de sessões via Admin API; remoção de vínculo no ato |
| Perda de diário/autorizações sem restore testado | DevOps | PITR; RPO≤5min/RTO≤1h; restore test trimestral com evidência |
| Custo Realtime/Storage escala mal | Arquitetura/DevOps | Broadcast p/ chat; limitar canais; CDN + resize de fotos; alertas de billing; teste de carga |
| Ações em lote geram erro em massa | UX | Pré-visualização das afetadas; exceções individuais antes de confirmar; undo 5–10s; sinalizar conflito |
| Restore de backup ressuscita dado eliminado (LGPD) | Segurança/DevOps | Política de propagação da eliminação aos backups (ou expiração natural documentada); tabela de temporalidade |
| App inacessível a avós/baixa visão | UX | WCAG AA desde o design; Radix; fontes escaláveis (rem); fluxos lineares; microcopy simples |

---

## 10. Perguntas em Aberto / Decisões a Confirmar

1. **RG dos autorizados:** confirmar a postura recomendada de **não armazenar o número** (só foto + nome + vínculo). Há alguma exigência jurídica/operacional da escola que force guardá-lo?
2. **Retenção após saída da criança:** confirmar prazos (diário/fotos: 30–90 dias? registros de medicamento: qual prazo de responsabilização?).
3. **DPO:** será terceirizado ou interno? Precisamos do nome/canal para publicar na Política antes do go-live.
4. **Fallback de avisos críticos (iOS/quem não tem push):** e-mail transacional, SMS ou WhatsApp? Isso define o provedor a contratar (custo e DPA).
5. **Marketing/divulgação de fotos:** a escola vai usar imagens em redes sociais? Se sim, precisamos do fluxo de consentimento **separado** desde a v1.1.
6. **Assinatura de medicamento:** o "assinar" digital dos pais é aceite com hash+timestamp (recomendado) ou há exigência de assinatura eletrônica qualificada (ICP-Brasil)?
7. **Billing v1:** manual (contrato fechado) confirmado? Quais limites por plano (nº alunos/turmas, cota de mídia) devemos modelar já?
8. **Piloto:** há uma escola/turma real disponível para validar Ações em Lote e offline antes do lançamento?
