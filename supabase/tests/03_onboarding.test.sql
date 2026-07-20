-- =============================================================================
-- Onboarding: create_school faz o bootstrap do 1º admin; accept_invitation cria
-- membership + vínculo + consentimento SÓ quando o e-mail do usuário confere.
-- Ver supabase/migrations/*_onboarding*.sql e PLANO.md §5.1.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(7);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-0000000000f0',
   'authenticated', 'authenticated', 'founder@test.dev', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000060',
   'authenticated', 'authenticated', 'guardian@test.dev', now(), now(), now()),
  -- e-mail NÃO confirmado (email_confirmed_at NULL)
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000070',
   'authenticated', 'authenticated', 'unconf@test.dev', null, now(), now());

-- === create_school: bootstrap do primeiro admin ===
set local "request.jwt.claims" to '{"sub":"f0000000-0000-0000-0000-0000000000f0"}';
select lives_ok(
  $$ select public.create_school('Escola X', 'escola-x') $$,
  'create_school executa para um usuário autenticado');

select ok(
  exists (select 1 from public.organizations where slug = 'escola-x'),
  'a escola foi criada');

select ok(
  exists (
    select 1 from public.org_members om
    join public.organizations o on o.id = om.organization_id
    where o.slug = 'escola-x'
      and om.profile_id = 'f0000000-0000-0000-0000-0000000000f0'
      and om.role = 'admin'
  ),
  'o fundador virou admin da escola');

-- Prepara criança + convites (como postgres, ignorando RLS).
do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'escola-x';

  insert into public.children (id, organization_id, full_name, birth_date)
  values ('c9000000-0000-0000-0000-000000000090', v_org, 'Bebê X', '2024-05-05');

  insert into public.invitations (organization_id, email, role, child_id, relationship, token_hash, expires_at)
  values (v_org, 'guardian@test.dev', 'guardian', 'c9000000-0000-0000-0000-000000000090', 'mãe',
          encode(extensions.digest('tok-guardian', 'sha256'), 'hex'), now() + interval '7 days');

  insert into public.invitations (organization_id, email, role, token_hash, expires_at)
  values (v_org, 'outro@test.dev', 'teacher',
          encode(extensions.digest('tok-wrong', 'sha256'), 'hex'), now() + interval '7 days');

  insert into public.invitations (organization_id, email, role, token_hash, expires_at)
  values (v_org, 'unconf@test.dev', 'teacher',
          encode(extensions.digest('tok-unconf', 'sha256'), 'hex'), now() + interval '7 days');
end $$;

-- === accept_invitation: e-mail confere ===
set local "request.jwt.claims" to '{"sub":"60000000-0000-0000-0000-000000000060"}';
select lives_ok(
  $$ select public.accept_invitation('tok-guardian') $$,
  'accept_invitation executa quando o e-mail confere');

select ok(
  exists (select 1 from public.guardianships
          where guardian_id = '60000000-0000-0000-0000-000000000060'
            and child_id = 'c9000000-0000-0000-0000-000000000090')
  and exists (select 1 from public.consents
              where guardian_id = '60000000-0000-0000-0000-000000000060'
                and purpose = 'general_terms'),
  'vínculo de responsável + consentimento foram criados');

-- === accept_invitation: e-mail DIVERGENTE é rejeitado (42501) ===
select throws_ok(
  $$ select public.accept_invitation('tok-wrong') $$,
  '42501');

-- === accept_invitation: e-mail NÃO VERIFICADO é rejeitado (42501) ===
set local "request.jwt.claims" to '{"sub":"70000000-0000-0000-0000-000000000070"}';
select throws_ok(
  $$ select public.accept_invitation('tok-unconf') $$,
  '42501');

select * from finish();
rollback;
