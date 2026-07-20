import { z } from "zod";

export const inviteSchema = z
  .object({
    organizationId: z.string().uuid("Organização inválida."),
    email: z.string().trim().toLowerCase().email("E-mail inválido."),
    role: z.enum(["admin", "teacher", "staff", "guardian"]),
    childId: z.string().uuid().optional().or(z.literal("")),
    relationship: z.string().trim().optional(),
    isLegalGuardian: z.boolean().optional(),
  })
  .refine((v) => v.role !== "guardian" || !!v.childId, {
    message: "Selecione a criança para convidar um responsável.",
    path: ["childId"],
  });

export type InviteInput = z.infer<typeof inviteSchema>;
