// Every question of a read sheet in a grid of ten columns: right, wrong, blank or two marks.
// Tapping a question boxes it on the picture and says what was marked and what the right answer is.
import classNames from 'classnames';
import { KeyboardEvent as ReactKeyboardEvent, useId } from 'react';
import { Sheet, Test } from '../../lib/api';
import { AnswerKind, answerKind, lettersText } from '../../lib/sheets';

/** 'free': the answer key has no answer for this question, so it does not count. */
export type CellKind = AnswerKind | 'free';

export interface AnswerCell {
  /** q1 ... q50, the same label the picture's layout uses. */
  label: string;
  n: number;
  /** '' when blank, 'A', or 'CD' when two bubbles are filled. */
  marked: string;
  /** '' when the answer key has no answer for this question. */
  correct: string;
  kind: CellKind;
}

export function answerCells(sheet: Sheet, test: Pick<Test, 'question_count' | 'answer_key'>): AnswerCell[] {
  const cells: AnswerCell[] = [];
  for (let n = 1; n <= test.question_count; n++) {
    const label = `q${n}`;
    const marked = (sheet.answers?.[label] || '').trim();
    const correct = (test.answer_key?.[label] || '').trim();
    const kind: CellKind = !correct && marked.length <= 1 ? 'free' : answerKind(marked, correct);
    cells.push({ label, n, marked, correct, kind });
  }
  return cells;
}

const LOOK: Record<CellKind, string> = {
  right: 'border-leaf-wash bg-leaf-wash text-leaf-ink',
  wrong: 'border-danger bg-white text-danger',
  blank: 'border-line bg-ivory text-muted',
  multi: 'border-sun-ink bg-sun-wash text-sun-ink',
  free: 'border-dashed border-line bg-white text-muted',
};

const LEGEND: { kind: CellKind; word: string }[] = [
  { kind: 'right', word: 'right' },
  { kind: 'wrong', word: 'wrong' },
  { kind: 'blank', word: 'blank' },
  { kind: 'multi', word: 'two marks' },
];

const NOT_COUNTED = 'It is not counted: the answer key has no answer for it.';
const filledWord = (marked: string) => (marked.length === 2 ? 'both' : 'all');

/** Squares in one row: the grid below has as many columns (grid-cols-10). */
const COLUMNS = 10;
/** Arrow keys move between the squares: one square sideways, one row up or down. */
const ARROW_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS };

/** The grid keeps its arrow keys (it is marked data-own-arrows, which the viewer leaves alone), so
 *  an arrow moves to the next square instead of switching to another student. */
function moveWithArrows(e: ReactKeyboardEvent<HTMLDivElement>) {
  const step = ARROW_STEP[e.key];
  if (!step || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const squares = Array.from(e.currentTarget.querySelectorAll('button'));
  const i = squares.indexOf(e.target as HTMLButtonElement);
  const to = i < 0 ? undefined : squares[i + step];
  if (!to) return;
  e.preventDefault();
  to.focus();
}

/** What a screen reader says for one square. */
function cellLabel(c: AnswerCell): string {
  const key = c.correct ? ` The right answer is ${c.correct}.` : ` ${NOT_COUNTED}`;
  switch (c.kind) {
    case 'right': return `Question ${c.n}: marked ${c.marked}, right.`;
    case 'wrong': return `Question ${c.n}: marked ${c.marked}, wrong.${key}`;
    case 'blank': return `Question ${c.n}: blank.${key}`;
    case 'multi': return `Question ${c.n}: ${lettersText(c.marked)} ${filledWord(c.marked)} filled.${key}`;
    default: return `Question ${c.n}: ${c.marked ? `marked ${c.marked}` : 'blank'}.${key}`;
  }
}

/** The line under the grid for the question the teacher picked (after "Question 3:"). */
function cellDetail(c: AnswerCell): string {
  switch (c.kind) {
    case 'right': return `marked ${c.marked}. That is the right answer.`;
    case 'wrong': return `marked ${c.marked}. The right answer is ${c.correct}.`;
    case 'blank': return `blank. The right answer is ${c.correct}.`;
    case 'multi': return c.correct
      ? `${lettersText(c.marked)} are ${filledWord(c.marked)} filled, so it counts as wrong. The right answer is ${c.correct}.`
      : `${lettersText(c.marked)} are ${filledWord(c.marked)} filled. ${NOT_COUNTED}`;
    default: return `${c.marked ? `marked ${c.marked}` : 'blank'}. ${NOT_COUNTED}`;
  }
}

/** "38 right · 8 wrong · 3 blank · 1 with two marks". */
function summaryText(cells: AnswerCell[]): string {
  const count = (kind: CellKind) => cells.filter(c => c.kind === kind).length;
  const parts = [`${count('right')} right`, `${count('wrong')} wrong`];
  if (count('blank')) parts.push(`${count('blank')} blank`);
  if (count('multi')) parts.push(`${count('multi')} with two marks`);
  if (count('free')) parts.push(`${count('free')} not counted`);
  return parts.join(' · ');
}

export default function AnswerGrid({ cells, selected, onSelect, compact }: {
  cells: AnswerCell[];
  /** Label of the picked question, or null. */
  selected: string | null;
  onSelect: (label: string | null) => void;
  /** Phone: a little less room between the squares. */
  compact: boolean;
}) {
  const titleId = useId();
  const picked = cells.find(c => c.label === selected) || null;
  const legend = cells.some(c => c.kind === 'free') ? [...LEGEND, { kind: 'free' as CellKind, word: 'not counted' }] : LEGEND;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2.5 px-5 pb-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 id={titleId} className="m-0 font-sans text-[17px] font-semibold leading-6 text-ink">Answers</h3>
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] leading-5 text-muted">
          {legend.map(({ kind, word }) => (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={classNames('h-3.5 w-3.5 shrink-0 rounded border-2', LOOK[kind])} />
              {word}
            </span>
          ))}
        </p>
      </div>
      <p className="m-0 text-[15px] leading-[22px]">{summaryText(cells)}</p>
      <div role="group" aria-labelledby={titleId} data-own-arrows onKeyDown={moveWithArrows}
        className={classNames('grid grid-cols-10', compact ? 'gap-[3px]' : 'gap-1')}>
        {cells.map(c => {
          const on = c.label === selected;
          return (
            <button key={c.label} type="button" aria-pressed={on} aria-label={cellLabel(c)}
              onClick={() => onSelect(on ? null : c.label)}
              className={classNames('flex min-w-0 flex-col items-center rounded-lg border-2 py-1', LOOK[c.kind],
                on && 'outline outline-[3px] outline-offset-1 outline-heading')}>
              <span className="text-[11px] leading-[13px] text-muted">{c.n}</span>
              <span className={classNames('max-w-full break-all font-bold',
                c.marked.length > 2 ? 'text-[12px] leading-5' : 'text-[15px] leading-5')}>
                {c.marked || '–'}
              </span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="m-0 text-base leading-6">
        {picked && (
          <>
            <b className="font-semibold">Question {picked.n}:</b> {cellDetail(picked)}
          </>
        )}
      </p>
    </section>
  );
}
