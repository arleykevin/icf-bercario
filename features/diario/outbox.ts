import Dexie, { type Table } from "dexie";

/**
 * Fila local (outbox) de registros do diário para quando o tablet de sala fica sem
 * conexão. Cada item carrega uma `idempotencyKey` estável → o servidor deduplica no
 * reenvio (unique organization_id, idempotency_key, occurred_at). Só entradas de UMA
 * criança e SEM foto (foto exige rede). Offline é requisito não-funcional do MVP
 * (PLANO §8 item 8).
 */
export type OutboxEntry = {
  id?: number;
  idempotencyKey: string;
  entryType: string;
  childId: string;
  occurredAt: string;
  classId?: string;
  note?: string;
  temperatureC?: number;
  acceptance?: string;
  item?: string;
  sleepMinutes?: number;
  diaperKind?: string;
  mood?: string;
  activityTitle?: string;
  createdAt: string;
};

class OutboxDB extends Dexie {
  diaryEntries!: Table<OutboxEntry, number>;
  constructor() {
    super("icf-outbox");
    this.version(1).stores({ diaryEntries: "++id, idempotencyKey" });
  }
}

// Instanciação PREGUIÇOSA: só toca no IndexedDB quando chamado no browser (nunca no
// SSR do componente client).
let _db: OutboxDB | null = null;
function db(): OutboxDB {
  if (!_db) _db = new OutboxDB();
  return _db;
}

export async function enqueueEntry(entry: OutboxEntry): Promise<void> {
  await db().diaryEntries.add(entry);
}

export async function getPendingEntries(): Promise<OutboxEntry[]> {
  return db().diaryEntries.orderBy("id").toArray();
}

export async function removeEntry(id: number): Promise<void> {
  await db().diaryEntries.delete(id);
}

export async function countPending(): Promise<number> {
  return db().diaryEntries.count();
}
