import type { Metadata } from "next";
import { SchoolForm } from "@/features/onboarding/components/school-form";

export const metadata: Metadata = {
  title: "Criar escola",
};

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-foreground text-2xl font-semibold">
          Criar sua escola
        </h1>
        <p className="text-muted text-sm">
          Você será o administrador. Depois poderá convidar a equipe e os
          responsáveis, e cadastrar as crianças.
        </p>
      </header>
      <SchoolForm />
    </main>
  );
}
