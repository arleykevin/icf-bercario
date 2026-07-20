"use client";

import { useActionState, useState } from "react";
import { createInvitation, type InviteState } from "../actions";
import { ROLE_LABELS } from "@/lib/auth/roles";

type Student = { id: string; full_name: string };

const initial: InviteState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";

export function InviteForm({
  organizationId,
  students,
}: {
  organizationId: string;
  students: Student[];
}) {
  const [state, action, pending] = useActionState(createInvitation, initial);
  const [role, setRole] = useState("guardian");
  const isGuardian = role === "guardian";

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="invite-email"
          className="text-foreground text-sm font-medium"
        >
          E-mail do convidado
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="invite-role"
          className="text-foreground text-sm font-medium"
        >
          Papel
        </label>
        <select
          id="invite-role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={fieldClass}
        >
          <option value="guardian">{ROLE_LABELS.guardian}</option>
          <option value="teacher">{ROLE_LABELS.teacher}</option>
          <option value="staff">{ROLE_LABELS.staff}</option>
          <option value="admin">{ROLE_LABELS.admin}</option>
        </select>
      </div>

      {isGuardian ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="invite-child"
              className="text-foreground text-sm font-medium"
            >
              Criança
            </label>
            <select id="invite-child" name="childId" className={fieldClass}>
              <option value="">Selecione…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="invite-rel"
              className="text-foreground text-sm font-medium"
            >
              Parentesco
            </label>
            <input
              id="invite-rel"
              name="relationship"
              type="text"
              placeholder="mãe, pai, avó…"
              className={fieldClass}
            />
          </div>
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input type="checkbox" name="isLegalGuardian" className="size-4" />
            Responsável legal (pode assinar consentimentos)
          </label>
        </>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-critical text-sm">
          {state.error}
        </p>
      ) : null}

      {state.inviteUrl ? (
        <div className="border-border bg-brand-soft flex flex-col gap-2 rounded-[var(--radius-lg)] border p-3">
          <p className="text-foreground text-sm font-medium">
            Convite criado — compartilhe este link:
          </p>
          <input
            readOnly
            value={state.inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="border-border bg-surface text-foreground w-full rounded-md border px-2 py-1 text-xs"
          />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Criando…" : "Gerar convite"}
      </button>
    </form>
  );
}
