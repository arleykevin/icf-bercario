import { deleteCalendarEvent } from "../actions";
import type { CalendarEventType } from "../schema";

export type CalendarEventRow = {
  id: string;
  class_id: string | null;
  event_type: CalendarEventType;
  title: string;
  description: string | null;
  event_date: string; // AAAA-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
};

const TYPE_META: Record<CalendarEventType, { emoji: string; label: string }> = {
  meal: { emoji: "🍽️", label: "Cardápio" },
  event: { emoji: "📌", label: "Evento" },
  holiday: { emoji: "🎉", label: "Feriado" },
  reminder: { emoji: "🔔", label: "Lembrete" },
};

function ymd(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);
}

function dayHeading(date: string): string {
  if (date === ymd(0)) return "Hoje";
  if (date === ymd(1)) return "Amanhã";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

export function CalendarView({
  events,
  classNames = {},
  isAdmin = false,
}: {
  events: CalendarEventRow[];
  classNames?: Record<string, string>;
  isAdmin?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="border-border bg-surface text-muted rounded-[var(--radius-lg)] border border-dashed p-8 text-center text-sm">
        Nenhum evento nos próximos dias. 🗓️
      </div>
    );
  }

  const groups: { date: string; items: CalendarEventRow[] }[] = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.date === ev.event_date) last.items.push(ev);
    else groups.push({ date: ev.event_date, items: [ev] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.date} className="flex flex-col gap-3">
          <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">
            {dayHeading(group.date)}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.items.map((ev) => {
              const meta = TYPE_META[ev.event_type] ?? TYPE_META.event;
              const time = hhmm(ev.start_time);
              return (
                <li
                  key={ev.id}
                  className="border-border bg-surface flex items-start gap-3 rounded-[var(--radius-lg)] border p-3"
                >
                  <span
                    aria-hidden
                    className="bg-brand-soft flex size-10 shrink-0 items-center justify-center rounded-full text-lg"
                  >
                    {meta.emoji}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-foreground text-sm font-semibold">
                        {ev.title}
                      </span>
                      {time ? (
                        <time className="text-muted shrink-0 text-xs">
                          {time}
                          {hhmm(ev.end_time) ? `–${hhmm(ev.end_time)}` : ""}
                        </time>
                      ) : null}
                    </div>
                    {ev.description ? (
                      <p className="text-muted text-sm">{ev.description}</p>
                    ) : null}
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-muted text-xs">{meta.label}</span>
                      <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-xs">
                        {ev.class_id
                          ? (classNames[ev.class_id] ?? "Turma")
                          : "Escola toda"}
                      </span>
                    </div>
                  </div>
                  {isAdmin ? (
                    <form action={deleteCalendarEvent}>
                      <input type="hidden" name="id" value={ev.id} />
                      <button
                        type="submit"
                        aria-label={`Excluir ${ev.title}`}
                        className="text-muted hover:text-critical min-h-[var(--touch-min)] px-2 text-sm"
                      >
                        Excluir
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
