import type { ComposableEntryType } from "./schema";

export type DiaryEntryType = ComposableEntryType | "medication";

/** Linha do diário como volta do banco (database.types é permissivo nesta fase). */
export type DiaryEntryRow = {
  id: string;
  child_id: string;
  entry_type: DiaryEntryType;
  occurred_at: string;
  note: string | null;
  temperature_c: number | string | null;
  payload: Record<string, unknown> | null;
  recorded_by: string | null;
  media_path: string | null;
};

type EntryMeta = {
  label: string;
  emoji: string;
  /** 'health' usa o vermelho reservado a saúde/urgência; 'calm' é o padrão verde. */
  tone: "calm" | "health";
};

export const ENTRY_META: Record<DiaryEntryType, EntryMeta> = {
  feeding: { label: "Alimentação", emoji: "🍲", tone: "calm" },
  sleep: { label: "Sono", emoji: "😴", tone: "calm" },
  diaper: { label: "Troca", emoji: "🧷", tone: "calm" },
  health: { label: "Saúde", emoji: "🌡️", tone: "health" },
  medication: { label: "Medicamento", emoji: "💊", tone: "health" },
  mood: { label: "Humor", emoji: "🙂", tone: "calm" },
  activity: { label: "Atividade", emoji: "🎨", tone: "calm" },
  note: { label: "Recado", emoji: "📝", tone: "calm" },
};

const ACCEPTANCE_TEXT: Record<string, string> = {
  tudo: "aceitou tudo",
  bem: "aceitou bem",
  metade: "comeu metade",
  pouco: "comeu pouco",
  recusou: "recusou",
};

const DIAPER_TEXT: Record<string, string> = {
  xixi: "xixi",
  coco: "cocô",
  ambos: "xixi e cocô",
  seca: "fralda seca",
};

const MOOD_TEXT: Record<string, string> = {
  feliz: "feliz 😊",
  tranquilo: "tranquilo(a) 🙂",
  agitado: "agitado(a)",
  choroso: "choroso(a)",
  sonolento: "sonolento(a) 😴",
};

function str(
  payload: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const v = payload?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function formatTemperature(
  value: number | string | null,
): string | null {
  if (value === null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return null;
  return `${n.toFixed(1).replace(".", ",")}°C`;
}

/** Resumo curto e afetivo (pt-BR) de um evento, para o card da timeline. */
export function summarizeEntry(entry: DiaryEntryRow): string {
  const p = entry.payload;
  switch (entry.entry_type) {
    case "feeding": {
      const item = str(p, "item");
      const acc = str(p, "acceptance");
      const parts = [
        item,
        acc ? (ACCEPTANCE_TEXT[acc] ?? acc) : undefined,
      ].filter(Boolean);
      return parts.length ? parts.join(" — ") : "Alimentação registrada";
    }
    case "sleep": {
      const min = typeof p?.minutes === "number" ? p.minutes : undefined;
      if (!min) return "Dormiu";
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `Dormiu ${h ? `${h}h` : ""}${m ? `${m}min` : ""}`.trim();
    }
    case "diaper": {
      const kind = str(p, "kind");
      return kind ? (DIAPER_TEXT[kind] ?? "Troca") : "Troca";
    }
    case "health": {
      const t = formatTemperature(entry.temperature_c);
      return t ? `Temperatura ${t}` : "Registro de saúde";
    }
    case "medication":
      return "Medicamento administrado";
    case "mood": {
      const mood = str(p, "mood");
      return mood ? (MOOD_TEXT[mood] ?? mood) : "Humor";
    }
    case "activity":
      return str(p, "title") ?? "Atividade";
    case "note":
      return "Recado";
    default:
      return "Registro";
  }
}
