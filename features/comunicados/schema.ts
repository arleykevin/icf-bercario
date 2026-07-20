import { z } from "zod";

export const commPriorities = ["normal", "urgent"] as const;
export type CommPriority = (typeof commPriorities)[number];

export const createCommSchema = z.object({
  title: z.string().trim().min(2, "Informe um título."),
  body: z.string().trim().min(2, "Escreva o comunicado."),
  priority: z.enum(commPriorities),
  classId: z.string().uuid().optional().or(z.literal("")),
  requiresAck: z.boolean().optional(),
});

export type CreateCommInput = z.infer<typeof createCommSchema>;
