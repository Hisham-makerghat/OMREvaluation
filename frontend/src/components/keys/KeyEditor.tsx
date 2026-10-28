// The answer key editor. It opens in place of a key in the list (or at the top for a new key):
// the test's name and marks, then one row of letters per question, like the printed sheet.
// Save checks everything first and says what is missing, instead of being greyed out.
import classNames from 'classnames';
import { ReactNode, RefObject, useCallback, useEffect, useId, useMemo, useRef, useState, WheelEvent } from 'react';
import { api, Batch, Test } from '../../lib/api';
import { capitalise, plural } from '../../lib/format';
import { IconArchive, IconWarning } from '../Icons';
import { useToast } from '../Toast';
import { Notice } from '../ui';
import AnswerGrid from './AnswerGrid';
import {
  checkDraft, CHOICES, choicesLabel, clearedText, draftFrom, fillAnswers, firstAnswers, KeyDraft, MarksField,
  missingQuestions, missingText, parseCount, payloadOf, Problem, problemFromError, qLabel, readQuickFill, sameDraft,
  stillOpen,
} from './answerKey';
import { BATCH_LIST_LIMIT, KeyUse, usedByText } from './usage';

/** Asked before unsaved changes are thrown away. */
export const LEAVE_MESSAGE = 'Leave without saving? Your changes to this answer key will be lost.';

interface KeyEditorProps {
  /** The stored key to change, or null to write a new one. */
  test: Test | null;
  /** The most questions the printed sheet has. */
  maxQuestions: number;
  /** How many batches used this key, as far as the page knows. */
  usedBy?: KeyUse;
  /** Tells the page whether there are unsaved changes, so it can ask before closing the editor. */
  onDirtyChange: (dirty: boolean) => void;
  /** Tells the page while a save or archive is on its way, so it keeps this editor open until it is done. */
  onBusyChange: (busy: boolean) => void;
  /** Close without saving. The editor has already asked about unsaved changes. */
  onCancel: () => void;
  onSaved: (saved: Test) => void;
  onArchived: () => void;
}

/** Where Save takes the person first: a field, the quick-fill box, or the questions with no answer. */
type Target = Problem['kind'] | 'fill';

