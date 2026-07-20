"use client";

import { useState, useTransition } from "react";
import { offboardMember, type OffboardState } from "../actions";

export type TeamMember = {
  profileId: string;
  fullName: string;
  role: string;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador(a)",
  teacher: "Professor(a)",
  staff: "Equipe",
  guardian: "Responsável",
};

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
  const done = result?.message != null;

  function remove() {
    startTransition(async () => {
      const res = await offboardMember(organizationId, member.profileId);
      setResult(res);
      if (!res.error) setConfirming(false);
    });
  }

  return (
    <li className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3">
      <div className="flex flex-col">
        <span className="text-foreground text-sm font-medium">
          {member.fullName || "(sem nome)"}
          {isSelf ? " (você)" : ""}
        </span>
        <span className="text-muted text-xs">
          {ROLE_LABEL[member.role] ?? member.role}
        </span>
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
