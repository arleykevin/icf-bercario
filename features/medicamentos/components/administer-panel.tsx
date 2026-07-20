"use client";

import { useActionState } from "react";
import { administerMedication, type MedState } from "../actions";
import { medStatuses } from "../schema";

export type MedAuthorization = {
  id: string;
  medication_name: string;
  dosage: string;
  route: string | null;
  instructions: string | null;
  valid_from: string;
  valid_until: string;
};

const STATUS_LABEL: Record<string, string> = {
  administered: "Administrado",
  refused: "Recusado",
  skipped: "Pulado",
  postponed: "Adiado",
};

const initial: MedState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";

/**
 * Painel do educador: lista as autorizações vigentes e registra a administração de
 * cada uma. `canAdminister` false = visão só-leitura (ex.: responsável).
 */
export function AdministerPanel({
  childId,
  authorizations,
  canAdminister,
}: {
  childId: string;
  authorizations: MedAuthorization[];
  canAdminister: boolean;
}) {
  if (authorizations.length === 0) {
    return (
      <p className="text-muted text-sm">
        Nenhuma autorização de medicamento vigente.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {authorizations.map((auth) => (
        <li
          key={auth.id}
          className="border-border rounded-[var(--radius-lg)] border p-4"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground text-sm font-semibold">
              {auth.medication_name} · {auth.dosage}
              {auth.route ? ` · ${auth.route}` : ""}
            </span>
            {auth.instructions ? (
              <span className="text-muted text-sm">{auth.instructions}</span>
            ) : null}
            <span className="text-muted text-xs">
              Vigente até {formatDate(auth.valid_until)}
            </span>
          </div>

          {canAdminister ? (
            <AdministerRow childId={childId} authorizationId={auth.id} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AdministerRow({
  childId,
  authorizationId,
}: {
  childId: string;
  authorizationId: string;
}) {
  const [state, action, pending] = useActionState(
    administerMedication,
    initial,
  );

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="authorizationId" value={authorizationId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-foreground text-xs font-medium">Situação</span>
          <select
            name="status"
            defaultValue="administered"
            className={fieldClass}
          >
            {medStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <input
          name="note"
          type="text"
          placeholder="Observação (opcional)"
          className={fieldClass + " flex-1"}
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-critical text-critical-foreground focus-visible:ring-critical inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] px-4 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          {pending ? "Registrando…" : "Registrar"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-critical text-sm">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-brand text-sm font-medium">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
