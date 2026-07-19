# Instituto Cinthia França — Berçário (PWA)

PWA para berçário/educação infantil: diário de bordo, comunicação escola-família e
rotina em tempo real, com privacidade. Processa **dados de menores + saúde** — a
combinação mais sensível sob a LGPD (art. 11 e 14) e o ECA; segurança e privacidade
são decisões de arquitetura, não features "para depois".

> 📄 O plano completo (produto, arquitetura, modelo de dados, **plano de segurança/LGPD**,
> UX, DevOps e roadmap) está em **[PLANO.md](PLANO.md)**.

## Stack

- **Next.js 16 (App Router)** + TypeScript + Tailwind v4 — na Vercel
- **Supabase** (Postgres, Auth, **RLS**, Realtime, Storage)
- **PWA**: Serwist (service worker, offline)
- **Estado/forms**: TanStack Query · Zustand · react-hook-form + zod
- **Offline**: Dexie (outbox) + Background Sync (Fase 1)
- **Observabilidade**: Sentry com scrubbing de PII (LGPD)
- **Testes**: Vitest · Playwright + axe (a11y) · **pgTAP** (RLS)

## Pré-requisitos

- Node.js 22+ (dev usa 24) e npm
- Para o banco local: **Docker Desktop** (necessário para `supabase start`).
  Sem Docker, conecte a um projeto Supabase hospedado.

## Começando

```bash
npm install
cp .env.example .env.local     # preencha as variáveis (ver abaixo)

# Banco local (requer Docker):
npm run db:start               # sobe o Supabase local + aplica migrations + seed
npm run gen:types              # gera lib/supabase/database.types.ts a partir do schema

npm run dev                    # http://localhost:3000
```

Sem Docker, aponte `.env.local` para um projeto Supabase hospedado e rode só `npm run dev`.

## Scripts

| Script                                      | O que faz                   |
| ------------------------------------------- | --------------------------- |
| `npm run dev` / `build` / `start`           | Next.js                     |
| `npm run lint` / `typecheck`                | ESLint / `tsc --noEmit`     |
| `npm run format` / `format:check`           | Prettier                    |
| `npm run test` / `test:e2e`                 | Vitest / Playwright         |
| `npm run db:start` / `db:reset` / `db:stop` | Supabase local              |
| `npm run db:diff` / `db:push`               | Migrations (diff / aplicar) |
| `npm run db:test`                           | Testes de RLS (pgTAP)       |
| `npm run gen:types`                         | Gera tipos do banco         |
| `npm run gen:icons`                         | Gera ícones do PWA          |

## Segurança (essencial)

- **RLS deny-by-default** em toda tabela; `organization_id` é o 1º predicado (multi-tenant).
  Um meta-teste no CI **quebra o build** se alguma tabela ficar sem RLS.
- **`service_role` e VAPID privada são server-only** — nunca com prefixo `NEXT_PUBLIC_`.
  O import de `server-only` em `lib/env.server.ts` / `lib/supabase/admin.ts` garante isso.
- **Sentry**: `beforeSend` redige PII antes de sair da máquina (`lib/observability/scrub.ts`).
- **Service Worker**: nunca cacheia rotas de API/dados (`NetworkOnly`) — tablets de sala
  são compartilhados.

Consulte o **checklist de go-live** e o **threat model** em [PLANO.md §5](PLANO.md).

## Ambientes e CI

- CI (`.github/workflows/ci.yml`): lint, formatação, typecheck, testes, build, auditoria de
  deps, **gitleaks** e **testes de RLS** (sobe Postgres real via Docker).
  - Repositórios de organização podem exigir o secret `GITLEAKS_LICENSE`.
- Produção: projeto Supabase próprio na região **sa-east-1 (São Paulo)**; preview jamais
  com dados reais. Ver [PLANO.md §7](PLANO.md).

## Estrutura

```
app/            # rotas (App Router), manifest, sw.ts, api/
features/       # módulos por feature (diario, comunicacao, seguranca)
lib/            # env, config, supabase (server/browser/admin), auth, observability
supabase/       # config.toml, migrations/, tests/ (pgTAP), seed.sql
```
