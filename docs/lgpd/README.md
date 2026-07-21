# Governança LGPD — Instituto Cinthia França (Berçário)

> ⚠️ **RASCUNHOS PARA REVISÃO JURÍDICA.** Os documentos desta pasta são minutas
> técnicas, redigidas a partir da arquitetura real do sistema, para **acelerar** o
> trabalho do Encarregado (DPO) e do jurídico. **NÃO são aconselhamento jurídico** e
> **não devem ser publicados** sem revisão de um profissional habilitado. Campos
> entre `«colchetes»` precisam ser preenchidos pela instituição.

O sistema trata **dados pessoais de crianças** (titulares vulneráveis, art. 14 da
LGPD) e **dados pessoais sensíveis de saúde** (art. 11). Por isso a governança formal
é condição para o go-live (PLANO.md §5.4).

## Documentos

| Documento                                                      | Base legal                     | Status   |
| -------------------------------------------------------------- | ------------------------------ | -------- |
| [RIPD / DPIA](./RIPD.md)                                       | Art. 38                        | Rascunho |
| [Registro de Operações (ROPA)](./ROPA.md)                      | Art. 37                        | Rascunho |
| [Política de Privacidade](./politica-de-privacidade.md)        | Art. 9                         | Rascunho |
| [Termos de Uso](./termos-de-uso.md)                            | —                              | Rascunho |
| [Plano de Resposta a Incidente](./plano-resposta-incidente.md) | Art. 48 · Res. CD/ANPD 15/2024 | Rascunho |

## Pendências para o go-live (decisões da instituição)

- [ ] Nomear e **publicar** o Encarregado/DPO (art. 41) — nome + canal de contato.
- [ ] Revisar e aprovar juridicamente todos os documentos acima.
- [ ] Confirmar os **prazos de retenção** (a tabela de temporalidade usa 90 dias
      para diário/fotos após a saída — ver RIPD §Retenção).
- [ ] Definir o **canal de avisos críticos** (e-mail/SMS/WhatsApp) e assinar o DPA
      do provedor escolhido.
- [ ] Assinar os **DPAs** dos operadores (Supabase, Sentry, provedor de e-mail).
- [ ] Coletar o **consentimento** específico e destacado dos responsáveis (já há
      fluxo de consentimento imutável no onboarding).

## Medidas técnicas já implementadas (Fase 0–2)

Ver o [RIPD](./RIPD.md) §Medidas de segurança para a lista completa com referências
ao código (RLS deny-by-default, registros imutáveis, CSP, rate limiting, offboarding,
sessão de tablet, retenção automatizada, direitos do titular).
