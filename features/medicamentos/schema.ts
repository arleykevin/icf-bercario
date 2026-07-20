import { z } from "zod";

export const medStatuses = [
  "administered",
  "refused",
  "skipped",
  "postponed",
] as const;
export type MedStatus = (typeof medStatuses)[number];

export const authorizeMedSchema = z.object({
  childId: z.string().uuid("Criança inválida."),
  medicationName: z.string().trim().min(2, "Informe o medicamento."),
  dosage: z.string().trim().min(1, "Informe a dose."),
  route: z.string().trim().max(40).optional(),
  instructions: z.string().trim().max(500).optional(),
  validFrom: z.string().optional(), // AAAA-MM-DD (default: hoje, no banco)
  validUntil: z.string().min(1, "Informe até quando a autorização vale."),
});

export const administerMedSchema = z.object({
  childId: z.string().uuid("Criança inválida."),
  authorizationId: z.string().uuid("Autorização inválida."),
  status: z.enum(medStatuses),
  note: z.string().trim().max(500).optional(),
});

export type AuthorizeMedInput = z.infer<typeof authorizeMedSchema>;
export type AdministerMedInput = z.infer<typeof administerMedSchema>;
