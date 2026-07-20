import type { DaySummary } from "../summarize-day";

const MOOD_EMOJI: Record<string, string> = {
  feliz: "😊 feliz",
  tranquilo: "🙂 tranquilo(a)",
  agitado: "😣 agitado(a)",
  choroso: "😢 choroso(a)",
  sonolento: "😴 sonolento(a)",
};

function sleepLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return (
    [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || "—"
  );
}

function fmtTemp(c: number): string {
  return `${c.toFixed(1).replace(".", ",")}°C`;
}

function Chip({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="border-border bg-background text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
      <span aria-hidden>{emoji}</span>
      {label}
    </span>
  );
}

export function DaySummary({
  summary: s,
  childFirstName,
}: {
  summary: DaySummary;
  childFirstName: string;
}) {
  return (
    <section
      aria-labelledby="resumo-heading"
      className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-lg)] border p-5"
    >
      <h2
        id="resumo-heading"
        className="text-foreground text-base font-semibold"
      >
        Resumo de hoje
      </h2>

      {s.total === 0 ? (
        <p className="text-muted text-sm">
          Ainda sem registros de hoje para {childFirstName}. Assim que a rotina
          começar, o resumo aparece aqui. 🌱
        </p>
      ) : (
        <>
          {s.hasFever && s.maxTemperature !== null ? (
            <p className="border-critical/40 bg-critical/10 text-critical flex items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-sm font-medium">
              🌡️ Febre registrada hoje — máxima de {fmtTemp(s.maxTemperature)}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {s.feedingCount > 0 ? (
              <Chip
                emoji="🍲"
                label={`${s.feedingCount} refeiç${s.feedingCount > 1 ? "ões" : "ão"}`}
              />
            ) : null}
            {s.sleepMinutes > 0 ? (
              <Chip emoji="😴" label={`dormiu ${sleepLabel(s.sleepMinutes)}`} />
            ) : null}
            {s.diaperCount > 0 ? (
              <Chip
                emoji="🧷"
                label={`${s.diaperCount} troca${s.diaperCount > 1 ? "s" : ""}`}
              />
            ) : null}
            {s.medicationCount > 0 ? (
              <Chip
                emoji="💊"
                label={`${s.medicationCount} medicament${s.medicationCount > 1 ? "os" : "o"}`}
              />
            ) : null}
            {s.photoCount > 0 ? (
              <Chip
                emoji="📷"
                label={`${s.photoCount} foto${s.photoCount > 1 ? "s" : ""}`}
              />
            ) : null}
            {s.latestMood ? (
              <Chip emoji="" label={MOOD_EMOJI[s.latestMood] ?? s.latestMood} />
            ) : null}
          </div>

          {s.activities.length > 0 ? (
            <p className="text-foreground text-sm">
              <span className="text-muted">Atividades:</span>{" "}
              {s.activities.join(", ")}.
            </p>
          ) : null}

          {s.notes.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {s.notes.map((n, i) => (
                <li key={i} className="text-muted text-sm">
                  📝 {n}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
