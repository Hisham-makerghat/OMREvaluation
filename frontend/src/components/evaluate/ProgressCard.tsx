// The card that follows the checking: how far it has got, what it found so far, and what to do next.
import classNames from 'classnames';
import { Ref } from 'react';
import { Link } from 'react-router-dom';
import { plural } from '../../lib/format';
import { Notice } from '../ui';
import { CheckRun } from './session';

const MAX_PROBLEMS = 5;

function Tile({ tone, count, label }: { tone: string; count: number; label: string }) {
  return (
    <li className={classNames(tone, 'flex flex-col items-center justify-center rounded-[14px] p-3')}>
      <span className="font-display text-[28px] font-semibold leading-9">{count}</span>
      <span className="text-[15px] leading-5 md:text-base">{label}</span>
    </li>
  );
}

/** titleRef: the screen moves keyboard focus to the title when checking finishes. */
export default function ProgressCard({ run, onCheckMore, titleRef }: {
  run: CheckRun; onCheckMore: () => void; titleRef?: Ref<HTMLHeadingElement>;
}) {
  const finished = run.phase === 'finished';
  const starting = run.phase === 'starting';
  const percent = finished ? 100 : run.total > 0 ? Math.min(100, Math.floor((100 * run.done) / run.total)) : 0;
  const max = Math.max(run.total, 1);
  let title = `Checking… ${run.done} of ${run.total}`;
  if (finished) title = `Finished: ${plural(run.done, 'sheet')} checked`;
  else if (starting) title = 'Checking…';
  const moreProblems = run.problems.length - MAX_PROBLEMS;

  return (
    <section aria-labelledby="progress-title" className="card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 ref={titleRef} id="progress-title" tabIndex={-1} className="section-title">{title}</h2>
        <span className="shrink-0 font-display text-xl font-semibold leading-7 text-heading">{percent}%</span>
      </div>

      <div role="progressbar" aria-label="Sheets checked" aria-valuemin={0} aria-valuemax={max}
        aria-valuenow={Math.min(run.done, max)}
        aria-valuetext={starting ? 'Getting ready' : `${run.done} of ${plural(run.total, 'sheet')}`}
        className="h-5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-coral transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>

      {!finished && run.now && <p className="hint [overflow-wrap:anywhere]">Now: {run.now}</p>}

      <ul className="grid grid-cols-3 gap-2.5 text-center">
        <Tile tone="tone-fine" count={run.fine} label="read fine" />
        <Tile tone="tone-check" count={run.check} label="to check" />
        <Tile tone="tone-error" count={run.bad} label="could not read" />
      </ul>

      {/* Not read out by itself: it would be read again in full at every new problem. The screen says
          the first problem once instead. */}
      {run.problems.length > 0 && (
        <Notice tone="error" live={false}>
          <ul className="flex flex-col gap-1 [overflow-wrap:anywhere]">
            {run.problems.slice(0, MAX_PROBLEMS).map((problem, i) => <li key={i}>{problem}</li>)}
            {moreProblems > 0 && <li>and {moreProblems} more</li>}
          </ul>
          {finished && (
            // Photos taken with the camera button are often not kept on the phone: those sheets need new photos.
            <p className="m-0 mt-2">
              These pages are not in the results. To check them, press “Check more sheets”, then add those files again
              or take new photos of those sheets. They are checked as a new batch.
            </p>
          )}
        </Notice>
      )}

      {finished ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to={`/batches/${run.batchId}`} className="btn btn-primary">See results</Link>
          <button type="button" className="btn btn-secondary" onClick={onCheckMore}>Check more sheets</button>
        </div>
      ) : (
        <p className="hint">Keep this page open until checking finishes. Closing it stops the checking.</p>
      )}
    </section>
  );
}
