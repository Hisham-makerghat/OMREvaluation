// What a checked sheet means for a teacher: is it fine, does it need a look, which questions, and why.
import { Sheet } from './api';
import { capitalise, titleCase } from './format';

export type SheetKind = 'fine' | 'check' | 'error';
export type AnswerKind = 'right' | 'wrong' | 'blank' | 'multi';

/** Field labels the sheet template produces. */
export const FIELD = { name: 'Name', roll: 'Roll Number', mobile: 'Mobile Number', gender: 'gender' } as const;

export const sheetKind = (s: Sheet): SheetKind => (s.status === 'error' ? 'error' : s.needs_review ? 'check' : 'fine');

export const qNumber = (label: string) => Number(label.replace(/^q/, ''));

/** Student name in normal capitals, or '' when no name was read. */
export const studentName = (s: Sheet) => titleCase(s.fields?.[FIELD.name] || '');
export const rollNumber = (s: Sheet) => (s.fields?.[FIELD.roll] || '').trim();
export const mobileNumber = (s: Sheet) => (s.fields?.[FIELD.mobile] || '').trim();
export const gender = (s: Sheet) => (s.fields?.[FIELD.gender] || '').trim();

/** Where the sheet came from: "class7.pdf, page 3" or "IMG_4471.jpg". */
export function sourceLabel(s: Sheet): string {
  const isPdf = s.source_name.toLowerCase().endsWith('.pdf');
  return isPdf || s.page_no > 1 ? `${s.source_name}, page ${s.page_no}` : s.source_name;
}

/** The name to show in lists: the student's name, else where the sheet came from. */
export const sheetTitle = (s: Sheet) => studentName(s) || sourceLabel(s);

export function answerKind(marked: string | undefined, correct: string | undefined): AnswerKind {
  const m = (marked || '').trim();
  if (!m) return 'blank';
  if (m.length > 1) return 'multi';
  return m === correct ? 'right' : 'wrong';
}

/** "CD" -> "C and D", "ACD" -> "A, C and D". */
export function lettersText(v: string): string {
  const parts = v.split('');
  return parts.length <= 1 ? v : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export interface Problem {
  /** One plain sentence for the yellow notice. */
  text: string;
  /** Layout labels to box on the picture (q15, Name, Roll Number ...). */
  boxes: string[];
  /** A word or two for the list: "q15", "name", "roll no." */
  short: string;
}

/** Everything a teacher should look at on a sheet that was read but flagged. */
export function problemsOf(s: Sheet, questionCount: number): Problem[] {
  if (s.status !== 'ok') return [];
  const out: Problem[] = [];
  const doubles = Object.entries(s.answers || {})
    .filter(([q, v]) => /^q\d+$/.test(q) && (v || '').trim().length > 1)
    .sort((a, b) => qNumber(a[0]) - qNumber(b[0]));
  for (const [q, v] of doubles) {
    const n = qNumber(q);
    out.push(n <= questionCount
      ? { text: `Question ${n}: ${lettersText(v.trim())} are both filled, so it counts as wrong.`, boxes: [q], short: `q${n}` }
      : { text: `Question ${n}: ${lettersText(v.trim())} are both filled. This question is not part of this test.`, boxes: [q], short: `q${n}` });
  }
  for (const reason of (s.review_reason || '').split(';').map(r => r.trim()).filter(Boolean)) {
    if (reason.startsWith('two bubbles filled for')) continue; // listed question by question above
    if (reason === 'two bubbles filled in a name or number field') {
      out.push({ text: 'Two bubbles are filled in one column of the name, roll number or mobile number.', boxes: [FIELD.name, FIELD.roll, FIELD.mobile], short: 'name or number' });
    } else if (reason === 'name is blank') {
      out.push({ text: 'No name was read. Look at the name boxes on the sheet.', boxes: [FIELD.name], short: 'name' });
    } else if (reason === 'name does not start in the first column') {
      out.push({ text: 'The name does not start in the first box, so a letter may be lost at the edge of the scan.', boxes: [FIELD.name], short: 'name' });
    } else if (reason === 'roll number is blank') {
      out.push({ text: 'No roll number was read.', boxes: [FIELD.roll], short: 'roll no.' });
    } else {
      out.push({ text: `${capitalise(reason)}.`, boxes: [], short: 'sheet' });
    }
  }
  if (out.length === 0 && s.needs_review) out.push({ text: 'This sheet was marked for a closer look.', boxes: [], short: 'sheet' });
  return out;
}

/** "Check q15", "Check name, roll no.", "Check q3, q15 and 2 more". */
export function checkSummary(problems: Problem[]): string {
  const words = Array.from(new Set(problems.map(p => p.short)));
  if (words.length === 0) return 'Check this sheet';
  const shown = words.slice(0, 2).join(', ');
  return words.length > 2 ? `Check ${shown} and ${words.length - 2} more` : `Check ${shown}`;
}

/** Why a sheet could not be read, in words a teacher can act on. */
export function errorText(reason: string): string {
  const r = (reason || '').toLowerCase();
  if (r.includes('corner targets not found')) {
    return 'The four corner circles were not all found. Scan the sheet again, flat, with all four corners in the picture.';
  }
  if (r.includes('could not process image') || r.includes('could not read bubbles')) {
    return 'The sheet could not be read. Scan it again, flat and in good light.';
  }
  return reason ? `${capitalise(reason)}.` : 'The sheet could not be read.';
}

/** Counts for the filter chips and progress tiles. */
export function countKinds(sheets: Sheet[]) {
  let fine = 0;
  let check = 0;
  let error = 0;
  for (const s of sheets) {
    const k = sheetKind(s);
    if (k === 'fine') fine++;
    else if (k === 'check') check++;
    else error++;
  }
  return { fine, check, error, total: sheets.length };
}
