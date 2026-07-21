"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addComment,
  deleteReaction,
  toggleHeart,
  type EntryReactions as Reactions,
} from "../reactions";

/**
 * Barra de reação/comentário de um registro do diário. Responsável (canReact)
 * curte e comenta; os demais (professor/admin) veem em modo leitura.
 */
export function EntryReactions({
  childId,
  entryId,
  reactions,
  canReact,
}: {
  childId: string;
  entryId: string;
  reactions: Reactions;
  canReact: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const hearted = reactions.myHeartId != null;

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const hasContent =
    reactions.heartCount > 0 || reactions.comments.length > 0 || canReact;
  if (!hasContent) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {canReact ? (
          <button
            type="button"
            onClick={() => run(() => toggleHeart(childId, entryId))}
            disabled={pending}
            aria-pressed={hearted}
            className={[
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-60",
              hearted
                ? "border-brand bg-brand-soft text-brand"
                : "border-border text-muted",
            ].join(" ")}
          >
            <span aria-hidden>{hearted ? "❤️" : "🤍"}</span>
            {reactions.heartCount > 0 ? reactions.heartCount : "Curtir"}
          </button>
        ) : reactions.heartCount > 0 ? (
          <span className="text-muted inline-flex items-center gap-1 text-xs">
            <span aria-hidden>❤️</span> {reactions.heartCount}
          </span>
        ) : null}

        {canReact ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-muted text-xs font-medium"
          >
            💬 Comentar
          </button>
        ) : null}
      </div>

      {reactions.comments.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {reactions.comments.map((c) => (
            <li key={c.id} className="text-foreground flex gap-1.5 text-sm">
              <span className="text-muted shrink-0 font-medium">
                {c.author}:
              </span>
              <span className="min-w-0 flex-1">{c.text}</span>
              {c.mine ? (
                <button
                  type="button"
                  onClick={() => run(() => deleteReaction(childId, c.id))}
                  disabled={pending}
                  aria-label="Remover comentário"
                  className="text-muted shrink-0 text-xs"
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canReact && open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const value = text;
            setText("");
            setOpen(false);
            run(() => addComment(childId, entryId, value));
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="Escreva um comentário…"
            autoFocus
            className="border-border bg-surface text-foreground min-h-[var(--touch-min)] flex-1 rounded-[var(--radius-lg)] border px-3 text-sm"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="bg-brand text-brand-foreground inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--radius-lg)] px-3 text-sm font-medium disabled:opacity-60"
          >
            Enviar
          </button>
        </form>
      ) : null}
    </div>
  );
}
