// Plain-language formatting shared by every screen.
import { User } from './api';

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** A time from the server. One with no UTC offset is UTC: older servers on SQLite drop the offset. */
function toDate(iso: string): Date {
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(/T\d/.test(iso) && !hasZone ? `${iso}Z` : iso);
}

/** "today 4:40 pm", "yesterday 9:05 am", "Monday 2:10 pm", "14 Jun", "14 Jun 2025". */
export function friendlyDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `yesterday ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString('en-IN', { weekday: 'long' })} ${time}`;
  return d.toLocaleDateString('en-IN', d.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** True when the date falls within the last `days` days (today counts as day 0). */
export function isWithinDays(iso: string | null | undefined, days: number, now: Date = new Date()): boolean {
  if (!iso) return false;
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (startOfDay(now) - startOfDay(d)) / DAY_MS < days;
}

/** "1 sheet", "5 sheets". */
export const plural = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** 38 -> "38", 42.5 -> "42.5", 42.25 -> "42.25", null -> "–". */
export function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** The name we show for a signed-in person: their name, else the part of the email before @. */
export function displayName(u: Pick<User, 'name' | 'email'>): string {
  return (u.name || '').trim() || u.email.split('@')[0];
}

/** One capital letter for the round avatar. */
export const initialOf = (u: Pick<User, 'name' | 'email'>) => displayName(u).charAt(0).toUpperCase() || '?';

/** "you" for the signed-in person, otherwise the part of their email before @, with a capital letter. */
export const whoDid = (email: string, me: Pick<User, 'email'>) => (email === me.email ? 'you' : capitalise(email.split('@')[0]));

/** "SWAMINI  KUTE" -> "Swamini Kute". Names are read from capital-letter bubbles. */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-'))
    .join(' ');
}

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
