// One question of an answer key: its number and one round button per letter, like a row of the
// printed sheet. Tapping the chosen letter again clears it.
import classNames from 'classnames';
import { memo } from 'react';

interface AnswerInputProps {
  /** The question number, from 1. */
  number: number;
  /** The letters a student can fill, e.g. "ABCDE". */
  options: string;
  /** The right letter, or '' when none is chosen yet. */
  value: string;
  /** Marks the row as still needing an answer (after someone tried to save). */
  missing?: boolean;
  /** Called with the letter to choose, or '' to clear the question. */
  onChange: (number: number, letter: string) => void;
}

function AnswerInput({ number, options, value, missing = false, onChange }: AnswerInputProps) {
  return (
    // The row never splits between two columns of the answer grid.
    <div role="group" aria-label={missing ? `Question ${number}, no answer yet` : `Question ${number}`}
      className={classNames('break-inside-avoid rounded-xl py-1', missing && 'bg-sun-wash')}>
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true"
          className={classNames('w-8 shrink-0 text-right font-semibold', missing ? 'text-sun-ink' : 'text-muted')}>
          {number}.
        </span>
        {options.split('').map(letter => {
          const chosen = value === letter;
          return (
            <button key={letter} type="button" data-q={number} data-letter={letter}
              aria-pressed={chosen} aria-label={`Question ${number}: ${letter}`}
              onClick={() => onChange(number, chosen ? '' : letter)}
              // 44 px circles. In a column narrower than a phone they may narrow a little rather than spill out.
              className={classNames(
                'inline-flex aspect-square min-h-[44px] w-11 min-w-0 shrink touch-manipulation items-center justify-center',
                'rounded-full border-2 p-0 text-base font-bold leading-none transition-colors',
                chosen ? 'border-heading bg-coral text-heading' : 'border-line bg-ivory text-muted hover:border-heading',
              )}>
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(AnswerInput);
