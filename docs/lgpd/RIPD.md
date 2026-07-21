# RIPD — Relatório de Impacto à Proteção de Dados Pessoais

> ⚠️ Rascunho técnico para revisão do DPO/jurídico (ver [README](./README.md)).
> Base legal: art. 38 da LGPD. Provavelmente **exigível** por se tratar de tratamento
> de dados **sensíveis (saúde)** de **crianças** em larga escala.

- **Controlador:** «Instituto Cinthia França» — CNPJ «…»
- **Encarregado (DPO):** «nome» — «e-mail/telefone»
- **Data / versão:** «preencher» · v0 (rascunho gerado com a arquitetura da Fase 2)
- **Sistema:** PWA de acompanhamento de berçário (diário de bordo, comunicação
  escola↔família, saúde, medicamento, presença).

## 1. Descrição do tratamento

Aplicativo web (PWA) usado por **equipe da escola** (admin, professores) em tablets de
sala e por **responsáveis** em seus próprios celulares. Registra a rotina diária das
crianças e a comunicação com as famílias.

### 1.1 Categorias de dados

| Categoria                | Exemplos                                                 | Sensível?          |
| ------------------------ | -------------------------------------------------------- | ------------------ |
| Identificação da criança | nome, data de nascimento                                 | Não (mas de menor) |
| **Saúde da criança**     | alergias, restrições, tipo sanguíneo, febre, medicamento | **Sim (art. 11)**  |
| Rotina                   | alimentação, sono, troca, humor, atividades, fotos       | Não                |
| Identificação de adultos | nome, e-mail, telefone de responsáveis e equipe          | Não                |
| Autorizados a retirar    | nome, vínculo, telefone (**sem RG** — minimização)       | Não                |
| Registros de acesso      | logs de autenticação/rate limit (IP hasheado)            | Não                |

### 1.2 Finalidades e base legal

- **Cuidado e segurança da criança** (rotina, saúde, medicamento, retirada): execução
  do contrato de prestação de serviço educacional + **tutela da saúde** (art. 11, II, "f")
  e, para menores, **melhor interesse da criança** (art. 14).
- **Comunicação com a família**: execução de contrato / legítimo interesse.
- **Fotos**: **consentimento** específico e destacado do responsável (fluxo de
  consentimento imutável no onboarding).

### 1.3 Ciclo de vida e fluxo

Coleta no onboarding (CSV + convite com consentimento) → uso diário (equipe registra,
família acompanha) → **eliminação/anonimização por temporalidade** após a saída da
criança (ver §4).

## 2. Necessidade e proporcionalidade

- **Minimização aplicada:** não se coleta RG dos autorizados; fotos só com
  consentimento; push com payload genérico (nunca "febre 38,5 de João" na tela de
  bloqueio).
- Acesso **estritamente relacional**: professor vê só a própria turma; responsável vê
  só o próprio filho; nenhum membro vê o "roster" inteiro da escola.

## 3. Agentes e operadores (transferência)

| Operador                | Papel                                  | Local             | DPA        |
| ----------------------- | -------------------------------------- | ----------------- | ---------- |
| Supabase                | Banco/Auth/Storage                     | «us-west-2 (EUA)» | ⚠️ assinar |
| Sentry                  | Observabilidade (com scrubbing de PII) | «…»               | ⚠️ assinar |
| Provedor de e-mail/push | Avisos                                 | «a definir»       | ⚠️ assinar |

> **Transferência internacional:** o projeto atual está em região dos EUA. Avaliar
> mover para região no Brasil (sa-east-1) ou fundamentar a transferência (art. 33) e
> registrar no DPA. **Decisão pendente.**

## 4. Retenção e eliminação (tabela de temporalidade)

| Dado                               | Prazo após a saída da criança            | Mecanismo                                            |
| ---------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Diário de rotina + fotos           | **90 dias** (ajustável por escola)       | `run_diary_retention` + cron (`/api/cron/retention`) |
| Registros de **saúde/medicamento** | prazo de **responsabilização** «definir» | retidos (não purgados)                               |
| Comunicados / presença             | registro institucional «definir»         | retidos                                              |
| Logs de acesso                     | ~6 meses (Marco Civil art. 15)           | `rate_limit_gc`                                      |

A eliminação do diário/fotos é **automatizada e auditada** (registra evento em
`audit_events`). **Confirmar os prazos em «definir» com o jurídico.**

## 5. Direitos do titular (art. 18)

Implementado o **painel de direitos**: o responsável baixa uma **cópia** dos dados do
filho (acesso/portabilidade) e registra pedidos de **acesso** ou **eliminação**, que o
admin/DPO acompanha e resolve (`data_requests`). A eliminação de dados de menor é
tratada caso a caso por causa dos prazos legais de saúde.

## 6. Medidas de segurança (implementadas)

| Medida                                                                          | Onde                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------- |
| RLS **deny-by-default** multi-tenant, testes pgTAP + meta-teste no CI           | `supabase/migrations`, `supabase/tests`   |
| Registros sensíveis **imutáveis** (medicamento, "Ciente", presença, auditoria)  | append-only via RLS                       |
| Autoria **fixada no servidor** por trigger; FK composta anti-forja cross-tenant | migrations                                |
| **CSP** estrita por nonce + headers (HSTS, frame-ancestors)                     | `lib/security/csp.ts`                     |
| **Rate limiting** + anti-enumeração no login                                    | `lib/security/rate-limit.ts`              |
| **Offboarding** automatizado (corta acesso + revoga sessão) + auditoria         | `offboard_member`                         |
| **Sessão de tablet**: auto-logout + PIN de bloqueio (hash isolado)              | `features/tablet`                         |
| **MFA TOTP** obrigatório para admin (AAL2)                                      | `features/mfa`                            |
| **Scrubbing de PII** antes do Sentry; SW `NetworkOnly` em `/api`                | `lib/observability/scrub.ts`, `app/sw.ts` |
| Buckets **privados** + URLs assinadas de curta duração para fotos               | `child-media`                             |

## 7. Riscos residuais e plano de ação

| Risco                                    | Sev.  | Ação pendente                            |
| ---------------------------------------- | ----- | ---------------------------------------- |
| Transferência internacional (região EUA) | Alto  | Decidir região BR ou fundamentar + DPA   |
| DPO não publicado                        | Alto  | Nomear e publicar antes do go-live       |
| CSP em report-only (não força)           | Médio | Validar em preview e ligar `CSP_ENFORCE` |
| Restore de backup não testado            | Médio | Executar restore test (ver runbook)      |
| Pentest externo não realizado            | Médio | Contratar antes do go-live               |
| Prazos de retenção não confirmados       | Médio | DPO define a temporalidade               |

## 8. Conclusão

Com as medidas técnicas da Fase 0–2 o tratamento tem controles proporcionais ao risco.
As **pendências de governança** (DPO, DPAs, região, retenção, pentest, restore) devem
ser resolvidas **antes do go-live**. Reavaliar este RIPD a cada mudança relevante de
finalidade ou de arquitetura.
