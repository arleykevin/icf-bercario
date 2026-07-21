# Web Push — setup

Infra pronta (Fase 3). Para ativar o envio, faltam as **chaves VAPID** e a decisão do
**canal de fallback** para avisos críticos (e-mail/SMS/WhatsApp — pendente).

## 1. Gerar as chaves VAPID (uma vez)

```
npx web-push generate-vapid-keys
```

Guarde e configure no ambiente:

| Env | Onde | Público? |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | build (cliente + servidor) | sim |
| `VAPID_PRIVATE_KEY` | server-only | **não** |
| `VAPID_SUBJECT` | server-only (ex.: `mailto:contato@escola…`) | não |

Sem essas variáveis o envio é **no-op** e o botão "Ativar notificações" não aparece —
o resto do app funciona normalmente.

## 2. Como funciona

- O usuário ativa em **/inicio** ("Ativar notificações") → o navegador assina o push
  e a assinatura vai para `push_devices` (RLS: cada um só vê a própria).
- Ao publicar um **comunicado**, o servidor notifica os responsáveis do escopo com
  **payload genérico** ("Novo comunicado da escola") — nunca PII/saúde (risco #12).
- O Service Worker (`app/sw.ts`) exibe a notificação e, ao clicar, abre o app.
- Assinaturas mortas (404/410) são podadas no envio.

## 3. Pendências

- Escolher e contratar o **canal de fallback** para críticos (iOS sem PWA instalado,
  sem permissão) e assinar o DPA — ver `docs/lgpd/RIPD.md`.
- iOS: push só funciona com o PWA **instalado** (Add to Home Screen) — orientar os pais.
- Validar em **preview/produção** (o SW é desabilitado no dev).
