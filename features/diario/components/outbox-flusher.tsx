"use client";

import { useCallback, useEffect, useState } from "react";
import { recordDiaryEntries } from "../actions";
import { countPending, getPendingEntries, removeEntry } from "../outbox";

/**
 * Monta-se na área autenticada e esvazia a fila offline do diário: ao carregar, ao
 * voltar a conexão ('online') e quando um item é enfileirado ('icf-outbox-changed').
 * O reenvio é idempotente (a server action faz upsert por idempotency_key), então
 * reprocessar é seguro. Mostra um selo com a contagem pendente.
 */
export function OutboxFlusher() {
  const [pending, setPending] = useState(0);

  const flush = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setPending(await countPending());
        return;
      }
      const items = await getPendingEntries();
      for (const it of items) {
        const fd = new FormData();
        fd.set("entryType", it.entryType);
        fd.set("childIds", it.childId);
        fd.set("occurredAt", it.occurredAt);
        fd.set("idempotencyKey", it.idempotencyKey);
        if (it.classId) fd.set("classId", it.classId);
        if (it.note) fd.set("note", it.note);
        if (it.temperatureC != null)
          fd.set("temperatureC", String(it.temperatureC));
        if (it.acceptance) fd.set("acceptance", it.acceptance);
        if (it.item) fd.set("item", it.item);
        if (it.sleepMinutes != null)
          fd.set("sleepMinutes", String(it.sleepMinutes));
        if (it.diaperKind) fd.set("diaperKind", it.diaperKind);
        if (it.mood) fd.set("mood", it.mood);
        if (it.activityTitle) fd.set("activityTitle", it.activityTitle);

        try {
          const res = await recordDiaryEntries({}, fd);
          if (!res.error && it.id != null) {
            await removeEntry(it.id);
          } else if (res.error) {
            break; // erro de servidor/rede → tenta de novo depois
          }
        } catch {
          break; // sem rede no meio do flush → para e tenta no próximo 'online'
        }
      }
      setPending(await countPending());
    } catch {
      // IndexedDB indisponível (ex.: modo privado) — ignora silenciosamente.
    }
  }, []);

  useEffect(() => {
    // Sincroniza com um sistema externo (fila no IndexedDB) na montagem e em eventos —
    // uso legítimo de effect; o setState acontece após await, não sincronamente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void flush();
    const handler = () => void flush();
    window.addEventListener("online", handler);
    window.addEventListener("icf-outbox-changed", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("icf-outbox-changed", handler);
    };
  }, [flush]);

  if (pending === 0) return null;

  return (
    <div className="border-border bg-surface text-muted fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-medium shadow-md">
      📤 {pending} registro(s) aguardando envio
    </div>
  );
}
