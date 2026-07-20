import { z } from "zod";

export const healthSchema = z.object({
  childId: z.string().uuid("Criança inválida."),
  bloodType: z.string().trim().max(10).optional(),
  allergies: z.string().trim().max(1000).optional(),
  dietaryRestrictions: z.string().trim().max(1000).optional(),
  medicalNotes: z.string().trim().max(2000).optional(),
});

export const pickupSchema = z.object({
  childId: z.string().uuid("Criança inválida."),
  name: z.string().trim().min(2, "Informe o nome."),
  relationship: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(30).optional(),
});

export type HealthInput = z.infer<typeof healthSchema>;
export type PickupInput = z.infer<typeof pickupSchema>;
