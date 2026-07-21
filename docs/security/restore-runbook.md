# Runbook — Teste de restauração de backup

> Objetivo: provar, com evidência, que conseguimos restaurar os dados (diário,
> autorizações, saúde) dentro do RPO/RTO. PLANO §9: **RPO ≤ 5 min, RTO ≤ 1 h**;
> restore test **trimestral**.

## Pré-requisitos

- Projeto Supabase em plano com **PITR** (Point-in-Time Recovery) habilitado.
- Acesso de admin ao dashboard do Supabase (com MFA).
- Um **projeto/branch de destino** separado (NUNCA restaurar por cima de produção no teste).

## Procedimento

1. **Registrar um marco.** No banco de produção, anotar um dado-âncora recente e o
   horário exato (ex.: id do último `diary_entries` e seu `created_at`).
2. **Escolher o ponto de restauração** (PITR) alguns minutos após o marco.
3. **Restaurar para o destino** (branch/projeto de teste), não para produção.
4. **Validar integridade** no destino:
   - o dado-âncora existe e confere;
   - contagens de `children`, `diary_entries`, `medication_authorizations` batem
     com o esperado;
   - a RLS continua ativa (rodar `supabase test db` contra o destino, se possível);
   - fotos: uma URL assinada de uma foto conhecida abre.
5. **Medir o RTO** (tempo do início do restore até o destino validado).
6. **Descartar** o destino de teste ao final.

## Política de eliminação vs. backup (LGPD)

O purge de retenção (`run_diary_retention`) elimina dado do banco **vivo**, mas os
backups/PITR ainda contêm o histórico. Documentar a **expiração natural** dos backups
(janela de retenção do PITR) como a forma de propagar a eliminação aos backups — ou
implementar re-purga pós-restore. Registrar no RIPD.

## Evidência (preencher a cada execução)

```
Data do teste: 
Executor: 
Ponto de restauração (PITR): 
Dado-âncora conferido (sim/não): 
Contagens conferem (sim/não): 
RLS ativa no destino (sim/não): 
Foto assinada abriu (sim/não): 
RTO medido: 
Destino descartado (sim/não): 
Observações / ações: 
```

## Cadência

Trimestral, ou após qualquer mudança grande de schema/infra. Guardar as evidências
junto da documentação de compliance.
