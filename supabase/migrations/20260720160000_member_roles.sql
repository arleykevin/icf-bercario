-- =============================================================================
-- Fase 3 · Gestão de papéis: admin muda o papel de um membro da equipe.
-- Mesmo padrão do offboard: SECURITY DEFINER, advisory lock por org, guard do
-- último admin, auditoria. Não mexe em guardian (papel de família vem com vínculo).
-- =============================================================================

create or replace function public.set_member_role(
  p_membership_id uuid,
  p_new_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_profile uuid;
  v_old_role public.app_role;
  v_other_admin boolean;
begin
  if p_new_role = 'guardian' then
    raise exception 'Papel inválido para equipe.' using errcode = 'P0001';
  end if;

  select organization_id, profile_id, role
    into v_org, v_profile, v_old_role
  from public.org_members
  where id = p_membership_id and is_active and deleted_at is null;

  if v_org is null then
    raise exception 'Vínculo não encontrado.' using errcode = 'P0001';
  end if;
  if not public.is_org_admin(v_org) then
    raise exception 'Apenas administradores mudam papéis.' using errcode = '42501';
  end if;
  if v_old_role = p_new_role then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('member_role_org'), hashtext(v_org::text));

  -- Não rebaixar o último admin ativo.
  if v_old_role = 'admin' and p_new_role <> 'admin' then
    select exists (
      select 1 from public.org_members
      where organization_id = v_org and role = 'admin'
        and is_active and deleted_at is null and profile_id <> v_profile
    ) into v_other_admin;
    if not v_other_admin then
      raise exception 'Não é possível rebaixar o último administrador.'
        using errcode = 'P0001';
    end if;
  end if;

  -- unique(org, profile, role): já tem o papel alvo?
  if exists (
    select 1 from public.org_members
    where organization_id = v_org and profile_id = v_profile and role = p_new_role
  ) then
    raise exception 'Essa pessoa já tem esse papel.' using errcode = 'P0001';
  end if;

  update public.org_members
    set role = p_new_role, updated_at = now()
    where id = p_membership_id;

  insert into public.audit_events
    (organization_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_org, (select auth.uid()), 'member.role_changed', 'profile', v_profile,
    jsonb_build_object('de', v_old_role, 'para', p_new_role)
  );
end;
$$;

revoke all on function public.set_member_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_member_role(uuid, public.app_role) to authenticated;
