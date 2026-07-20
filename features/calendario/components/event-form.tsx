"use client";

import { useActionState } from "react";
import { createCalendarEvent, type CalendarState } from "../actions";
import { calendarEventTypes } from "../schema";

const initial: CalendarState = {};

const fieldClass =
  "border-border bg-surface text-foreground focus-visible:ring-ring min-h-[var(--touch-min)] w-full rounded-[var(--radius-lg)] border px-4 focus-visible:ring-2 focus-visible:outline-none";
const labelClass = "text-foreground text-sm font-medium";

const TYPE_LABEL: Record<string, string> = {
  meal: "Cardápio",
  event: "Evento",
  holiday: "Feriado",
  reminder: "Lembrete",
};

export function EventForm({
  classes,
}: {
  classes: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createCalendarEvent, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-type" className={labelClass}>
            Tipo
          </label>
          <select
            id="ev-type"
            name="eventType"
            defaultValue="event"
            className={fieldClass}
          >
            {calendarEventTypes.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-date" className={labelClass}>
            Data
          </label>
          <input
            id="ev-date"
            name="eventDate"
            type="date"
            required
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="ev-title" className={labelClass}>
            Título
          </label>
          <input
            id="ev-title"
            name="title"
            type="text"
            required
            placeholder="ex.: Almoço — arroz, feijão e frango"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-class" className={labelClass}>
            Alcance
          </label>
          <select
            id="ev-class"
            name="classId"
            defaultValue=""
            className={fieldClass}
          >
            <option value="">Escola inteira</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ev-start" className={labelClass}>
              Início (opcional)
            </label>
            <input
              id="ev-start"
              name="startTime"
              type="time"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ev-end" className={labelClass}>
              Fim (opcional)
            </label>
            <input
              id="ev-end"
              name="endTime"
              type="time"
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ev-desc" className={labelClass}>
          Descrição (opcional)
        </label>
        <textarea
          id="ev-desc"
          name="description"
          rows={2}
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

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-brand-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-5 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Adicionando…" : "Adicionar ao calendário"}
      </button>
    </form>
  );
}
