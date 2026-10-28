// The answer key while it is being written: its fields, the checks before saving, and the
// plain-language messages around it. Kept apart from the screen so the rules are easy to read and test.
import { ApiError, Test } from '../../lib/api';
import { capitalise, plural } from '../../lib/format';

/** The answer choices the printed sheet offers. */
export const CHOICES = [
  { value: 'ABCDE', label: 'A to E' },
  { value: 'ABCD', label: 'A to D' },
];

/** "A", "A and B", "A, B and D". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "ABCDE" -> "A to E"; letters that do not follow on, "ABD" -> "A, B and D". */
export function choicesLabel(options: string): string {
  const followOn = options.split('').every((c, i) => i === 0 || c.charCodeAt(0) === options.charCodeAt(i - 1) + 1);
  return followOn && options.length > 2 ? `${options[0]} to ${options[options.length - 1]}` : joinWords(options.split(''));
}

export const qLabel = (n: number) => `q${n}`;
const qNumberOf = (label: string) => Number(label.replace(/^q/, ''));

export type MarksField = 'marksRight' | 'marksWrong' | 'marksBlank';

export interface KeyDraft {
  name: string;
  /** How many questions the test has, 1 to the most the sheet has. */
  count: number;
  /** The letters a student can fill, e.g. "ABCDE". */
  options: string;
  /** Marks as typed, so a box can be empty or hold "-" while someone types. */
  marksRight: string;
  marksWrong: string;
  marksBlank: string;
  /** q1 -> "A". Can hold answers past `count` while the Questions box is being typed in. */
  answers: Record<string, string>;
}

const numberText = (v: number | null | undefined, fallback: number) =>
  String(typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The editor's starting point: a stored key, or an empty one with the usual marks. */
export function draftFrom(test: Test | null, max: number): KeyDraft {
  if (!test) {
    return { name: '', count: max, options: 'ABCDE', marksRight: '1', marksWrong: '0', marksBlank: '0', answers: {} };
  }
  const options = (test.options || 'ABCDE').toUpperCase();
  const count = Math.min(Math.max(test.question_count || max, 1), max);
  const answers: Record<string, string> = {};
  for (let n = 1; n <= count; n++) {
    const letter = (test.answer_key?.[qLabel(n)] || '').trim().toUpperCase();
    if (letter.length === 1 && options.includes(letter)) answers[qLabel(n)] = letter;
  }
  return {
    name: test.name || '',
    count,
    options,
    marksRight: numberText(test.marks_correct, 1),
    marksWrong: numberText(test.marks_incorrect, 0),
    marksBlank: numberText(test.marks_unmarked, 0),
    answers,
  };
}

/** True when both drafts would save the same answer key. */
export function sameDraft(a: KeyDraft, b: KeyDraft): boolean {
  if (a.name !== b.name || a.count !== b.count || a.options !== b.options
    || a.marksRight !== b.marksRight || a.marksWrong !== b.marksWrong || a.marksBlank !== b.marksBlank) return false;
  for (let n = 1; n <= a.count; n++) {
    if ((a.answers[qLabel(n)] || '') !== (b.answers[qLabel(n)] || '')) return false;
  }
  return true;
}

/** Question numbers (1..count) that have no answer yet. */
export function missingQuestions(d: KeyDraft): number[] {
  const out: number[] = [];
  for (let n = 1; n <= d.count; n++) if (!d.answers[qLabel(n)]) out.push(n);
  return out;
}

/** The answers with `letters` written in from question 1, as the quick fill does. */
export function fillAnswers(answers: Record<string, string>, letters: string[]): Record<string, string> {
  const out = { ...answers };
  letters.forEach((letter, i) => { out[qLabel(i + 1)] = letter; });
  return out;
}

/** Only the answers to questions 1..count. */
export function firstAnswers(answers: Record<string, string>, count: number): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(answers).forEach(([q, letter]) => {
    if (qNumberOf(q) <= count) out[q] = letter;
  });
  return out;
}

/** The Questions box as a usable count: a whole number from 1 (above `max` counts as `max`),
 *  or null while the box is empty or holds something else. */
export function parseCount(text: string, max: number): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, max);
}

export const isNumberText = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));

export type ProblemKind = 'name' | MarksField | 'answers' | 'server';
export interface Problem { kind: ProblemKind; text: string; }

const MARKS: { field: MarksField; label: string; example: string }[] = [
  { field: 'marksRight', label: 'Marks if right', example: '1' },
  { field: 'marksWrong', label: 'Marks if wrong', example: '0 or -0.25' },
  { field: 'marksBlank', label: 'Marks if blank', example: '0' },
];

/** "3, 7, 12" or, past `limit` numbers, the first ones followed by an ellipsis. */
export function shortList(nums: number[], limit = 10): string {
  return nums.length > limit ? `${nums.slice(0, limit).join(', ')} …` : nums.join(', ');
}

/** "12 questions have no answer yet: 3, 7, 12 …" */
export function missingText(missing: number[], count: number): string {
  const n = missing.length;
  const cut = n > 10;
  const text = `${plural(n, 'question')} ${n === 1 ? 'has' : 'have'} no answer yet: ${shortList(missing)}`;
  // Empty answers only at the end usually mean the test is shorter than the sheet.
  const first = missing[0];
  const onlyAtEnd = n >= 2 && first > 1 && missing[n - 1] === count && count - first === n - 1;
  if (onlyAtEnd) {
    return `${text}${cut ? '' : '.'} If the test has only ${first - 1} questions, change “Questions” to ${first - 1}.`;
  }
  return cut ? text : `${text}.`;
}

