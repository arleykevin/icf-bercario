import { signOut } from "../actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="border-border text-foreground focus-visible:ring-ring inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-[var(--radius-lg)] border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        Sair
      </button>
    </form>
  );
}
