import { z } from "zod";

export const calendarEventTypes = [
  "meal",
  "event",
  "holiday",
  "reminder",
] as const;
export type CalendarEventType = (typeof calendarEventTypes)[number];

export const createEventSchema = z.object({
  eventType: z.enum(calendarEventTypes),
  title: z.string().trim().min(2, "Informe um título."),
  description: z.string().trim().max(500).optional(),
  eventDate: z.string().min(1, "Informe a data."),
  classId: z.string().uuid().optional().or(z.literal("")),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
