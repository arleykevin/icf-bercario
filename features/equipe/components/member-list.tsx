"use client";

import { useState, useTransition } from "react";
import { offboardMember, setMemberRole, type OffboardState } from "../actions";

export type TeamMember = {
  membershipId: string;
  profileId: string;
  fullName: string;
  role: string;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador(a)" },
  { value: "teacher", label: "Professor(a)" },
  { value: "staff", label: "Equipe" },
] as const;

/**
 * Lista a equipe da escola e permite ao admin remover o acesso de alguém
 * (offboarding). Confirmação em duas etapas por linha; a autorização real e a
 * trava do último admin ficam no servidor/RPC. Não mostra botão para o próprio
 * usuário (evita auto-bloqueio acidental).
 */
export function MemberList({
  organizationId,
  currentUserId,
  members,
}: {
  organizationId: string;
  currentUserId: string;
  members: TeamMember[];
}) {
  if (members.length === 0) {
    return (
      <p className="text-muted text-sm">
        Nenhum membro de equipe ativo além de você.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {members.map((m) => (
        <MemberRow
          key={m.profileId}
          member={m}
          organizationId={organizationId}
          isSelf={m.profileId === currentUserId}
        />
      ))}
    </ul>
  );
}

function MemberRow({
  member,
  organizationId,
  isSelf,
}: {
  member: TeamMember;
  organizationId: string;
  isSelf: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OffboardState | null>(null);
  const [pending, startTransition] = useTransition();
  const [roleMsg, setRoleMsg] = useState<string | null>(null);
  const done = result?.message != null;

  function remove() {
    startTransition(async () => {
      const res = await offboardMember(organizationId, member.profileId);
      setResult(res);
      if (!res.error) setConfirming(false);
    });
  }

  function changeRole(newRole: string) {
    if (newRole === member.role) return;
    startTransition(async () => {
      const res = await setMemberRole(member.membershipId, newRole);
      setRoleMsg(res.error ?? "Papel atualizado.");
    });
  }

  return (
    <li className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3">
      <div className="flex flex-col">
        <span className="text-foreground text-sm font-medium">
          {member.fullName || "(sem nome)"}
          {isSelf ? " (você)" : ""}
        </span>
        {done ? null : (
          <select
            aria-label={`Papel de ${member.fullName || "membro"}`}
            defaultValue={member.role}
            onChange={(e) => changeRole(e.target.value)}
            disabled={pending}
            className="border-border bg-surface text-muted mt-1 w-fit rounded-[var(--radius-lg)] border px-2 py-1 text-xs disabled:opacity-60"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {roleMsg ? (
          <span
            role="status"
            className={
              roleMsg === "Papel atualizado."
                ? "text-muted mt-1 text-xs"
                : "text-critical mt-1 text-xs"
            }
          >
            {roleMsg}
          </span>
        ) : null}
        {result?.error ? (
          <span role="alert" className="text-critical mt-1 text-xs">
            {result.error}
          </span>
        ) : null}
        {done ? (
          <span role="status" className="text-muted mt-1 text-xs">
            Acesso removido.
          </span>
        ) : null}
      </div>

      {isSelf || done ? null : confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-muted text-xs">Confirmar remoção?</span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="border-border text-foreground hover:bg-brand-soft inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] border px-3 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Removendo…" : "Sim, remover"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-muted inline-flex min-h-[var(--touch-min)] items-center px-2 text-sm"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border-border text-foreground inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] border px-4 text-sm font-medium"
        >
          Remover acesso
        </button>
      )}
    </li>
  );
}