/** Everything that stops the key from being saved, top to bottom as on the screen. */
export function checkDraft(d: KeyDraft): Problem[] {
  const out: Problem[] = [];
  if (!d.name.trim()) out.push({ kind: 'name', text: 'Give the test a name.' });
  MARKS.forEach(m => {
    if (!isNumberText(d[m.field])) out.push({ kind: m.field, text: `Write a number in “${m.label}”, for example ${m.example}.` });
  });
  const missing = missingQuestions(d);
  if (missing.length > 0) out.push({ kind: 'answers', text: missingText(missing, d.count) });
  return out;
}

/** False once the person has fixed it, so a message never stays up after the problem is gone. */
export function stillOpen(p: Problem, d: KeyDraft): boolean {
  switch (p.kind) {
    case 'name':
      return !d.name.trim();
    case 'marksRight':
    case 'marksWrong':
    case 'marksBlank':
      return !isNumberText(d[p.kind]);
    case 'answers':
      return missingQuestions(d).length > 0;
    default:
      return true;
  }
}

/** Said when a change of answer choices empties some questions. */
export function clearedText(cleared: number[], options: string): string {
  const choices = choicesLabel(options);
  if (cleared.length === 1) return `Question ${cleared[0]} is now blank: its answer is not in ${choices}.`;
  const list = shortList(cleared);
  return `${cleared.length} questions are now blank because their answer is not in ${choices}: ${list}${cleared.length > 10 ? '' : '.'}`;
}

// Spaces, commas and digits are skipped, and so is the punctuation of a numbered list ("1. A", "2) B").
// Anything else (a dash, a question mark) is refused rather than skipped, so no answer slips to the wrong question.
const SKIPPED = /[\s\d,.;:()]/;

export type FillResult = { letters: string[] } | { problem: string };

/** Reads "ABCDA BCDAB …" typed in one go: the letters in order from question 1. */
export function readQuickFill(text: string, options: string, count: number, max: number): FillResult {
  const chars = Array.from(text.toUpperCase()).filter(c => !SKIPPED.test(c));
  if (chars.length === 0) return { problem: 'Type the answers first, one letter for each question.' };
  const wrong = chars.filter((c, i) => !options.includes(c) && chars.indexOf(c) === i);
  if (wrong.length > 0) {
    const quoted = joinWords(wrong.map(c => `“${c}”`));
    return {
      problem: `${quoted} ${wrong.length === 1 ? 'is not an answer choice' : 'are not answer choices'}. `
        + `Use only the letters ${choicesLabel(options)}.`,
    };
  }
  if (chars.length > max) return { problem: `You typed ${chars.length} answers, but the sheet has only ${max} questions.` };
  if (chars.length > count) {
    return {
      problem: `You typed ${chars.length} answers, but this test has ${count} questions. `
        + `Change “Questions” to ${chars.length} first, or remove the extra letters.`,
    };
  }
  return { letters: chars };
}

/** The body for POST /api/tests and PUT /api/tests/:id. Only q1..qN are sent. */
export function payloadOf(d: KeyDraft) {
  const answer_key: Record<string, string> = {};
  for (let n = 1; n <= d.count; n++) {
    const letter = d.answers[qLabel(n)];
    if (letter) answer_key[qLabel(n)] = letter;
  }
  return {
    name: d.name.trim(),
    question_count: d.count,
    options: d.options,
    marks_correct: Number(d.marksRight),
    marks_incorrect: Number(d.marksWrong),
    marks_unmarked: Number(d.marksBlank),
    answer_key,
  };
}

const asSentence = (s: string) => {
  const t = capitalise(s.trim());
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** What went wrong with a request, in words a teacher can act on. `action` is e.g. "save the answer key". */
export function problemFromError(e: unknown, action: string): string {
  const err = (typeof e === 'object' && e !== null ? e : {}) as Partial<ApiError>;
  const status = typeof err.status === 'number' ? err.status : 0;
  if (status === 0) return `Could not ${action}. Check your internet connection and try again.`;
  if (status === 401) return 'You have been signed out. Reload the page to sign in again.';
  if (status === 403) return `You are not allowed to ${action}.`;
  if (status === 404) return `Could not ${action}: it is no longer there. Reload the page to see the latest answer keys.`;
  // The app's own 503 says the database is starting up. One from the hosting service (while the app
  // restarts) is a web page, not words for a teacher, so both get the same plain sentence.
  if (status === 503) return `Could not ${action}. The server is starting up. Try again in a minute.`;
  if (status >= 500) return `Could not ${action}. Something went wrong on the server. Try again in a minute.`;
  // A reply that was not the app's JSON carries only its code ("request failed (429)", see lib/api.ts).
  const message = err.message && !/^request failed \(\d+\)$/i.test(err.message) ? err.message : '';
  return message ? `Could not ${action}. ${asSentence(message)}` : `Could not ${action}. Try again in a minute.`;
}
