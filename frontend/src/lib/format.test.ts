import { displayName, fmtScore, friendlyDate, initialOf, isWithinDays, plural, titleCase, whoDid } from './format';

const now = new Date(2026, 9, 28, 18, 0); // 28 Oct 2026, 6 pm local time
const at = (y: number, m: number, d: number, h = 10, min = 5) => new Date(y, m, d, h, min).toISOString();

test('friendly dates', () => {
  expect(friendlyDate(at(2026, 9, 28, 16, 40), now)).toMatch(/^today 4:40\spm$/);
  expect(friendlyDate(at(2026, 9, 27, 9, 5), now)).toMatch(/^yesterday 9:05\sam$/);
  expect(friendlyDate(at(2026, 9, 26), now)).toMatch(/^Monday /);
  expect(friendlyDate(at(2026, 5, 14), now)).toBe('14 Jun');
  expect(friendlyDate(at(2025, 5, 14), now)).toBe('14 Jun 2025');
  expect(friendlyDate(null)).toBe('');
  expect(friendlyDate('not a date')).toBe('');
  // A time with no UTC offset (SQLite) is read as UTC, the same as one that says so.
  expect(friendlyDate('2026-10-28T10:00:00.540244', now)).toBe(friendlyDate('2026-10-28T10:00:00.540244Z', now));
  expect(isWithinDays('2026-10-21T20:00:00', 7, now)).toBe(isWithinDays('2026-10-21T20:00:00+00:00', 7, now));
});

test('this week', () => {
  expect(isWithinDays(at(2026, 9, 28), 7, now)).toBe(true);
  expect(isWithinDays(at(2026, 9, 22), 7, now)).toBe(true);
  expect(isWithinDays(at(2026, 9, 21), 7, now)).toBe(false);
  expect(isWithinDays(null, 7, now)).toBe(false);
});

test('numbers and words', () => {
  expect(plural(1, 'sheet')).toBe('1 sheet');
  expect(plural(5, 'sheet')).toBe('5 sheets');
  expect(fmtScore(38)).toBe('38');
  expect(fmtScore(42.5)).toBe('42.5');
  expect(fmtScore(35.75)).toBe('35.75');
  expect(fmtScore(null)).toBe('–');
});

test('people', () => {
  expect(displayName({ name: '', email: 'priya.teacher@gmail.com' })).toBe('Priya.teacher');
  expect(displayName({ name: 'unknown', email: 'hisham@makerghat.org' })).toBe('Hisham');
  expect(displayName({ name: 'Hisham', email: 'hisham@makerghat.org' })).toBe('Hisham');
  expect(initialOf({ name: '', email: 'priya@x.org' })).toBe('P');
  expect(whoDid('a@x.org', { email: 'a@x.org' })).toBe('you');
  expect(whoDid('priya@x.org', { email: 'a@x.org' })).toBe('Priya');
});

test('names in normal capitals', () => {
  expect(titleCase('SWAMINI  KUTE')).toBe('Swamini Kute');
  expect(titleCase('anne-marie d souza')).toBe('Anne-Marie D Souza');
  expect(titleCase('')).toBe('');
});