/** A form field: the label above, then the input, then an optional note and an error in words. */
function Field({ inputId, label, note, error, className, children }: {
  inputId: string; label: string; note?: string; error?: string; className?: string; children: ReactNode;
}) {
  return (
    <div className={classNames('field', className)}>
      <label htmlFor={inputId}>{label}</label>
      {children}
      {note && <p id={`${inputId}-note`} className="field-note m-0">{note}</p>}
      {error && (
        <p id={`${inputId}-error`} className="m-0 flex items-start gap-1.5 text-danger">
          <IconWarning size={20} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** The ids an input's aria-describedby lists: its note and its error, when shown. */
const describedBy = (inputId: string, hasNote: boolean, error?: string) =>
  [hasNote && `${inputId}-note`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;

// The mouse wheel over a focused number box would quietly change it (and could drop answers).
const blurOnWheel = (e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

const scrollBehavior = (): ScrollBehavior =>
  (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export default function KeyEditor({
  test, maxQuestions: max, usedBy, onDirtyChange, onBusyChange, onCancel, onSaved, onArchived,
}: KeyEditorProps) {
  const toast = useToast();
  const [initial] = useState(() => draftFrom(test, max));
  const [draft, setDraft] = useState<KeyDraft>(initial);
  // The Questions box as typed. draft.count follows it whenever it holds a usable number.
  const [countText, setCountText] = useState(String(initial.count));
  const [fillText, setFillText] = useState('');
  // Why the letters typed in the quick-fill box were refused.
  const [fillProblem, setFillProblem] = useState('');
  // Questions emptied by a change of answer choices. They are mentioned until they have an answer again.
  const [cleared, setCleared] = useState<number[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  // After the first Save press, questions with no answer are highlighted.
  const [triedSave, setTriedSave] = useState(false);
  // Bumped on every Save or Archive press so the same message is announced again.
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState<'save' | 'archive' | null>(null);
  // This key's own batch count, asked for when the page's count may leave out older batches.
  const [ownUse, setOwnUse] = useState<KeyUse | null>(null);

  const uid = useId();
  const id = (part: string) => `${uid}-${part}`;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const rightRef = useRef<HTMLInputElement>(null);
  const wrongRef = useRef<HTMLInputElement>(null);
  const blankRef = useRef<HTMLInputElement>(null);
  const fillRef = useRef<HTMLInputElement>(null);
  const missingRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  // Where to take the person once the screen shows what Save found.
  const pointNext = useRef<Target | null>(null);
  // Answers a change of answer choices took away (q15 -> "E"), so changing back puts them back.
  const removedAnswers = useRef<Record<string, string>>({});

  const isNew = test === null;
  const testId = test?.id;
  // Letters typed in the quick-fill box are changes too: Save uses them.
  const dirty = !sameDraft(draft, initial) || fillText.trim() !== '';
  const missing = useMemo(() => missingQuestions(draft), [draft]);
  // The messages follow the answers: a fixed problem goes away, and the list of missing questions stays true.
  const shown = problems
    .filter(p => stillOpen(p, draft))
    .map(p => (p.kind === 'answers' ? { ...p, text: missingText(missing, draft.count) } : p));
  const errorFor = (kind: Problem['kind']) => shown.find(p => p.kind === kind)?.text;
  const missingProblem = errorFor('answers');
  const otherProblems = shown.filter(p => p.kind !== 'answers');
  const stillCleared = cleared.filter(n => n <= draft.count && !draft.answers[qLabel(n)]);
  const use = ownUse ?? usedBy;
  const useKnown = usedBy?.all === true;

  const choices = useMemo(
    () => (CHOICES.some(c => c.value === initial.options)
      ? CHOICES
      : [...CHOICES, { value: initial.options, label: choicesLabel(initial.options) }]),
    [initial.options],
  );

  // "ACBD BADC", made only of letters this key allows.
  const sample = useMemo(() => {
    const letters = [0, 2, 1, 3, 1, 0, 3, 2].map(i => draft.options[i % draft.options.length]).join('');
    return `${letters.slice(0, 4)} ${letters.slice(4)}`;
  }, [draft.options]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy !== null); }, [busy, onBusyChange]);

  // Closing or reloading the browser tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // So does moving to another screen of the app (the tabs, the logo). This listener on the document
  // hears the click before React does, and React Router's links leave a cancelled click alone.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || e.defaultPrevented) return;
      // A click that opens a new tab or window leaves this page as it is.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target && link.target !== '_self') return;
      // Only other screens of the app: for a full page load (signing out) the browser asks instead.
      if (link.origin !== window.location.origin || link.pathname === window.location.pathname
        || link.pathname.startsWith('/.auth/')) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  // Start where the work starts: the name of a new key; the heading of a stored one, so the
  // keyboard does not pop up on a phone when someone only wants to tap answers.
  useEffect(() => {
    if (isNew) nameRef.current?.focus();
    else titleRef.current?.focus();
  }, [isNew]);

  // The page counts only the newest batches. When that may leave out some of this key's, ask for its own.
  useEffect(() => {
    if (!testId || useKnown) return undefined;
    let cancelled = false;
    api.get<Batch[]>(`/api/batches?test_id=${encodeURIComponent(testId)}`)
      .then(list => { if (!cancelled) setOwnUse({ count: list.length, all: list.length < BATCH_LIST_LIMIT }); })
      .catch(() => undefined); // the page's count, when it has one, is shown instead
    return () => { cancelled = true; };
  }, [testId, useKnown]);

  // After Save, take the person to the first thing to fix, once it is on the screen.
  useEffect(() => {
    const target = pointNext.current;
    if (!target) return;
    pointNext.current = null;
    if (target === 'answers') {
      // The sentence that lists the questions comes to the top of the screen with the grid under it,
      // and the keyboard goes to the first question with no answer.
      missingRef.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
      gridRef.current?.querySelector<HTMLButtonElement>(`button[data-q="${missing[0]}"]`)?.focus({ preventScroll: true });
      return;
    }
    const inputs: Partial<Record<Target, RefObject<HTMLInputElement>>> = {
      name: nameRef, marksRight: rightRef, marksWrong: wrongRef, marksBlank: blankRef, fill: fillRef,
    };
    inputs[target]?.current?.focus();
  });

  const update = (patch: Partial<KeyDraft>) => setDraft(d => ({ ...d, ...patch }));

  const setAnswer = useCallback((n: number, letter: string) => {
    setDraft(d => {
      const answers = { ...d.answers };
      if (letter) answers[qLabel(n)] = letter;
      else delete answers[qLabel(n)];
      return { ...d, answers };
    });
  }, []);

  function changeCount(text: string) {
    setCountText(text);
    const n = parseCount(text, max);
    if (n !== null) update({ count: n });
  }

  // Answers past the last question are dropped when the person leaves the Questions box, not on
  // every key press: typing "40" passes through "4" on the way, and that must not lose 5 to 40.
  function settleCount() {
    setCountText(String(draft.count));
    setDraft(d => ({ ...d, answers: firstAnswers(d.answers, d.count) }));
    // So are the ones a change of answer choices took away: changing back must not refill those questions,
    // and the note about them goes too. If the count goes up again later, such a question is simply a new, empty one.
    removedAnswers.current = firstAnswers(removedAnswers.current, draft.count);
    setCleared(c => c.filter(n => n <= draft.count));
  }

  function changeOptions(options: string) {
    const answers: Record<string, string> = {};
    Object.entries(draft.answers).forEach(([q, letter]) => {
      if (options.includes(letter)) answers[q] = letter;
      else removedAnswers.current[q] = letter;
    });
    // Changing back (an arrow key on the select, a slip of the mouse) brings the answers back,
    // unless the question has been given another answer meanwhile.
    Object.entries(removedAnswers.current).forEach(([q, letter]) => {
      if (!answers[q] && options.includes(letter)) answers[q] = letter;
      if (answers[q]) delete removedAnswers.current[q];
    });
    setDraft({ ...draft, options, answers });
    // What is still taken away is blank because of these answer choices, whichever change took it.
    setCleared(Object.keys(removedAnswers.current)
      .map(q => Number(q.slice(1)))
      .filter(n => n <= draft.count)
      .sort((a, b) => a - b));
    // A refused quick fill named the old answer choices.
    setFillProblem('');
  }

  function changeFill(text: string) {
    setFillText(text);
    // An empty box has nothing left to be wrong with.
    if (!text.trim()) setFillProblem('');
  }

  /** The letters typed in the quick-fill box, or null after saying what is wrong with them. */
  function takeFillLetters(): string[] | null {
    const result = readQuickFill(fillText, draft.options, draft.count, max);
    if ('problem' in result) {
      setFillProblem(result.problem);
      return null;
    }
    setFillText('');
    setFillProblem('');
    return result.letters;
  }

  function quickFill() {
    const letters = takeFillLetters();
    if (!letters) return;
    setDraft(d => ({ ...d, answers: fillAnswers(d.answers, letters) }));
    toast(`Filled ${plural(letters.length, 'answer')}`);
  }

  async function save() {
    let next = draft;
    // Letters still waiting in the quick-fill box are used as if Fill had been pressed.
    if (fillText.trim()) {
      const letters = takeFillLetters();
      if (!letters) {
        pointNext.current = 'fill';
        setRound(r => r + 1);
        return;
      }
      next = { ...draft, answers: fillAnswers(draft.answers, letters) };
      setDraft(next);
    }
    const found = checkDraft(next);
    setTriedSave(true);
    setRound(r => r + 1);
    setProblems(found);
    if (found.length > 0) {
      pointNext.current = found[0].kind;
      return;
    }
    setBusy('save');
    try {
      const body = payloadOf(next);
      const saved = test
        ? await api.put<Test>(`/api/tests/${test.id}`, body)
        : await api.post<Test>('/api/tests', body);
      // Said even if the person has moved to another screen meanwhile: the key was saved all the same.
      toast('Answer key saved');
      if (mounted.current) onSaved(saved);
    } catch (e) {
      if (!mounted.current) return;
      setProblems([{ kind: 'server', text: problemFromError(e, 'save the answer key') }]);
      setBusy(null);
    }
  }

  async function archive() {
    if (!test) return;
    if (!window.confirm(`Archive “${test.name}”? It will no longer be offered for checking. Past results are kept.`)) return;
    setRound(r => r + 1);
    setProblems([]);
    setBusy('archive');
    try {
      await api.put<Test>(`/api/tests/${test.id}`, { archived: true });
      toast('Answer key archived');
      if (mounted.current) onArchived();
    } catch (e) {
      if (!mounted.current) return;
      setProblems([{ kind: 'server', text: problemFromError(e, 'archive the answer key') }]);
      setBusy(null);
    }
  }

  function cancel() {
    if (dirty && !window.confirm(LEAVE_MESSAGE)) return;
    onCancel();
  }

  const marksField = (field: MarksField, label: string, ref: RefObject<HTMLInputElement>, note?: string) => {
    const inputId = id(field);
    const error = errorFor(field);
    return (
      <Field inputId={inputId} label={label} note={note} error={error}>
        <input ref={ref} id={inputId} type="number" step="0.25" value={draft[field]}
          onChange={e => update({ [field]: e.target.value })} onWheel={blurOnWheel}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy(inputId, Boolean(note), error)}
          className={classNames('input', error && 'border-danger focus:border-danger')} />
      </Field>
    );
  };

  const nameError = errorFor('name');
  const allSet = missing.length === 0;

  return (
    <section aria-labelledby={id('title')}
      className="flex flex-col gap-5 rounded-[20px] border-2 border-coral bg-white p-5 md:p-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id={id('title')} ref={titleRef} tabIndex={-1} className="section-title min-w-0 [overflow-wrap:anywhere]">
            {test ? test.name : 'New answer key'}
          </h2>
          <span className={classNames('pill shrink-0', allSet ? 'tone-fine' : 'tone-check')}>
            {draft.count - missing.length} of {draft.count} set
          </span>
        </div>
        {use && use.count > 0 && (
          // The results of past batches are shown against the key as it is now, so say so before it changes.
          <p className="hint">
            {capitalise(usedByText(use))}. Sheets already checked keep their marks, but their results will show
            right and wrong against the new answers. For a different test, make a new key instead.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field inputId={id('name')} label="Test name" error={nameError} className="sm:col-span-2 lg:col-span-5">
          <input ref={nameRef} id={id('name')} type="text" value={draft.name} maxLength={200} autoComplete="off"
            placeholder="e.g. Endline Oct 2026 · Class 7" onChange={e => update({ name: e.target.value })}
            aria-invalid={nameError ? true : undefined} aria-describedby={describedBy(id('name'), false, nameError)}
            className={classNames('input', nameError && 'border-danger focus:border-danger')} />
        </Field>
        <Field inputId={id('count')} label="Questions" note={`up to ${max}`}>
          <input id={id('count')} type="number" inputMode="numeric" min={1} max={max} step={1} value={countText}
            onChange={e => changeCount(e.target.value)} onBlur={settleCount} onWheel={blurOnWheel}
            aria-describedby={describedBy(id('count'), true)} className="input" />
        </Field>
        <Field inputId={id('options')} label="Answer choices">
          <select id={id('options')} value={draft.options} onChange={e => changeOptions(e.target.value)} className="select">
            {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        {marksField('marksRight', 'Marks if right', rightRef)}
        {marksField('marksWrong', 'Marks if wrong', wrongRef, 'use a minus number to take marks off, e.g. -0.25')}
        {marksField('marksBlank', 'Marks if blank', blankRef)}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id={id('answers')} className="m-0 font-sans text-[17px] font-semibold leading-7 text-ink">Correct answers</h3>
          <p className="hint">One row per question, like the printed sheet. Tap the right letter. Tap it again to clear it.</p>
        </div>

        <Field inputId={id('fill')} label="Or type all the answers in order" note="Spaces, commas and numbers are skipped."
          className="max-w-3xl">
          <div className="flex items-center gap-3">
            <input ref={fillRef} id={id('fill')} type="text" value={fillText} placeholder={`e.g. ${sample}`}
              autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
              onChange={e => changeFill(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  quickFill();
                }
              }}
              aria-invalid={fillProblem ? true : undefined}
              aria-describedby={[`${id('fill')}-note`, fillProblem && id('fill-problem')].filter(Boolean).join(' ')}
              className="input min-w-0 flex-1 uppercase tracking-[0.12em] placeholder:normal-case placeholder:tracking-normal" />
            <button type="button" onClick={quickFill} className="btn btn-secondary btn-small shrink-0">Fill</button>
          </div>
        </Field>

        {/* No close button: each note goes by itself once it no longer applies. */}
        {(fillProblem || stillCleared.length > 0) && (
          <Notice tone="warn">
            <div className="flex flex-col gap-1">
              {fillProblem && <p id={id('fill-problem')} className="m-0">{fillProblem}</p>}
              {stillCleared.length > 0 && <p className="m-0">{clearedText(stillCleared, draft.options)}</p>}
            </div>
          </Notice>
        )}

        {missingProblem && (
          // Right above the grid, so the words that explain the highlighted rows are seen with them.
          <div ref={missingRef} className="scroll-mt-4">
            <Notice key={round} tone="error">{missingProblem}</Notice>
          </div>
        )}

        <AnswerGrid containerRef={gridRef} count={draft.count} options={draft.options} answers={draft.answers}
          showMissing={triedSave} onChange={setAnswer} labelledBy={id('answers')} />
      </div>

      {otherProblems.length > 0 && (
        <Notice key={round} tone="error">
          <div className="flex flex-col gap-1">
            {otherProblems.map(p => <p key={p.kind} className="m-0">{p.text}</p>)}
          </div>
        </Notice>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" onClick={save} disabled={busy !== null} className="btn btn-primary w-full sm:w-auto">
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={cancel} disabled={busy !== null} className="btn btn-secondary w-full sm:w-auto">
          Cancel
        </button>
        {test && (
          <button type="button" onClick={archive} disabled={busy !== null} className="btn btn-quiet w-full sm:ml-auto sm:w-auto">
            <IconArchive />
            {busy === 'archive' ? 'Archiving…' : 'Archive this key'}
          </button>
        )}
      </div>
    </section>
  );
}
