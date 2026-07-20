import type { DiaryEntryRow } from "@/features/diario/entries";

export type DaySummary = {
  total: number;
  feedingCount: number;
  sleepMinutes: number;
  diaperCount: number;
  medicationCount: number;
  photoCount: number;
  activities: string[];
  notes: string[];
  latestMood: string | null;
  maxTemperature: number | null;
  hasFever: boolean;
};

const FEVER_C = 37.8;

function num(
  payload: Record<string, unknown> | null,
  key: string,
): number | null {
  const v = payload?.[key];
  return typeof v === "number" ? v : null;
}
function str(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  const v = payload?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function toNum(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? null : n;
}

/**
 * Agrega os eventos de UM dia (já filtrados) num digest afetivo para os pais.
 * `entries` pode vir em qualquer ordem; para "último humor" assumimos que estão
 * ordenados por occurred_at desc (como vêm do diário).
 */
export function summarizeDay(entries: DiaryEntryRow[]): DaySummary {
  const s: DaySummary = {
    total: entries.length,
    feedingCount: 0,
    sleepMinutes: 0,
    diaperCount: 0,
    medicationCount: 0,
    photoCount: 0,
    activities: [],
    notes: [],
    latestMood: null,
    maxTemperature: null,
    hasFever: false,
  };

  for (const e of entries) {
    if (e.media_path) s.photoCount += 1;

    switch (e.entry_type) {
      case "feeding":
        s.feedingCount += 1;
        break;
      case "sleep": {
        const m = num(e.payload, "minutes");
        if (m) s.sleepMinutes += m;
        break;
      }
      case "diaper":
        s.diaperCount += 1;
        break;
      case "medication":
        s.medicationCount += 1;
        break;
      case "mood": {
        // primeira ocorrência (entries desc) = humor mais recente
        if (!s.latestMood) s.latestMood = str(e.payload, "mood");
        break;
      }
      case "activity": {
        const t = str(e.payload, "title");
        if (t) s.activities.push(t);
        break;
      }
      case "health": {
        const t = toNum(e.temperature_c);
        if (t !== null && (s.maxTemperature === null || t > s.maxTemperature)) {
          s.maxTemperature = t;
        }
        break;
      }
      case "note":
        if (e.note) s.notes.push(e.note.trim());
        break;
    }
  }

  s.hasFever = s.maxTemperature !== null && s.maxTemperature >= FEVER_C;
  return s;
}
