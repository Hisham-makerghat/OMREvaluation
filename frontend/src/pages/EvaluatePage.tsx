// "Check sheets" (/evaluate): choose the answer key, add the scans, check them, and follow the progress.
// The chosen files and the checking itself live in components/evaluate/session.ts, so they carry on
// when the teacher looks at another tab of the app and are still here when they come back.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { reasonText, startChecking, withFullStop } from '../components/evaluate/checking';
import ProgressCard from '../components/evaluate/ProgressCard';
import ScansCard from '../components/evaluate/ScansCard';
import { getSession, setBatchName, setTestId, sheetTotals, startOver, useSession } from '../components/evaluate/session';
import { EmptyState, Loading, Notice } from '../components/ui';
import { api, Me, Test } from '../lib/api';
import { capitalise, plural } from '../lib/format';

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

export default function EvaluatePage({ me }: { me: Me }) {
  const { testId, batchName, files, run, startError } = useSession();
  const [tests, setTests] = useState<Test[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const progressTitleRef = useRef<HTMLHeadingElement>(null);
  const phase = run ? run.phase : null;
  // The phase the screen last saw, to notice the moment checking finishes while it is open.
  const lastPhase = useRef(phase);

  // The answer keys, newest first. "cancelled" drops a reply that arrives after the screen has closed.
  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    api.get<Test[]>('/api/tests')
      .then(list => {
        if (cancelled) return;
        setTests(list);
        // Keep the key that is shown as the chosen one, so a key made later (by anyone) does not
        // take its place when the teacher comes back to this screen.
        const chosen = getSession().testId;
        if (list.length > 0 && !list.some(t => t.id === chosen)) setTestId(list[0].id);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(reasonText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // A file dropped outside the Scans card would make the browser open it and leave the tool.
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer || Array.from(e.dataTransfer.types).indexOf('Files') === -1) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  // When checking finishes on this screen, its card moves to the top (see below). Take the teacher
  // there, and give the card's title keyboard focus when the pressed button took focus away with it.
  // Not when the screen opens on a finished check: coming back to this tab never moves focus.
  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = phase;
    if (phase !== 'finished' || before === null || before === 'finished') return;
    const active = document.activeElement;
    if (!active || active === document.body) progressTitleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [phase]);

  const test = tests ? tests.find(t => t.id === testId) || tests[0] || null : null;
  const locked = run !== null; // the form belongs to the run until "Check more sheets"
  const checking = phase === 'starting' || phase === 'checking';
  const finished = phase === 'finished';
  const { counting, sheets } = sheetTotals(files);
  const noAnswers = test !== null && Object.keys(test.answer_key || {}).length === 0;
  // While pages are being counted the button works (checking waits for the count). Once counted, at
  // least one sheet must open: a list of files that cannot be opened has nothing to check.
  const canStart = test !== null && !noAnswers && files.length > 0 && !locked && (counting || sheets > 0);

  let buttonLabel = 'Check sheets';
  if (checking) buttonLabel = 'Checking…';
  else if (files.length > 0 && !counting && sheets > 0) buttonLabel = sheets === 1 ? 'Check 1 sheet' : `Check ${sheets} sheets`;

  const start = () => {
    if (!test || !canStart) return;
    startChecking(test.id);
    // On a phone the progress card starts below the screen: bring it into view.
    window.requestAnimationFrame(() => progressRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' }));
  };

  const checkMore = () => {
    startOver();
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    titleRef.current?.focus({ preventScroll: true });
  };

  let announcement = '';
  if (run && run.phase === 'finished') {
    announcement = `Finished. ${plural(run.done, 'sheet')} checked: ${run.fine} read fine, ${run.check} to check, ${run.bad} could not read.`;
  } else if (run && run.problems.length > 0) {
    // The first problem is said once, when it happens. The list in the card then grows quietly: read
    // out again at every new problem, it would interrupt the teacher every few seconds.
    announcement = `${run.problems[0]} Checking goes on.`;
  }

  // While checking, the card follows the big button, as on the design. Once finished it moves to the
  // top, so a teacher coming back to this tab sees "See results" and "Check more sheets" first.
  const progress = run && (
    <div ref={progressRef} className="scroll-mb-28 md:scroll-mb-8">
      <ProgressCard run={run} onCheckMore={checkMore} titleRef={progressTitleRef} />
    </div>
  );

  return (
    <div className="page flex flex-col gap-5">
      <h1 ref={titleRef} tabIndex={-1} className="page-title">Check sheets</h1>

      {finished && progress}

      {!tests && loadError && (
        <Notice tone="error" title="The answer keys could not be loaded">
          <p className="m-0">{capitalise(withFullStop(loadError))}</p>
          <button type="button" className="btn btn-secondary btn-small mt-3" onClick={() => setLoadAttempt(n => n + 1)}>
            Try again
          </button>
        </Notice>
      )}
      {!tests && !loadError && <Loading label="Loading answer keys…" />}
      {tests && tests.length === 0 && (
        <EmptyState title="First, make an answer key"
          action={<Link to="/tests?new=1" className="btn btn-primary">Make an answer key</Link>}>
          The tool needs the right answers before it can check sheets.
        </EmptyState>
      )}

      {tests && test && (
        <>
          <div className="card grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="field min-w-0">
              Which test?
              <select className="select" value={test.id} disabled={locked} onChange={e => setTestId(e.target.value)}>
                {tests.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({plural(t.question_count, 'question')})</option>
                ))}
              </select>
            </label>
            <label className="field min-w-0">
              <span>Batch name <span className="field-note">(optional, e.g. school and class)</span></span>
              <input className="input" type="text" value={batchName} maxLength={200} autoComplete="off"
                placeholder="e.g. ZP Mahalpatane, Grade 7" disabled={locked} onChange={e => setBatchName(e.target.value)} />
            </label>
            {noAnswers && !locked && (
              <Notice tone="warn" className="md:col-span-2">
                This answer key has no answers yet. <Link to="/tests" className="link">Add the right answers</Link> before
                checking sheets with it.
              </Notice>
            )}
          </div>

          <ScansCard files={files} locked={locked} finished={finished} />

          {!finished && (
            <button type="button" className="btn btn-primary btn-big w-full" disabled={!canStart} onClick={start}>
              {buttonLabel}
            </button>
          )}
        </>
      )}

      {startError && <Notice tone="error">{startError}</Notice>}

      {checking && progress}

      {/* Said once by screen readers at the first problem, and once when checking finishes. */}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
