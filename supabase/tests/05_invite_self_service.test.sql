-- =============================================================================
-- Aceite de convite DENTRO do app: my_pending_invitations lista o convite pelo
-- e-mail do usuário; accept_invitation_by_email assume o vínculo SÓ com e-mail
-- VERIFICADO (mesma garantia do aceite por token). Ver *_invite_self_service.sql.
-- =============================================================================
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-00000000005a',
   'authenticated', 'authenticated', 'g@self.dev', now(), now(), now()),
  -- e-mail NÃO verificado
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-00000000005b',
   'authenticated', 'authenticated', 'u@self.dev', null, now(), now());

do $$
declare v_org uuid;
begin
  insert into public.organizations (name, slug) values ('Escola Self', 'escola-self')
  returning id into v_org;

  insert into public.children (id, organization_id, full_name, birth_date)
  values ('c5000000-0000-0000-0000-000000000050', v_org, 'Bebê Self', '2024-05-05');

  insert into public.invitations (organization_id, email, role, child_id, relationship, token_hash, expires_at)
  values (v_org, 'g@self.dev', 'guardian', 'c5000000-0000-0000-0000-000000000050', 'mãe',
          encode(extensions.digest('tok-self', 'sha256'), 'hex'), now() + interval '7 days');

  insert into public.invitations (organization_id, email, role, token_hash, expires_at)
  values (v_org, 'u@self.dev', 'teacher',
          encode(extensions.digest('tok-unconf-self', 'sha256'), 'hex'), now() + interval '7 days');
end $$;

-- === RESPONSÁVEL (e-mail verificado) ===
set local "request.jwt.claims" to '{"sub":"a5000000-0000-0000-0000-00000000005a"}';

select is(
  (select count(*) from public.my_pending_invitations()),
  1::bigint,
  'my_pending_invitations lista o convite pendente do próprio e-mail');

select is(
  (select public.accept_invitation_by_email()),
  1,
  'accept_invitation_by_email aceita 1 convite (e-mail verificado confere)');

select ok(
  exists (select 1 from public.guardianships
          where guardian_id = 'a5000000-0000-0000-0000-00000000005a'
            and child_id = 'c5000000-0000-0000-0000-000000000050')
  and exists (select 1 from public.consents
              where guardian_id = 'a5000000-0000-0000-0000-00000000005a'
                and purpose = 'general_terms'),
  'vínculo de responsável + consentimento foram criados');

select ok(
  exists (select 1 from public.invitations
          where email = 'g@self.dev' and status = 'accepted'),
  'convite passou a accepted');

select is(
  (select count(*) from public.my_pending_invitations()),
  0::bigint,
  'não há mais convite pendente após aceitar');

-- === E-MAIL NÃO VERIFICADO é rejeitado ===
set local "request.jwt.claims" to '{"sub":"a5000000-0000-0000-0000-00000000005b"}';
select throws_ok(
  $$ select public.accept_invitation_by_email() $$,
  '42501',
  'aceite exige e-mail verificado (não verificado -> 42501)');

select * from finish();
rollback;
