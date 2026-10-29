// "Answer keys": the right answers for each test. Every key is a card; tapping one opens the editor
// in its place. Only one editor is open at a time, and unsaved changes are never dropped without asking.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconPencil, IconPlus, IconRefresh } from '../components/Icons';
import { problemFromError } from '../components/keys/answerKey';
import KeyEditor, { LEAVE_MESSAGE } from '../components/keys/KeyEditor';
import { KeyUse, Usage, usageFrom, usageOf, usedByText } from '../components/keys/usage';
import TestsSkeleton from '../components/skeletons/TestsSkeleton';
import { EmptyState, Notice } from '../components/ui';
import { api, Batch, Me, Test } from '../lib/api';
import { friendlyDate, plural, whoDid } from '../lib/format';

/** openId while a new key is being written. */
const NEW = 'new';
const NEW_BUTTON_ID = 'new-key-button';
const TITLE_ID = 'keys-title';
const cardId = (testId: string) => `key-${testId}`;

/** "made by you on 28 Oct", "made by asha today 4:40 pm". */
function madeText(t: Test, me: Me): string {
  const who = whoDid(t.created_by, me.user);
  const when = friendlyDate(t.created_at);
  if (!when) return `made by ${who}`;
  return /^(today|yesterday)\b/.test(when) ? `made by ${who} ${when}` : `made by ${who} on ${when}`;
}

/** "50 questions · used by 3 batches · made by you on 28 Oct". */
function keyMeta(t: Test, use: KeyUse | undefined, me: Me): string {
  const parts = [plural(t.question_count, 'question')];
  const used = use ? usedByText(use) : '';
  if (used) parts.push(used);
  parts.push(madeText(t, me));
  return parts.join(' · ');
}

function KeyCard({ test, meta, onOpen }: { test: Test; meta: string; onOpen: () => void }) {
  const metaId = `${cardId(test.id)}-meta`;
  return (
    <button id={cardId(test.id)} type="button" onClick={onOpen} aria-label={`Edit ${test.name}`} aria-describedby={metaId}
      className="flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border border-line bg-white px-5 py-4 text-left transition-colors hover:border-brand">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[19px] font-semibold leading-7 text-heading [overflow-wrap:anywhere]">{test.name}</span>
        <span id={metaId} className="text-[15px] leading-[22px] text-muted [overflow-wrap:anywhere]">{meta}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[15px] font-semibold text-brand">
        <IconPencil size={20} />
        Edit
      </span>
    </button>
  );
}

export default function TestsPage({ me }: { me: Me }) {
  const maxQuestions = me.sheet.question_count || 50;
  const [tests, setTests] = useState<Test[] | null>(null);
  // Batches per key; null until loaded (or when they could not be loaded: the keys still show).
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadRound, setLoadRound] = useState(0);
  // The key whose editor is open, NEW for a new key, or null.
  const [openId, setOpenId] = useState<string | null>(null);
  // Whether the open editor has unsaved changes, and whether it is saving or archiving.
  // Refs: they are only read when someone clicks.
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  // The element to focus once it is on screen, so keyboard users are not left on a removed button.
  const focusNext = useRef<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const askedForNew = searchParams.get('new') === '1';

  useEffect(() => {
    let cancelled = false;
    api.get<Test[]>('/api/tests')
      .then(list => {
        if (cancelled) return;
        setTests(list);
        setLoadError('');
      })
      .catch(e => { if (!cancelled) setLoadError(problemFromError(e, 'load the answer keys')); });
    // Only for "used by 3 batches".
    api.get<Batch[]>('/api/batches')
      .then(list => { if (!cancelled) setUsage(usageFrom(list)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [loadRound]);

  // The Check sheets page links to /tests?new=1 when there are no keys: open a new key straight
  // away, then take the parameter off the address so a reload does not open another.
  useEffect(() => {
    if (!askedForNew) return;
    setOpenId(NEW);
    setSearchParams(params => {
      const next = new URLSearchParams(params);
      next.delete('new');
      return next;
    }, { replace: true });
  }, [askedForNew, setSearchParams]);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    const el = document.getElementById(target);
    if (el) {
      focusNext.current = null;
      el.focus();
    }
  });

  const reload = () => setLoadRound(r => r + 1);
  const setDirty = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);
  const setBusy = useCallback((busy: boolean) => { busyRef.current = busy; }, []);
  const usageFor = (t: Test) => (usage ? usageOf(t, usage) : undefined);

  function openEditor(id: string) {
    // While a key is being saved or archived, its editor stays: it closes by itself when that is done.
    if (openId === id || busyRef.current) return;
    if (dirtyRef.current && !window.confirm(LEAVE_MESSAGE)) return;
    dirtyRef.current = false;
    setOpenId(id);
  }

  function closeEditor(focusId: string) {
    dirtyRef.current = false;
    busyRef.current = false;
    setOpenId(null);
    focusNext.current = focusId;
  }

  function tryAgain() {
    // The message goes, and the focused button with it: keep the keyboard on the page, at its heading.
    focusNext.current = TITLE_ID;
    setLoadError('');
    reload();
  }

  function handleSaved(saved: Test) {
    // Show the saved key at once; the reload below brings in anything else that changed.
    setTests(list => {
      if (!list) return [saved];
      return list.some(t => t.id === saved.id) ? list.map(t => (t.id === saved.id ? saved : t)) : [saved, ...list];
    });
    closeEditor(cardId(saved.id));
    reload();
  }

  function handleArchived(testId: string) {
    setTests(list => list && list.filter(t => t.id !== testId));
    closeEditor(NEW_BUTTON_ID);
    reload();
  }

  const editorFor = (test: Test | null) => (
    <KeyEditor test={test} maxQuestions={maxQuestions}
      usedBy={test ? usageFor(test) : undefined}
      onDirtyChange={setDirty}
      onBusyChange={setBusy}
      onCancel={() => closeEditor(test ? cardId(test.id) : NEW_BUTTON_ID)}
      onSaved={handleSaved}
      onArchived={() => { if (test) handleArchived(test.id); }} />
  );

  const writingNew = openId === NEW;
  const hasKeys = tests !== null && tests.length > 0;

  return (
    <div className="page flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 id={TITLE_ID} tabIndex={-1} className="page-title">Answer keys</h1>
          {!writingNew && (
            <button id={NEW_BUTTON_ID} type="button" onClick={() => openEditor(NEW)} className="btn btn-primary">
              <IconPlus />
              New key
            </button>
          )}
        </div>
        <p className="hint">The right answers for each test. You need one before you can check sheets.</p>
      </div>

      {loadError && (
        <Notice tone="error">
          <p className="m-0">{loadError}</p>
          <button type="button" onClick={tryAgain} className="btn btn-secondary btn-small mt-3">
            <IconRefresh size={20} />
            Try again
          </button>
        </Notice>
      )}

      {(writingNew || hasKeys) && (
        <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {writingNew && <li>{editorFor(null)}</li>}
          {tests?.map(t => (
            <li key={t.id}>
              {openId === t.id
                ? editorFor(t)
                : <KeyCard test={t} meta={keyMeta(t, usageFor(t), me)} onOpen={() => openEditor(t.id)} />}
            </li>
          ))}
        </ul>
      )}

      {tests === null && !loadError && <TestsSkeleton />}

      {tests !== null && tests.length === 0 && !writingNew && (
        <EmptyState title="No answer keys yet"
          action={(
            <button type="button" onClick={() => openEditor(NEW)} className="btn btn-primary">
              <IconPlus />
              New key
            </button>
          )}>
          Make one to start checking sheets.
        </EmptyState>
      )}
    </div>
  );
}
