# CLAUDE.md — guia do projeto para sessões do Claude Code

PWA de berçário (Instituto Cinthia França). **Dados de menores + saúde** → LGPD (art. 11/14)
e ECA regem tudo. O plano-mestre é **PLANO.md** — leia-o antes de decisões estruturais.

## Regras inegociáveis de segurança

1. **RLS deny-by-default.** Toda tabela nova: `organization_id uuid not null`, `enable row
level security`, e policies com `organization_id`/predicado de tenant PRIMEIRO. Sem policy
   = sem acesso. O meta-teste `supabase/tests/00_rls_enabled.test.sql` quebra o build se
   esquecer.
2. **`service_role` e segredos são server-only.** Nunca prefixe segredo com `NEXT_PUBLIC_`.
   Use `lib/supabase/admin.ts` (tem `import "server-only"`) só em Route Handlers/Server Actions,
   sempre revalidando autorização no código.
3. **Nunca confie só no cliente.** A UI valida por UX; a autorização real é RLS + servidor.
4. **Funções de policy** são `security definer set search_path = ''` e schema-qualificadas
   (evita recursão de RLS). Ver `supabase/migrations/*_rls_helpers.sql`.
5. **Sem PII para terceiros.** Sentry passa por `lib/observability/scrub.ts`. Não logue nome,
   saúde, documento ou conteúdo de diário.
6. **Service Worker** não cacheia dados sensíveis (`NetworkOnly` para `/api`). Tablet de sala
   é compartilhado.
7. **Autorização de medicamento e "Ciente"** (Fase 1+) são registros **imutáveis** (sem
   UPDATE/DELETE via RLS) com timestamp/identidade/hash.

## Convenções

- **Migrations** são a fonte da verdade (`supabase/migrations/`). Nunca altere schema pelo
  dashboard (gera drift). Fluxo: editar SQL → `npm run db:diff` → revisar → `db:push`.
- Após mudar schema: `npm run gen:types` (atualiza `lib/supabase/database.types.ts`).
- **Feature-based**: código novo vai em `features/<feature>/` (ver `features/README.md`).
- **Forms/validação**: zod como fonte única, compartilhada cliente↔servidor.
- **UI**: shadcn/ui + Tailwind; tokens em `app/globals.css`; alvo de toque ≥48px; WCAG AA.
  Verde = marca; **vermelho só para saúde/urgência**.
- pt-BR em toda a interface e microcopy.

## Comandos

`npm run dev` · `build` · `lint` · `typecheck` · `test` · `test:e2e`
`npm run db:start` (Docker) · `db:reset` · `db:test` (RLS) · `gen:types` · `gen:icons`

## Estado atual

Fase 0 (fundação) concluída: scaffold, clients Supabase, middleware, RLS base
(organizations/profiles/org_members), PWA, Sentry, CI, testes. **Próximo: Fase 1** — auth +
núcleo do Diário de Bordo (ver PLANO.md §8).

## Pendências conhecidas

- Sem Docker/Supabase local nesta máquina ainda: rode o banco via Docker Desktop ou projeto
  hospedado. Os testes de RLS rodam no CI.
- Ícones do PWA são placeholders gerados (`scripts/gen-icons.mjs`) — trocar pelo branding real.
- CSP estrita baseada em nonce fica para a Fase 2 (endurecimento).
