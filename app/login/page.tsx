import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";
import { APP_SHORT_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-foreground text-2xl font-semibold">
          {APP_SHORT_NAME}
        </h1>
        <p className="text-muted text-sm">
          Entre para acompanhar o dia a dia do berçário.
        </p>
      </header>

      <LoginForm />
    </main>
  );
}
