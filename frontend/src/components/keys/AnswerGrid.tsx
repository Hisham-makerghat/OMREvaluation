// The correct answers, one row per question, flowing down the columns like the printed sheet:
// 1-17, 18-34 and 35-50 on a laptop, two columns on a tablet, one on a phone.
import { KeyboardEvent as ReactKeyboardEvent, Ref } from 'react';
import AnswerInput from '../AnswerInput';
import { qLabel } from './answerKey';

interface AnswerGridProps {
  count: number;
  /** The letters a student can fill, e.g. "ABCDE". */
  options: string;
  answers: Record<string, string>;
  /** Highlight the questions that have no answer yet. */
  showMissing: boolean;
  onChange: (number: number, letter: string) => void;
  /** Id of the heading that names the grid. */
  labelledBy: string;
  containerRef?: Ref<HTMLDivElement>;
}

/** Width of one row in rem: the 2rem number, a 0.375rem gap, then one 2.75rem button per letter, 0.375rem apart. */
const rowRem = (letters: number) => 2 + 0.375 + letters * 2.75 + (letters - 1) * 0.375;

export default function AnswerGrid({ count, options, answers, showMissing, onChange, labelledBy, containerRef }: AnswerGridProps) {
  // Arrow keys move between letters (left, right) and questions (up, down), so a keyboard user
  // does not have to Tab through every button. Tab still visits each one in question order.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const from = e.target as HTMLElement;
    const q = Number(from.dataset.q);
    const letter = from.dataset.letter;
    if (!q || !letter) return;
    let nextQ = q;
    let nextIndex = options.indexOf(letter);
    if (e.key === 'ArrowRight') nextIndex += 1;
    else if (e.key === 'ArrowLeft') nextIndex -= 1;
    else if (e.key === 'ArrowDown') nextQ += 1;
    else if (e.key === 'ArrowUp') nextQ -= 1;
    else return;
    const nextLetter = options[nextIndex];
    if (!nextLetter) return;
    const next = e.currentTarget.querySelector<HTMLButtonElement>(`button[data-q="${nextQ}"][data-letter="${nextLetter}"]`);
    if (!next) return;
    e.preventDefault();
    next.focus();
  };

  const numbers = Array.from({ length: count }, (_, i) => i + 1);
  return (
    <div ref={containerRef} role="group" aria-labelledby={labelledBy} onKeyDown={onKeyDown}
      className="gap-8"
      // CSS columns, as many as fit a whole row (at most 3), so a row never squeezes or spills over:
      // three on a laptop, two on a tablet, one on a phone.
      style={{ columns: `${rowRem(options.length)}rem 3` }}>
      {numbers.map(n => {
        const value = answers[qLabel(n)] || '';
        return (
          <AnswerInput key={n} number={n} options={options} value={value} missing={showMissing && !value}
            onChange={onChange} />
        );
      })}
    </div>
  );
}
