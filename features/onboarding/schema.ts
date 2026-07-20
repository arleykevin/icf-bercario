import { z } from "zod";

export const schoolSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da escola."),
});

export type SchoolInput = z.infer<typeof schoolSchema>;
