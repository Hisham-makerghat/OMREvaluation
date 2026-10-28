// Results: every set of sheets checked so far, newest first, in two groups ("This week", "Earlier").
// Teachers can search by batch, school or test, and narrow the list to their own sets or to sets
// with sheets still to check. The search words and the chosen chip are kept in the address
// (?q=...&show=...), so coming Back from one set of results shows the same list again. The
// "All results" link on that page does the same (see resultsListPath).
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconChevronRight, IconSearch, IconUpload } from '../components/Icons';
import { Chip, EmptyState, LiveCount, Loading, Notice } from '../components/ui';
import { api, ApiError, Batch, Me } from '../lib/api';
import { capitalise, fmtScore, friendlyDate, isWithinDays, plural, whoDid } from '../lib/format';

type Show = 'all' | 'mine' | 'check';

const FILTERS: { value: Show; label: string; className?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  // Yellow like the "to check" words, so it stands out even when it is not chosen.
  { value: 'check', label: 'Has sheets to check', className: 'chip-sun' },
];

const readShow = (value: string | null): Show => (value === 'mine' || value === 'check' ? value : 'all');

/** The part of the address that keeps the search words and the chip: "q=mahal&show=check". */
function viewSearch(q: string, s: Show): string {
  const view = new URLSearchParams();
  if (q) view.set('q', q);
  if (s !== 'all') view.set('show', s);
  return view.toString();
}

/** The list's search words and chip, saved as the teacher opens a set of results from it. Kept for
 *  this browser tab only. */
const VIEW_KEY = 'omr-results-view';

function rememberView(batchId: string, view: string) {
  try {
    window.sessionStorage.setItem(VIEW_KEY, JSON.stringify({ batchId, view }));
  } catch {
    // Storage blocked: the "All results" link shows the whole list.
  }
}

/** Where the "All results" link on a set of results goes: this list as the teacher left it to open
 *  that set (search words and chip), as the browser's Back button shows it. A set reached another
 *  way ("See results" after checking, a shared link) goes back to the whole list, not to a search
 *  the teacher made before. */
export function resultsListPath(batchId: string): string {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(VIEW_KEY) || 'null');
    if (saved && saved.batchId === batchId && typeof saved.view === 'string' && saved.view) {
      return `/batches?${saved.view}`;
    }
  } catch {
    // Storage blocked, or something else saved there: the whole list.
  }
  return '/batches';
}

/** GET /api/batches sends at most this many sets, the newest first (list_batches in api.py). */
const NEWEST_LIMIT = 200;

/** Why the list could not load, in plain words, and whether reloading the page is the fix. */
interface LoadProblem { text: string; reload: boolean; }

function loadProblem(e: unknown): LoadProblem {
  const err = e as Partial<ApiError> | null | undefined;
  switch (err?.status) {
    case undefined: // fetch itself failed: no connection
      return { text: 'Check your internet connection, then try again.', reload: false };
    case 401:
      // Reloading takes the teacher through sign-in and back to this page.
      return { text: 'You have been signed out. Reload the page to sign in again.', reload: true };
    case 403: // "your account is waiting for approval" or "your account is disabled"
      return { text: `${capitalise(err?.message || 'you cannot see results right now')}.`, reload: true };
    case 502:
    case 503:
    case 504:
      return { text: 'The OMR Tool is starting up. Wait a minute, then try again.', reload: false };
    default:
      return { text: 'Please try again. If it keeps happening, tell a MakerGhat admin.', reload: false };
  }
}

/** True when every typed word is in the batch name, the test name or the checker's email. */
function matchesSearch(b: Batch, words: string[]): boolean {
  const text = [b.name, b.test_name, b.created_by].join('\n').toLowerCase();
  return words.every(word => text.includes(word));
}

/** Puts " · " between the parts of a line. */
const dotted = (parts: ReactNode[]) =>
  parts.map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{part}</Fragment>);

/** "5 sheets · average 42.4 of 50 · 1 to check · 2 could not read" */
function BatchStats({ batch: b }: { batch: Batch }) {
  if (b.sheet_count === 0) return <div className="text-[15px]">no sheets yet</div>;
  const parts: ReactNode[] = [<b>{plural(b.sheet_count, 'sheet')}</b>];
  if (b.average_score != null) {
    parts.push(`average ${fmtScore(b.average_score)}${b.max_score != null ? ` of ${fmtScore(b.max_score)}` : ''}`);
  }
  if (b.review_count > 0) parts.push(<span className="font-semibold text-sun-ink">{b.review_count} to check</span>);
  if (b.error_count > 0) parts.push(<span className="font-semibold text-danger">{b.error_count} could not read</span>);
  if (b.review_count === 0 && b.error_count === 0) {
    parts.push(<span className="font-semibold text-leaf-text">all read fine</span>);
  }
  return <div className="text-[15px]">{dotted(parts)}</div>;
}

/** One set of checked sheets: a card that opens its results. */
function BatchRow({ batch: b, me, onOpen }: { batch: Batch; me: Me; onOpen: (batchId: string) => void }) {
  const testName = (b.test_name || '').trim();
  const title = (b.name || '').trim() || testName || 'No name';
  const about = [title === testName ? '' : testName, friendlyDate(b.created_at), whoDid(b.created_by || '', me.user)]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link to={`/batches/${b.id}`} onClick={() => onOpen(b.id)}
      className="flex items-center gap-3.5 rounded-2xl border border-line bg-white px-[18px] py-4 text-ink no-underline transition-colors hover:border-brand">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[26px]">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 break-words font-display text-[19px] font-semibold text-heading">{title}</span>
          {/* Checking was stopped part way (the tab was closed) or is still running. */}
          {b.status === 'open' && <span className="pill tone-neutral whitespace-nowrap leading-5">not finished</span>}
        </div>
        {about && <div className="break-words text-[15px] text-muted">{about}</div>}
        <BatchStats batch={b} />
      </div>
      <IconChevronRight size={22} className="shrink-0 text-brand" />
    </Link>
  );
}

