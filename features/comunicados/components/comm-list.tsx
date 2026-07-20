import { acknowledgeCommunication } from "../actions";
import type { CommPriority } from "../schema";

export type CommRow = {
  id: string;
  class_id: string | null;
  title: string;
  body: string;
  priority: CommPriority;
  requires_ack: boolean;
  created_at: string;
};

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function CommList({
  comms,
  classNames = {},
  ackedMap = {},
  ackCounts = {},
  isGuardian = false,
  isAdmin = false,
}: {
  comms: CommRow[];
  classNames?: Record<string, string>;
  ackedMap?: Record<string, string>;
  ackCounts?: Record<string, number>;
  isGuardian?: boolean;
  isAdmin?: boolean;
}) {
  if (comms.length === 0) {
    return (
      <div className="border-border bg-surface text-muted rounded-[var(--radius-lg)] border border-dashed p-8 text-center text-sm">
        Nenhum comunicado por enquanto. 📣
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {comms.map((c) => {
        const urgent = c.priority === "urgent";
        const acked = ackedMap[c.id];
        return (
          <li
            key={c.id}
            className={[
              "bg-surface flex flex-col gap-2 rounded-[var(--radius-lg)] border p-4",
              urgent ? "border-critical/50" : "border-border",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={[
                  "text-sm font-semibold",
                  urgent ? "text-critical" : "text-foreground",
                ].join(" ")}
              >
                {urgent ? "🔴 " : ""}
                {c.title}
              </span>
              <time className="text-muted shrink-0 text-xs">
                {fmtDateTime(c.created_at)}
              </time>
            </div>

            <p className="text-foreground text-sm whitespace-pre-line">
              {c.body}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-xs">
                {c.class_id
                  ? (classNames[c.class_id] ?? "Turma")
                  : "Escola toda"}
              </span>
              {isAdmin && c.requires_ack ? (
                <span className="text-muted text-xs">
                  {ackCounts[c.id] ?? 0} ciente(s)
                </span>
              ) : null}
            </div>

            {isGuardian && c.requires_ack ? (
              acked ? (
                <p className="text-brand text-sm font-medium">
                  ✓ Você deu ciente em {fmtDateTime(acked)}
                </p>
              ) : (
                <form action={acknowledgeCommunication}>
                  <input type="hidden" name="communicationId" value={c.id} />
                  <button
                    type="submit"
                    className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] w-fit items-center justify-center rounded-[var(--radius-lg)] px-4 text-sm font-medium"
                  >
                    Marcar como ciente
                  </button>
                </form>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
