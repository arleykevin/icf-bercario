"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupply, resolveSupply } from "../actions";

export type SupplyItem = {
  id: string;
  item: string;
  status: string;
};

/**
 * Suprimentos por criança (loop fechado). Professor/admin (canManage) sinalizam e
 * resolvem; o responsável vê o que está acabando para repor.
 */
export function SuppliesPanel({
  childId,
  supplies,
  canManage,
}: {
  childId: string;
  supplies: SupplyItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [item, setItem] = useState("");
  const [pending, startTransition] = useTransition();
  const open = supplies.filter((s) => s.status === "open");

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = item.trim();
    if (!value) return;
    setItem("");
    startTransition(async () => {
      await createSupply(childId, value);
      router.refresh();
    });
  }

  function resolve(id: string) {
    startTransition(async () => {
      await resolveSupply(childId, id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {open.length === 0 ? (
        <p className="text-muted text-sm">Nada acabando no momento. ✅</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((s) => (
            <li
              key={s.id}
              className="border-border flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-2 text-sm"
            >
              <span className="text-foreground">📦 {s.item}</span>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => resolve(s.id)}
                  disabled={pending}
                  className="text-brand shrink-0 text-sm font-medium disabled:opacity-60"
                >
                  Resolver
                </button>
              ) : (
                <span className="text-muted shrink-0 text-xs">a repor</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={add} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => setItem(e.target.value.slice(0, 80))}
            placeholder="O que está acabando? (ex.: fraldas)"
            className="border-border bg-surface text-foreground min-h-[var(--touch-min)] flex-1 rounded-[var(--radius-lg)] border px-3 text-sm"
          />
          <button
            type="submit"
            disabled={pending || !item.trim()}
            className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] px-4 text-sm font-medium disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
      ) : null}
    </div>
  );
}
