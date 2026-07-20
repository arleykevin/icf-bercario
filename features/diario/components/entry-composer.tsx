"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { recordDiaryEntries, type RecordState } from "../actions";
import {
  composableEntryTypes,
  diaperKinds,
  feedingAcceptance,
  moods,
  type ComposableEntryType,
} from "../schema";
import { ENTRY_META } from "../entries";

const initial: RecordState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";
const labelClass = "text-foreground text-sm font-medium";

const ACCEPTANCE_LABEL: Record<string, string> = {
  tudo: "Aceitou tudo",
  bem: "Aceitou bem",
  metade: "Metade",
  pouco: "Pouco",
  recusou: "Recusou",
};
const DIAPER_LABEL: Record<string, string> = {
  xixi: "Xixi",
  coco: "Cocô",
  ambos: "Ambos",
  seca: "Seca",
};
const MOOD_LABEL: Record<string, string> = {
  feliz: "Feliz",
  tranquilo: "Tranquilo(a)",
  agitado: "Agitado(a)",
  choroso: "Choroso(a)",
  sonolento: "Sonolento(a)",
};

export function EntryComposer({
  childIds,
  classId,
}: {
  childIds: string[];
  classId?: string;
}) {
  const [state, action, pending] = useActionState(recordDiaryEntries, initial);
  const [type, setType] = useState<ComposableEntryType>("feeding");
  const formRef = useRef<HTMLFormElement>(null);
  const hasSelection = childIds.length > 0;
  const isHealth = type === "health";

  useEffect(() => {
    if (state.count) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="entryType" value={type} />
      <input type="hidden" name="childIds" value={childIds.join(",")} />
      {classId ? <input type="hidden" name="classId" value={classId} /> : null}

      {/* Seletor de tipo — alvos grandes de toque */}
      <div
        role="radiogroup"
        aria-label="Tipo de registro"
        className="flex flex-wrap gap-2"
      >
        {composableEntryTypes.map((t) => {
          const meta = ENTRY_META[t];
          const active = t === type;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setType(t)}
              className={[
                "inline-flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-[var(--radius-lg)] border px-3 text-sm font-medium",
                active
                  ? meta.tone === "health"
                    ? "border-critical bg-critical/10 text-critical"
                    : "border-brand bg-brand-soft text-brand"
                  : "border-border bg-surface text-foreground",
              ].join(" ")}
            >
              <span aria-hidden>{meta.emoji}</span>
              {meta.label}
            </button>
          );
        })}
      </div>

      <TypeFields type={type} />

      {/* Foto — só ao registrar para UMA criança (Storage privado + signed URL) */}
      {childIds.length === 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="entry-photo" className={labelClass}>
            Foto (opcional)
          </label>
          <input
            id="entry-photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-muted file:bg-brand-soft file:text-brand text-sm file:mr-3 file:min-h-[var(--touch-min)] file:rounded-[var(--radius-lg)] file:border-0 file:px-4 file:font-medium"
          />
          <span className="text-muted text-xs">
            JPG, PNG ou WEBP · até 8 MB
          </span>
        </div>
      ) : null}

      {/* Nota (todos os tipos) */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="entry-note" className={labelClass}>
          {type === "note" ? "Recado" : "Observação (opcional)"}
        </label>
        <textarea
          id="entry-note"
          name="note"
          rows={2}
          placeholder={isHealth ? "Descreva o sintoma…" : "Algo a acrescentar…"}
          className={fieldClass + " py-2"}
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

      {!hasSelection ? (
        <p className="text-muted text-sm">
          Selecione ao menos uma criança para registrar.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !hasSelection}
        className={[
          "inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60",
          isHealth
            ? "bg-critical text-critical-foreground focus-visible:ring-critical"
            : "bg-brand text-brand-foreground focus-visible:ring-ring",
        ].join(" ")}
      >
        {pending
          ? "Salvando…"
          : childIds.length > 1
            ? `Registrar para ${childIds.length}`
            : "Registrar"}
      </button>
    </form>
  );
}

function TypeFields({ type }: { type: ComposableEntryType }) {
  switch (type) {
    case "feeding":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="O que comeu (opcional)">
            <input
              name="item"
              type="text"
              placeholder="papa, fruta, leite…"
              className={fieldClass}
            />
          </Field>
          <Field label="Aceitação">
            <select name="acceptance" defaultValue="" className={fieldClass}>
              <option value="">—</option>
              {feedingAcceptance.map((a) => (
                <option key={a} value={a}>
                  {ACCEPTANCE_LABEL[a]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      );
    case "sleep":
      return (
        <Field label="Duração (minutos)">
          <input
            name="sleepMinutes"
            type="number"
            min={0}
            max={1440}
            inputMode="numeric"
            placeholder="ex.: 90"
            className={fieldClass}
          />
        </Field>
      );
    case "diaper":
      return (
        <Field label="Tipo da troca">
          <select name="diaperKind" defaultValue="" className={fieldClass}>
            <option value="">Selecione…</option>
            {diaperKinds.map((k) => (
              <option key={k} value={k}>
                {DIAPER_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      );
    case "health":
      return (
        <Field label="Temperatura (°C)">
          <input
            name="temperatureC"
            type="number"
            step="0.1"
            min={30}
            max={45}
            inputMode="decimal"
            placeholder="ex.: 38.5"
            className={fieldClass}
          />
        </Field>
      );
    case "mood":
      return (
        <Field label="Humor">
          <select name="mood" defaultValue="" className={fieldClass}>
            <option value="">Selecione…</option>
            {moods.map((m) => (
              <option key={m} value={m}>
                {MOOD_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      );
    case "activity":
      return (
        <Field label="Atividade">
          <input
            name="activityTitle"
            type="text"
            placeholder="rodinha, pintura, parque…"
            className={fieldClass}
          />
        </Field>
      );
    case "note":
    default:
      return null;
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  );
}
