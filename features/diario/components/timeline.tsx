import { ENTRY_META, summarizeEntry, type DiaryEntryRow } from "../entries";

const TZ = "America/Sao_Paulo";

function dateKey(iso: string): string {
  // 'en-CA' formata como AAAA-MM-DD; timeZone fixa o dia no fuso da escola.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(iso),
  );
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function dayHeading(key: string): string {
  const today = dateKey(new Date().toISOString());
  const yesterday = dateKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Hoje";
  if (key === yesterday) return "Ontem";
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: y === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(y, m - 1, d));
}

export function Timeline({
  entries,
  mediaUrls = {},
}: {
  entries: DiaryEntryRow[];
  mediaUrls?: Record<string, string>;
}) {
  if (entries.length === 0) {
    return (
      <div className="border-border bg-surface text-muted rounded-[var(--radius-lg)] border border-dashed p-8 text-center text-sm">
        Nenhum registro ainda. Assim que a rotina do dia for lançada, ela
        aparece aqui. 🌱
      </div>
    );
  }

  // Agrupa por dia (já vem ordenado por occurred_at desc).
  const groups: { key: string; items: DiaryEntryRow[] }[] = [];
  for (const entry of entries) {
    const key = dateKey(entry.occurred_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(entry);
    else groups.push({ key, items: [entry] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">
            {dayHeading(group.key)}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.items.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                mediaUrl={
                  entry.media_path ? mediaUrls[entry.media_path] : undefined
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EntryCard({
  entry,
  mediaUrl,
}: {
  entry: DiaryEntryRow;
  mediaUrl?: string;
}) {
  const meta = ENTRY_META[entry.entry_type] ?? ENTRY_META.note;
  const isHealth = meta.tone === "health";
  const summary = summarizeEntry(entry);
  // Nota extra: só mostra se acrescenta algo além do resumo (temperatura já entra
  // no resumo de saúde).
  const extraNote =
    entry.note && entry.note.trim() && entry.note.trim() !== summary
      ? entry.note.trim()
      : null;

  return (
    <li
      className={[
        "bg-surface flex items-start gap-3 rounded-[var(--radius-lg)] border p-3",
        isHealth ? "border-critical/40" : "border-border",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "flex size-10 shrink-0 items-center justify-center rounded-full text-lg",
          isHealth ? "bg-critical/10" : "bg-brand-soft",
        ].join(" ")}
      >
        {meta.emoji}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={[
              "text-sm font-semibold",
              isHealth ? "text-critical" : "text-foreground",
            ].join(" ")}
          >
            {meta.label}
          </span>
          <time className="text-muted shrink-0 text-xs">
            {timeLabel(entry.occurred_at)}
          </time>
        </div>
        <p className="text-foreground text-sm">{summary}</p>
        {extraNote ? <p className="text-muted text-sm">{extraNote}</p> : null}
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt={`Foto de ${meta.label.toLowerCase()}`}
            loading="lazy"
            className="border-border mt-1 max-h-72 w-full rounded-[var(--radius-lg)] border object-cover"
          />
        ) : null}
      </div>
    </li>
  );
}
