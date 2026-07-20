"use client";

import { useActionState } from "react";
import { addPickup, removePickup, type PerfilState } from "../actions";

export type Pickup = {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
};

const initial: PerfilState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";

export function PickupsManager({
  childId,
  pickups,
  canManage,
}: {
  childId: string;
  pickups: Pickup[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(addPickup, initial);

  return (
    <div className="flex flex-col gap-4">
      {pickups.length === 0 ? (
        <p className="text-muted text-sm">
          Nenhuma pessoa autorizada além dos responsáveis cadastrados.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {pickups.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-foreground text-sm font-medium">
                  {p.name}
                  {p.relationship ? (
                    <span className="text-muted font-normal">
                      {" "}
                      · {p.relationship}
                    </span>
                  ) : null}
                </span>
                {p.phone ? (
                  <span className="text-muted text-xs">{p.phone}</span>
                ) : null}
              </div>
              {canManage ? (
                <form action={removePickup}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="childId" value={childId} />
                  <button
                    type="submit"
                    className="text-muted hover:text-critical min-h-[var(--touch-min)] px-2 text-sm"
                    aria-label={`Remover ${p.name}`}
                  >
                    Remover
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form
          action={action}
          className="border-border flex flex-col gap-3 border-t pt-4"
          noValidate
        >
          <input type="hidden" name="childId" value={childId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              name="name"
              type="text"
              required
              placeholder="Nome"
              className={fieldClass}
            />
            <input
              name="relationship"
              type="text"
              placeholder="Vínculo (avó, tio…)"
              className={fieldClass}
            />
            <input
              name="phone"
              type="tel"
              placeholder="Telefone"
              className={fieldClass}
            />
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
          <button
            type="submit"
            disabled={pending}
            className="bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
          >
            {pending ? "Adicionando…" : "Adicionar autorizado"}
          </button>
          <p className="text-muted text-xs">
            Guardamos só nome, vínculo e telefone — sem RG (minimização LGPD).
          </p>
        </form>
      ) : null}
    </div>
  );
}
