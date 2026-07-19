-- =============================================================================
-- Fase 1 · Helpers de autorização do núcleo (base da RLS de criança/turma)
-- SECURITY DEFINER + search_path travado (rodam como owner, ignoram RLS → sem
-- recursão). Ver PLANO.md §5.3.
--
-- Correções da auditoria RLS:
--  - gate por current_user_active() (offboarding real);
--  - teaches_child / is_guardian_of / guardian_in_class exigem a criança NÃO
--    soft-deletada → um soft-delete de criança revoga o acesso de professor/
--    responsável (a gestão/admin continua enxergando para fins de histórico).
-- =============================================================================

-- O professor atual dá aula para uma turma (vínculo ativo, turma não deletada)?
create or replace function public.teaches_class(target_class uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and exists (
    select 1
    from public.class_teachers ct
    join public.classes c on c.id = ct.class_id and c.deleted_at is null
    where ct.teacher_id = (select auth.uid())
      and ct.class_id = target_class
      and ct.deleted_at is null
  );
$$;

-- O professor atual dá aula para a criança (matrícula ativa; criança não deletada)?
create or replace function public.teaches_child(target_child uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and exists (
    select 1
    from public.class_teachers ct
    join public.enrollments e on e.class_id = ct.class_id
    join public.children ch on ch.id = e.child_id and ch.deleted_at is null
    where ct.teacher_id = (select auth.uid())
      and e.child_id = target_child
      and ct.deleted_at is null
      and e.deleted_at is null
      and e.status = 'active'
  );
$$;

-- O usuário atual é responsável pela criança (criança não deletada)?
create or replace function public.is_guardian_of(target_child uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and exists (
    select 1
    from public.guardianships g
    join public.children ch on ch.id = g.child_id and ch.deleted_at is null
    where g.guardian_id = (select auth.uid())
      and g.child_id = target_child
      and g.deleted_at is null
  );
$$;

-- O usuário atual é responsável por alguma criança matriculada (ativa) nesta turma?
create or replace function public.guardian_in_class(target_class uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and exists (
    select 1
    from public.enrollments e
    join public.guardianships g on g.child_id = e.child_id
    join public.children ch on ch.id = e.child_id and ch.deleted_at is null
    where e.class_id = target_class
      and g.guardian_id = (select auth.uid())
      and e.deleted_at is null
      and g.deleted_at is null
      and e.status = 'active'
  );
$$;

-- Pode ver o PERFIL de outra pessoa? Substitui shares_org (que vazava a escola
-- inteira). Escopo: você mesmo é tratado na policy; aqui cobrimos admin da org do
-- alvo, professor↔responsável da mesma turma, e co-responsáveis da mesma criança.
create or replace function public.can_see_profile(target_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_user_active() and (
    -- admin de uma organização da qual o alvo é membro
    exists (
      select 1
      from public.org_members me
      join public.org_members them on them.organization_id = me.organization_id
      where me.profile_id = (select auth.uid())
        and me.role = 'admin' and me.is_active and me.deleted_at is null
        and them.profile_id = target_profile
        and them.is_active and them.deleted_at is null
    )
    -- professor vê os responsáveis das crianças que ensina
    or exists (
      select 1
      from public.class_teachers ct
      join public.enrollments e  on e.class_id = ct.class_id
        and e.status = 'active' and e.deleted_at is null
      join public.guardianships g on g.child_id = e.child_id and g.deleted_at is null
      where ct.teacher_id = (select auth.uid()) and ct.deleted_at is null
        and g.guardian_id = target_profile
    )
    -- responsável vê os professores das turmas dos seus filhos
    or exists (
      select 1
      from public.guardianships g
      join public.enrollments e   on e.child_id = g.child_id
        and e.status = 'active' and e.deleted_at is null
      join public.class_teachers ct on ct.class_id = e.class_id and ct.deleted_at is null
      where g.guardian_id = (select auth.uid()) and g.deleted_at is null
        and ct.teacher_id = target_profile
    )
    -- co-responsáveis da mesma criança se enxergam
    or exists (
      select 1
      from public.guardianships g1
      join public.guardianships g2 on g2.child_id = g1.child_id and g2.deleted_at is null
      where g1.guardian_id = (select auth.uid()) and g1.deleted_at is null
        and g2.guardian_id = target_profile
    )
  );
$$;

grant execute on function
  public.teaches_class(uuid),
  public.teaches_child(uuid),
  public.is_guardian_of(uuid),
  public.guardian_in_class(uuid),
  public.can_see_profile(uuid)
to authenticated;
