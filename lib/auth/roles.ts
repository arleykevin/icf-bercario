/**
 * Papéis da aplicação. Fonte da verdade do RBAC vive em `org_members.role` (papel
 * POR organização) — o mesmo e-mail pode ser professor numa escola e responsável noutra.
 * Ver PLANO.md §3 e §4.1.
 */
export const APP_ROLES = ["admin", "teacher", "staff", "guardian"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Gestão Escolar",
  teacher: "Professor / Cuidador",
  staff: "Equipe",
  guardian: "Responsável",
};

export function isAppRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" &&
    (APP_ROLES as readonly string[]).includes(value)
  );
}
