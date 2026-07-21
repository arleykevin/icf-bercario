# Plano de Resposta a Incidente de Segurança

> ⚠️ Rascunho para revisão do DPO/jurídico (ver [README](./README.md)). Base:
> art. 48 da LGPD + **Resolução CD/ANPD nº 15/2024** (comunicação em até **3 dias
> úteis**).

## 1. Papéis

| Papel | Responsável | Contato |
|---|---|---|
| Coordenação do incidente | «…» | «…» |
| Encarregado (DPO) | «…» | «…» |
| Técnico (dev/infra) | «…» | «…» |
| Direção da Escola | «…» | «…» |

## 2. O que é um incidente notificável

Acesso, perda, alteração ou vazamento **não autorizado** de dados pessoais que possa
gerar **risco ou dano relevante** aos titulares — aqui, sobretudo, **dados de saúde de
crianças**. Na dúvida, tratar como notificável.

## 3. Fluxo (relógio começa na **ciência** do incidente)

1. **Detectar / registrar** (hora, quem detectou, o que se sabe). Fontes: alertas do
   Sentry, relatos da equipe/família, violações de CSP (`/api/csp-report`), auditoria
   (`audit_events`), logs de acesso.
2. **Conter** — revogar acessos comprometidos (**offboarding** corta o acesso na hora +
   revoga a sessão), **rotacionar segredos** (chaves do Supabase, `CRON_SECRET`),
   bloquear contas, isolar o vetor.
3. **Avaliar** — dados/titulares afetados, volume, sensibilidade, risco de dano.
4. **Erradicar e recuperar** — corrigir a causa; se houve perda, restaurar do backup
   (ver runbook de restore) e validar integridade.
5. **Notificar** — se notificável, comunicar **ANPD e titulares em até 3 dias úteis**
   (art. 48 + Res. 15/2024). Para crianças, comunicar os **responsáveis**.
6. **Registrar** — preencher o registro do incidente (§5).
7. **Revisar** — post-mortem sem culpados; ações de melhoria; atualizar RIPD/ROPA.

## 4. Conteúdo mínimo da comunicação (Res. CD/ANPD 15/2024)

- Descrição da natureza dos dados afetados e dos titulares.
- Número (ainda que estimado) de titulares afetados.
- Medidas técnicas e de segurança adotadas.
- Riscos relacionados e medidas de mitigação.
- Data da ciência e da comunicação.
- Contato do Encarregado.

## 5. Registro do incidente (preencher a cada caso)

```
ID: INC-«aaaa-mm-dd-nn»
Ciência (data/hora): 
Detecção (como): 
Dados/titulares afetados: 
Sensibilidade (saúde de menor? sim/não): 
Contenção (o que foi feito / quando): 
Notificável? (sim/não + justificativa): 
Notificação ANPD (data): 
Notificação titulares/responsáveis (data): 
Causa-raiz: 
Ações de melhoria: 
```

## 6. Ferramentas de apoio no sistema

- **Auditoria imutável** (`audit_events`) — offboarding, revogação de sessão, purge.
- **Coletor de CSP** (`/api/csp-report`) — sinais de XSS/injeção.
- **Sentry com scrubbing** — erros sem PII.
- **Rate limit / logs de auth** — tentativas de acesso indevido.
- **Offboarding + rotação de segredos** — contenção rápida.
