# features/

Organização por **feature** (colocation): cada módulo agrupa seus componentes, hooks,
queries (TanStack Query), schemas `zod` (compartilhados cliente↔servidor) e, quando
aplicável, sua fila offline (outbox). Ver PLANO.md §2.

Estrutura sugerida por feature:

```
features/<feature>/
  components/     # UI da feature
  hooks/          # hooks de dados/estado
  queries/        # funções de acesso a dados (server/client)
  schema.ts       # zod — fonte única de validação
  store.ts        # zustand (UI-state), se necessário
```

Módulos do MVP (Fase 1):

- **diario/** — Diário de Bordo (alimentação, sono, higiene/fralda, humor, atividade) +
  Ações em Lote + outbox offline. É o core do app.
- **comunicacao/** — Comunicados + "Ciente", preferências de notificação, push.
- **seguranca/** — Perfil da criança (saúde, alergias), autorizados a retirar,
  check-in/check-out.

Regra transversal: a UI valida por experiência; **a autorização real é a RLS + revalidação
no servidor**. Nenhuma decisão de acesso depende só do cliente.
