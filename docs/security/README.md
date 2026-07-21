# Segurança — visão geral e checklist de go-live

Resumo do endurecimento (Fase 2) e o que ainda depende da instituição. Detalhes de
governança LGPD em [`../lgpd/`](../lgpd/README.md).

## Controles implementados (Fase 0–2)

| Controle | Onde | Verificado por |
|---|---|---|
| RLS deny-by-default multi-tenant | `supabase/migrations` | pgTAP + meta-teste `00_rls_enabled` (CI) |
| Registros imutáveis (medicamento, "Ciente", presença, auditoria) | append-only via RLS | pgTAP |
| Autoria fixada no servidor + FK composta anti-forja | triggers/migrations | pgTAP |
| CSP estrita por nonce + headers (HSTS, frame-ancestors, etc.) | `lib/security/csp.ts` | auditoria adversarial |
| Rate limiting só-falhas + anti-enumeração no login | `lib/security/rate-limit.ts` | pgTAP + auditoria |
| Offboarding (corta acesso + revoga sessão) + auditoria imutável | `offboard_member` | pgTAP + auditoria |
| Sessão de tablet: auto-logout + PIN isolado + inert no lock | `features/tablet` | auditoria |
| MFA TOTP obrigatório para admin (AAL2) | `features/mfa` | revisão |
| Retenção/eliminação automatizada + direitos do titular | `run_diary_retention`, `data_requests` | pgTAP + auditoria |
| Scrubbing de PII antes do Sentry; SW NetworkOnly em `/api` | `lib/observability`, `app/sw.ts` | — |

Cada feature da Fase 2 passou por **auditoria adversarial** (subagente) com correção
dos achados antes do commit — ver as mensagens de commit `Fase 2: …`.

## Checklist de pentest interno (status)

- [x] Isolamento cross-tenant em leitura e escrita (FK composta + RLS 1º predicado).
- [x] Escalada de privilégio via RPC direto (RPCs sensíveis gateados por is_org_admin/self).
- [x] Imutabilidade das trilhas (sem UPDATE/DELETE para authenticated).
- [x] Anti-enumeração de conta + rate limit resistente a lockout de vítima.
- [x] Segredos server-only (grep do bundle no CI; nada `NEXT_PUBLIC_` sensível).
- [x] Open-redirect nos `next=` (guardado; rejeita `//host`).
- [x] Endpoints de cron protegidos (secret constant-time; fail-closed).
- [ ] **CSP em modo enforce** validado em preview (hoje report-only por padrão).
- [ ] **Pentest EXTERNO** por terceiro (contratar).
- [ ] Teste de carga (Realtime/Storage) — ver PLANO §9.
- [ ] Verificação de senha vazada (HIBP) no cadastro/troca — follow-up.

## Pendências operacionais (instituição)

1. **Aplicar as migrations da Fase 2** ao banco (`supabase db push` — ver abaixo).
2. **Habilitar TOTP MFA** e **"Confirm email"** no dashboard do Supabase.
3. Definir **`CRON_SECRET`** e agendar o cron de retenção (1x/dia, `Authorization: Bearer …`).
4. Validar a CSP em preview e ligar **`CSP_ENFORCE=true`**.
5. Rotacionar a senha do banco + secret key; trocar ícones PWA placeholders.
6. Governança LGPD: DPO, DPAs, região, retenção (ver `../lgpd/`).
7. Executar o **restore test** (ver [`restore-runbook.md`](./restore-runbook.md)).

## Aplicar as migrations

As migrations da Fase 2 (rate_limit, offboarding, tablet_pin, retention,
data_requests) ainda **não foram aplicadas** ao banco remoto. Aplicar com:

```
supabase db push   # usa o Session pooler; ver projeto-icf-bercario na memória
```

O app tolera a ausência delas sem quebrar (rate limit é fail-open; CSP não depende do
banco), mas offboarding/PIN/direitos/retenção só funcionam após aplicar. Os testes
pgTAP rodam no CI.
