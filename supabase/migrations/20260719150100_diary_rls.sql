-- =============================================================================
-- Fase 1 · RLS do Diário de Bordo
-- Regra da casa: is_org_member(organization_id) é SEMPRE o 1º predicado (tenant);
-- depois o papel. Deny-by-default. Ver PLANO.md §5.
--
--  LEITURA  : admin da org  OU  professor da criança  OU  responsável da criança.
--  ESCRITA  : admin da org  OU  professor da criança  (responsável NÃO escreve diário);
--             recorded_by tem de ser o próprio usuário.
--  IMUTÁVEL : sem policy de UPDATE/DELETE e sem grant → append-only. Correção = novo
--             registro (o histórico de saúde/rotina de um menor não se apaga).
--
-- Acesso é sempre pela tabela-pai particionada (as partições não recebem grant),
-- então as policies do pai valem p/ todas as partições.
-- =============================================================================

alter table public.diary_entries enable row level security;

-- A RLS NÃO se propaga do pai particionado para as partições (relrowsecurity é
-- por-relação). Sem isto, um acesso DIRETO à partição folha ignoraria as policies
-- do pai — e o meta-teste 00_rls_enabled (conta tabelas public com rowsecurity=false)
-- quebraria. Habilitamos na folha: acesso DIRETO fica deny-all (sem policy), e o
-- acesso pela tabela-pai continua usando as policies do pai. Regra p/ o futuro:
-- TODA partição nova (ex.: mensal via pg_partman) nasce com RLS habilitada.
alter table public.diary_entries_default enable row level security;

-- Sem UPDATE/DELETE: diário é append-only/imutável.
grant select, insert on public.diary_entries to authenticated;

-- LEITURA: quem cuida (professor da turma da criança) e quem é responsável veem;
-- admin vê tudo da escola (inclusive histórico soft-deletado). Não-admin não vê
-- entrada soft-deletada.
create policy diary_select on public.diary_entries
  for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.is_org_admin(organization_id)
      or (
        deleted_at is null
        and (public.teaches_child(child_id) or public.is_guardian_of(child_id))
      )
    )
  );

-- ESCRITA: admin ou o professor que efetivamente dá aula p/ essa criança (matrícula
-- ativa numa turma que ele leciona). O responsável é leitor — não registra diário.
-- recorded_by fixado no próprio usuário (não-repúdio de quem lançou).
create policy diary_insert on public.diary_entries
  for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and public.is_org_member(organization_id)
    and (
      public.is_org_admin(organization_id)
      or public.teaches_child(child_id)
    )
  );
