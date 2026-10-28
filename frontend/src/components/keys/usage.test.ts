import { Batch } from '../../lib/api';
import { usageFrom, usageOf, usedByText } from './usage';

const batch = (testId: string, createdAt: string) => ({ test_id: testId, created_at: createdAt } as Batch);
const key = (id: string, createdAt: string) => ({ id, created_at: createdAt });

test('a short list counts every batch', () => {
  const usage = usageFrom([batch('t1', '2026-10-02T09:00:00Z'), batch('t1', '2026-10-03T09:00:00Z')]);
  expect(usageOf(key('t1', '2026-10-01T09:00:00Z'), usage)).toEqual({ count: 2, all: true });
  expect(usageOf(key('t2', '2026-06-01T09:00:00Z'), usage)).toEqual({ count: 0, all: true });
});

test('a full list is complete only for keys made after its oldest batch', () => {
  const list = Array.from({ length: 200 }, (_, i) => batch(i < 3 ? 'old' : 'new', `2026-09-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z`));
  const usage = usageFrom(list);
  expect(usageOf(key('new', '2026-10-01T09:00:00Z'), usage)).toEqual({ count: 197, all: true });
  expect(usageOf(key('old', '2026-06-15T09:00:00Z'), usage)).toEqual({ count: 3, all: false });
  expect(usageOf(key('older', '2026-05-15T09:00:00Z'), usage)).toEqual({ count: 0, all: false });
});

test('words', () => {
  expect(usedByText({ count: 0, all: true })).toBe('not used yet');
  expect(usedByText({ count: 1, all: true })).toBe('used by 1 batch');
  expect(usedByText({ count: 3, all: true })).toBe('used by 3 batches');
  expect(usedByText({ count: 3, all: false })).toBe('used by 3 or more batches');
  expect(usedByText({ count: 0, all: false })).toBe('');
});
