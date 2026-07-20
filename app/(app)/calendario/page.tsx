import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/features/calendario/components/event-form";
import {
  CalendarView,
  type CalendarEventRow,
} from "@/features/calendario/components/calendar-view";

export const metadata: Metadata = {
  title: "Calendário",
};

export default async function CalendarioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

  const today = new Date().toISOString().slice(0, 10);

  // Eventos futuros que o usuário pode ver (RLS: escola inteira dos seus vínculos +
  // eventos das turmas dele; admin vê tudo da escola).
  const { data: eventsData } = await supabase
    .from("calendar_events")
    .select(
      "id, class_id, event_type, title, description, event_date, start_time, end_time",
    )
    .gte("event_date", today)
    .is("deleted_at", null)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true })
    .limit(200);
  const events = (eventsData ?? []) as CalendarEventRow[];

  // É admin de alguma escola? (habilita criar/excluir)
  const { data: adminOrg } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("profile_id", uid)
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const isAdmin = Boolean(adminOrg);

  // Turmas para o formulário (da escola que administro) e nomes p/ os badges.
  let classes: { id: string; name: string }[] = [];
  if (adminOrg) {
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .eq("organization_id", adminOrg.organization_id as string)
      .is("deleted_at", null)
      .order("name");
    classes = (data ?? []) as { id: string; name: string }[];
  }

  const classIds = [
    ...new Set(events.map((e) => e.class_id).filter((c): c is string => !!c)),
  ];
  const classNames: Record<string, string> = {};
  for (const c of classes) classNames[c.id] = c.name;
  const missing = classIds.filter((id) => !classNames[id]);
  if (missing.length) {
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .in("id", missing);
    for (const c of (data ?? []) as { id: string; name: string }[]) {
      classNames[c.id] = c.name;
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/inicio" className="text-muted w-fit text-sm">
          ← Início
        </Link>
        <h1 className="text-foreground text-2xl font-semibold">Calendário</h1>
        <p className="text-muted text-sm">
          Cardápio da semana e eventos da escola.
        </p>
      </header>

      {isAdmin ? (
        <section className="border-border bg-surface rounded-[var(--radius-lg)] border p-5">
          <details>
            <summary className="text-brand min-h-[var(--touch-min)] cursor-pointer text-sm font-medium">
              Adicionar evento ou cardápio
            </summary>
            <div className="mt-4">
              <EventForm classes={classes} />
            </div>
          </details>
        </section>
      ) : null}

      <section aria-label="Agenda">
        <CalendarView
          events={events}
          classNames={classNames}
          isAdmin={isAdmin}
        />
      </section>
    </main>
  );
}
