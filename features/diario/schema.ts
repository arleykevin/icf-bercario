import { z } from "zod";

/**
 * Tipos de evento do Diário de Bordo. `medication` existe no enum do banco, mas é
 * EMITIDO pelo workflow de medicamento assinado (Fase 1.1) — não é lançável aqui.
 */
export const composableEntryTypes = [
  "feeding",
  "sleep",
  "diaper",
  "health",
  "mood",
  "activity",
  "note",
] as const;

export type ComposableEntryType = (typeof composableEntryTypes)[number];

export const feedingAcceptance = [
  "tudo",
  "bem",
  "metade",
  "pouco",
  "recusou",
] as const;
export const diaperKinds = ["xixi", "coco", "ambos", "seca"] as const;
export const moods = [
  "feliz",
  "tranquilo",
  "agitado",
  "choroso",
  "sonolento",
] as const;

/**
 * Entrada do registro (uma ação pode valer p/ VÁRIAS crianças — ação em lote).
 * Campos específicos por tipo são planos aqui e montados em `payload` no servidor.
 * Fonte única de validação: reusada pela server action e (futuro) pelo outbox offline.
 */
export const recordEntrySchema = z
  .object({
    entryType: z.enum(composableEntryTypes),
    childIds: z
      .array(z.string().uuid("Criança inválida."))
      .min(1, "Selecione ao menos uma criança.")
      .max(60, "Muitas crianças de uma vez."),
    occurredAt: z.string().datetime().optional(),
    note: z.string().trim().max(1000).optional(),
    temperatureC: z.number().min(30).max(45).optional(),
    // específicos por tipo:
    acceptance: z.enum(feedingAcceptance).optional(),
    item: z.string().trim().max(120).optional(),
    sleepMinutes: z.number().int().min(0).max(1440).optional(),
    diaperKind: z.enum(diaperKinds).optional(),
    mood: z.enum(moods).optional(),
    activityTitle: z.string().trim().max(120).optional(),
    idempotencyKey: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.entryType === "diaper" && !v.diaperKind) {
      ctx.addIssue({
        code: "custom",
        path: ["diaperKind"],
        message: "Informe o tipo da troca.",
      });
    }
    if (v.entryType === "mood" && !v.mood) {
      ctx.addIssue({
        code: "custom",
        path: ["mood"],
        message: "Selecione o humor.",
      });
    }
    if (v.entryType === "note" && !v.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Escreva a observação.",
      });
    }
    if (v.entryType === "health" && v.temperatureC === undefined && !v.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Registre a temperatura ou descreva o sintoma.",
      });
    }
  });

export type RecordEntryInput = z.infer<typeof recordEntrySchema>;

/** Monta o `payload` jsonb tipado a partir dos campos planos, por tipo de evento. */
export function buildPayload(v: RecordEntryInput): Record<string, unknown> {
  switch (v.entryType) {
    case "feeding":
      return clean({ item: v.item, acceptance: v.acceptance });
    case "sleep":
      return clean({ minutes: v.sleepMinutes });
    case "diaper":
      return clean({ kind: v.diaperKind });
    case "mood":
      return clean({ mood: v.mood });
    case "activity":
      return clean({ title: v.activityTitle });
    case "health":
    case "note":
    default:
      return {};
  }
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, val]) => val !== undefined && val !== ""),
  );
}
