import { z } from "zod";

export const createClassSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da turma."),
  ageGroup: z.string().trim().max(40).optional(),
});

export const enrollSchema = z.object({
  classId: z.string().uuid("Turma inválida."),
  childIds: z
    .array(z.string().uuid())
    .min(1, "Selecione ao menos uma criança.")
    .max(100, "Muitas crianças de uma vez."),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type EnrollInput = z.infer<typeof enrollSchema>;