function Group({ label, batches, me, onOpen }: {
  label: string; batches: Batch[]; me: Me; onOpen: (batchId: string) => void;
}) {
  if (batches.length === 0) return null;
  return (
    <section className="mt-2 flex flex-col gap-4">
      <h2 className="section-label">{label}</h2>
      <ul className="flex flex-col gap-4">
        {batches.map(b => <li key={b.id}><BatchRow batch={b} me={me} onOpen={onOpen} /></li>)}
      </ul>
    </section>
  );
}

export default function BatchesPage({ me }: { me: Me }) {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [problem, setProblem] = useState<LoadProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const chips = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false; // StrictMode runs this twice; only the answer for the live run counts
    api.get<Batch[]>('/api/batches')
      .then(list => {
        if (cancelled) return;
        // api.get gives null for an empty or non-JSON reply (say, a web page): show the problem, not "Loading" for ever.
        if (!Array.isArray(list)) throw new ApiError(500, 'the reply was not a list of results');
        setBatches(list);
      })
      .catch(e => { if (!cancelled) setProblem(loadProblem(e)); });
    return () => { cancelled = true; };
  }, [attempt]);

  const query = params.get('q') ?? '';
  const show = readShow(params.get('show'));

  // Replace, not push, so typing and choosing chips do not fill up the Back button.
  const setView = (q: string, s: Show) => setParams(viewSearch(q, s), { replace: true });

  // Opening a set of results: its "All results" link brings back this search and chip.
  const openBatch = (batchId: string) => rememberView(batchId, viewSearch(query, show));

  const tryAgain = () => {
    if (problem?.reload) {
      window.location.reload();
      return;
    }
    setProblem(null);
    setAttempt(n => n + 1);
    // The button just pressed goes away while the list loads, so keep the keyboard place at the page title.
    heading.current?.focus();
  };

  const showAll = () => {
    setView('', 'all');
    // The "Show all" button goes away, so move focus to the "All" chip. Not to the search box:
    // on a phone that would open the keyboard over the list.
    chips.current?.querySelector('button')?.focus();
  };

  let body: ReactNode;
  if (problem) {
    body = (
      <Notice tone="error" title="The results could not load">
        <p className="m-0">{problem.text}</p>
        <button type="button" className="btn btn-secondary mt-3" onClick={tryAgain}>
          {problem.reload ? 'Reload page' : 'Try again'}
        </button>
      </Notice>
    );
  } else if (batches === null) {
    body = <Loading label="Loading results…" />;
  } else if (batches.length === 0) {
    body = (
      <EmptyState title="Nothing checked yet"
        action={<Link to="/evaluate" className="btn btn-primary"><IconUpload />Check sheets</Link>}>
        When you check answer sheets, their results show here.
      </EmptyState>
    );
  } else {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = batches.filter(b =>
      (show !== 'mine' || b.created_by === me.user.email)
      && (show !== 'check' || b.review_count > 0)
      && matchesSearch(b, words));
    const now = new Date();
    const thisWeek = shown.filter(b => isWithinDays(b.created_at, 7, now));
    const earlier = shown.filter(b => !isWithinDays(b.created_at, 7, now));
    const filtering = words.length > 0 || show !== 'all';
    // When the server sends as many sets as it ever sends, older ones may be missing: never say "all" then.
    const cutOff = batches.length >= NEWEST_LIMIT;
    const total = cutOff ? `the newest ${batches.length}` : String(batches.length);
    let summary = cutOff ? `Showing ${total}.` : `Showing all ${total}.`;
    if (filtering) summary = shown.length === 0 ? 'No results match.' : `Showing ${shown.length} of ${total}.`;

    body = (
      <>
        {/* A form so the Search key on a phone keyboard closes the keyboard and shows the list. */}
        <form role="search" className="relative" onSubmit={e => { e.preventDefault(); searchBox.current?.blur(); }}>
          <label htmlFor="results-search" className="sr-only">Search results</label>
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          {/* The label is hidden, so the placeholder is the only visible wording: muted (5.3:1), darker than the shared one. */}
          <input ref={searchBox} id="results-search" type="search" className="input pl-12 placeholder:text-muted" autoComplete="off"
            placeholder="Search by batch, school or test" value={query}
            onChange={e => setView(e.target.value, show)} />
        </form>

        <div ref={chips} role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <Chip key={f.value} pressed={show === f.value} onClick={() => setView(query, f.value)} className={f.className}>
              {f.label}
            </Chip>
          ))}
        </div>

        {cutOff && (
          <p className="hint">
            Only the newest {batches.length} results are listed here. Older ones do not show up, even in search.
          </p>
        )}

        <LiveCount text={summary} />

        {shown.length === 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="hint">No results match.</p>
            <button type="button" className="btn btn-quiet btn-small" onClick={showAll}>Show all</button>
          </div>
        ) : (
          <>
            <Group label="This week" batches={thisWeek} me={me} onOpen={openBatch} />
            <Group label="Earlier" batches={earlier} me={me} onOpen={openBatch} />
          </>
        )}
      </>
    );
  }

  return (
    <div className="page flex flex-col gap-4">
      <h1 ref={heading} tabIndex={-1} className="page-title">Results</h1>
      {body}
    </div>
  );
}
