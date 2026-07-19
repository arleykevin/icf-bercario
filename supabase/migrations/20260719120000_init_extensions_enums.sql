-- =============================================================================
-- Fase 0 · Extensões e enums base
-- gen_random_uuid() é nativo (PostgreSQL 13+); pgcrypto fica para hashes de
-- não-repúdio (medicamento/auditoria na Fase 1). Ver PLANO.md §4.2.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Papéis da aplicação. A fonte da verdade do RBAC é org_members.role (papel POR
-- organização) — nada de enum fixo no perfil, para permitir multi-escola.
create type public.app_role as enum ('admin', 'teacher', 'staff', 'guardian');
