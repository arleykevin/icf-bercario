# features/diario

**Diário de Bordo** — o core do app (Fase 1). Registro de alimentação, sono, higiene/fralda,
humor e atividades, individual e em **Ações em Lote**, com **outbox offline** (Dexie +
Background Sync + idempotency key) e timeline por criança.

Regras: eventos são fatos **append-only** (correção = novo registro, nunca apagar histórico);
saúde/febre têm RLS e auditoria mais estritas. Ver PLANO.md §4.2 e §5.
