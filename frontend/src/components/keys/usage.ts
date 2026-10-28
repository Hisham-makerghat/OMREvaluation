// How many batches used each answer key, for "used by 3 batches".
import { Batch, Test } from '../../lib/api';
import { plural } from '../../lib/format';

/** GET /api/batches sends at most this many batches, newest first. */
export const BATCH_LIST_LIMIT = 200;

/** How many batches used one key. `all` is false when older batches may be missing from the count. */
export interface KeyUse {
  count: number;
  all: boolean;
}

export interface Usage {
  counts: Record<string, number>;
  /** When the list was cut short: the time of its oldest batch, as Date.parse gives it. Null when every batch is in it. */
  cutOff: number | null;
}

/** Counts the batches of each key in one GET /api/batches. */
export function usageFrom(batches: Batch[]): Usage {
  const counts: Record<string, number> = {};
  batches.forEach(b => { counts[b.test_id] = (counts[b.test_id] || 0) + 1; });
  if (batches.length < BATCH_LIST_LIMIT) return { counts, cutOff: null };
  const times = batches.map(b => Date.parse(b.created_at)).filter(t => Number.isFinite(t));
  return { counts, cutOff: times.length > 0 ? Math.min(...times) : Infinity };
}

/** One key's count. A batch is always made after its key, so every batch of a key made after the
 *  oldest batch in the list is in the list too: for those keys the count is complete. */
export function usageOf(test: Pick<Test, 'id' | 'created_at'>, usage: Usage): KeyUse {
  const made = Date.parse(test.created_at);
  return { count: usage.counts[test.id] || 0, all: usage.cutOff === null || made > usage.cutOff };
}

/** "used by 3 batches", "used by 3 or more batches", "not used yet"; '' when it cannot be told. */
export function usedByText(use: KeyUse): string {
  if (use.all) return use.count === 0 ? 'not used yet' : `used by ${plural(use.count, 'batch', 'batches')}`;
  return use.count === 0 ? '' : `used by ${use.count} or more batches`;
}
