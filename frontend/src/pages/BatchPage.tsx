// Results of one batch: every student with their marks, and the checked sheet itself.
// Wide screens show the list and the sheet side by side; below 1024 px the list fills the page and
// a student opens full screen. The open sheet is in the address (?sheet=<id>), so the browser's
// Back button and shared links work.
import classNames from 'classnames';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IconChevronLeft, IconChevronRight, IconDownload, IconSearch, IconTrash } from '../components/Icons';
import SheetViewer from '../components/SheetViewer';
import { useSheetLayouts } from '../components/sheet/useSheetLayouts';
import BatchSkeleton from '../components/skeletons/BatchSkeleton';
import { useToast } from '../components/Toast';
import { Chip, EmptyState, LiveCount, Notice } from '../components/ui';
import { api, ApiError, Batch, Me, Sheet, Test } from '../lib/api';
import { capitalise, fmtScore, friendlyDate, plural, whoDid } from '../lib/format';
import {
  checkSummary, countKinds, Problem, problemsOf, rollNumber, SheetKind, sheetKind, sheetTitle, sourceLabel, studentName,
} from '../lib/sheets';
import { resultsListPath } from './BatchesPage';

type Show = 'all' | 'check' | 'error';
interface Loaded { batch: Batch; test: Test; sheets: Sheet[]; }
/** Why the results could not load. canRetry: "Try again" can help. reload: reloading the page is the
 *  fix (it signs the teacher in again, or shows the screen that explains a turned-off account). */
interface LoadError { message: string; canRetry: boolean; reload?: boolean; }
/** Kept on the history entry of an open sheet. fromList: a phone opened it from the list, so closing
 *  can simply go back. auto: a wide screen picked it by itself, so it must not open full screen
 *  when the window gets narrow (a tablet turned upright, a zoomed-in browser). */
interface ViewerState { fromList?: boolean; auto?: boolean; }

/** Side by side from this width (Tailwind's lg); below it a sheet opens full screen. */
const WIDE_QUERY = '(min-width: 1024px)';
/** The search box shows for batches with more sheets than this. */
const SEARCH_AFTER = 8;

function subscribeToWidth(onChange: () => void) {
  const mql = window.matchMedia(WIDE_QUERY);
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  mql.addListener(onChange); // Safari 13 and older
  return () => mql.removeListener(onChange);
}
const isWide = () => window.matchMedia(WIDE_QUERY).matches;

/** True when the list and the sheet fit side by side. */
const useWideScreen = () => useSyncExternalStore(subscribeToWidth, isWide);

const RANK: Record<SheetKind, number> = { error: 0, check: 1, fine: 2 };

/** Could not read first, then to check, then read fine; the server's order (file, page) inside each. */
function orderForTeacher(sheets: Sheet[]): Sheet[] {
  return sheets
    .map((sheet, i) => ({ sheet, i, rank: RANK[sheetKind(sheet)] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(x => x.sheet);
}

function loadErrorOf(e: unknown): LoadError {
  const status = e instanceof ApiError ? e.status : 0;
  if (status === 404) return { message: 'This batch was not found. It may have been deleted.', canRetry: false };
  if (status === 401) {
    return { message: 'You have been signed out. Reload the page to sign in again.', canRetry: false, reload: true };
  }
  // "Your account is disabled" or "waiting for approval": trying again cannot help; reloading the
  // page shows the screen that explains it. A reply that is not the app's own carries only its code.
  if (status === 403) {
    const said = (e as ApiError).message || '';
    const why = said && !/^(request failed \(\d+\)|forbidden)$/i.test(said) ? said : 'you cannot see these results right now';
    return { message: `${capitalise(why)}.`, canRetry: false, reload: true };
  }
  if (status === 503) return { message: 'The database is starting up. Try again in a minute.', canRetry: true };
  if (status >= 500) return { message: 'The server had a problem. Try again in a minute.', canRetry: true };
  return { message: 'Check your internet connection and try again.', canRetry: true };
}

/** Why the batch could not be deleted, in plain words. */
function deleteErrorOf(e: unknown): string {
  const status = e instanceof ApiError ? e.status : 0;
  const said = e instanceof ApiError ? e.message : '';
  // Only the person who checked the sheets (or an admin) sees the button, so a refusal is most often
  // an account turned off (or waiting for approval) since the page was opened: say that instead.
  if (status === 403 && /^your account /i.test(said)) return `The batch could not be deleted. ${capitalise(said)}.`;
  if (status === 403) return 'Only the person who checked these sheets, or an admin, can delete this batch.';
  if (status === 401) return 'You have been signed out. Reload the page to sign in again.';
  if (status >= 500) return 'The batch could not be deleted. The server had a problem. Try again in a minute.';
  return 'The batch could not be deleted. Check your internet connection and try again.';
}

const withSheet = (params: URLSearchParams, sheetId: string) => {
  const next = new URLSearchParams(params);
  next.set('sheet', sheetId);
  return next;
};
const withoutSheet = (params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.delete('sheet');
  return next;
};

const BADGE: Record<SheetKind, string> = {
  fine: 'bg-leaf-wash text-leaf-ink',
  check: 'bg-sun-wash text-sun-ink',
  error: 'border-2 border-danger bg-white text-danger',
};
const STATUS_TEXT: Record<SheetKind, string> = { fine: 'text-leaf-text', check: 'text-sun-ink', error: 'text-danger' };

export default function BatchPage({ me }: { me: Me }) {
  const { id = '' } = useParams();
  // A fresh page (filter, search, loaded data) for every batch.
  return <BatchResults key={id} id={id} me={me} />;
}

function BatchResults({ id, me }: { id: string; me: Me }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const wide = useWideScreen();
  const [params, setParams] = useSearchParams();
  // Where questions sit on each marked picture. Kept here rather than in the viewer, which a phone
  // builds anew for every student it opens, so each sheet is asked for once while the page is open.
  const layouts = useSheetLayouts();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const [batch, sheets] = await Promise.all([
          api.get<Batch>(`/api/batches/${id}`),
          api.get<Sheet[]>(`/api/batches/${id}/sheets`),
        ]);
        const test = await api.get<Test>(`/api/tests/${batch.test_id}`);
        if (!cancelled) setData({ batch, test, sheets });
      } catch (e) {
        if (!cancelled) setLoadError(loadErrorOf(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const sheets = data?.sheets;
  const questionCount = data?.test.question_count ?? 0;
  const problems = useMemo(() => {
    const byId = new Map<string, Problem[]>();
    (sheets || []).forEach(s => byId.set(s.id, problemsOf(s, questionCount)));
    return byId;
  }, [sheets, questionCount]);
  const ordered = useMemo(() => orderForTeacher(sheets || []), [sheets]);
  const counts = useMemo(() => countKinds(sheets || []), [sheets]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    return ordered.filter(s => (show === 'all' || sheetKind(s) === show)
      && (!q || sheetTitle(s).toLowerCase().includes(q) || rollNumber(s).toLowerCase().includes(q)));
  }, [ordered, show, query]);

  // Which sheet is open. Wide screens always show one beside the list: the chosen one when it is in
  // the list, else the first in the list. Below that only a sheet the teacher chose (or a shared
  // link) opens, full screen; one the wide layout picked by itself does not.
  const state = location.state as ViewerState | null;
  const fromList = !!state?.fromList;
  const requestedId = params.get('sheet');
  const requested = (requestedId && sheets?.find(s => s.id === requestedId)) || null;
  const open = wide
    ? (requested && visible.includes(requested) ? requested : visible[0] || null)
    : (state?.auto ? null : requested);

  // Keep the address in step when the page picks the sheet itself (replace: not a step to go back to).
  useEffect(() => {
    if (wide && open && open.id !== requestedId) {
      const picked: ViewerState = { auto: true };
      setParams(p => withSheet(p, open.id), { replace: true, state: picked });
    }
  }, [wide, open, requestedId, setParams]);

  // Previous and Next follow the list as it is filtered and ordered on screen.
  const place = useMemo(() => {
    if (!open) return null;
    let list = visible;
    let i = list.indexOf(open);
    if (i < 0) {
      // Opened from a link while the filter hides it: move through every sheet instead.
      list = ordered;
      i = list.indexOf(open);
    }
    return { position: i + 1, total: list.length, prev: list[i - 1] || null, next: list[i + 1] || null };
  }, [open, visible, ordered]);

  // Moving to another sheet replaces the history entry. It keeps fromList, so closing still goes back
  // to the list, and drops auto: the teacher chose this sheet.
  const goTo = useCallback((sheetId: string) => {
    const keep: ViewerState | null = fromList ? { fromList: true } : null;
    setParams(p => withSheet(p, sheetId), { replace: true, state: keep });
  }, [setParams, fromList]);
  const goPrev = useCallback(() => {
    if (place?.prev) goTo(place.prev.id);
  }, [place, goTo]);
  const goNext = useCallback(() => {
    if (place?.next) goTo(place.next.id);
  }, [place, goTo]);

  const choose = (sheetId: string) => {
    if (wide) goTo(sheetId);
    // Phone: a new history entry, so the Back button closes the full screen sheet.
    else setParams(p => withSheet(p, sheetId), { state: { fromList: true } as ViewerState });
  };

  const close = useCallback(() => {
    if (fromList) navigate(-1);
    else setParams(p => withoutSheet(p), { replace: true });
  }, [fromList, navigate, setParams]);

  // Closing the full screen sheet puts the keyboard focus back on that student in the list.
  const fullScreenId = !wide && open ? open.id : null;
  const lastFullScreenId = useRef<string | null>(null);
  useEffect(() => {
    if (fullScreenId) {
      lastFullScreenId.current = fullScreenId;
      return;
    }
    const backTo = lastFullScreenId.current;
    lastFullScreenId.current = null;
    if (backTo) rows.current.get(backTo)?.focus();
  }, [fullScreenId]);

  // Side by side: keep the open student in view in the list while moving with Previous and Next.
  const panelId = wide && open ? open.id : null;
  useEffect(() => {
    if (panelId) rows.current.get(panelId)?.scrollIntoView({ block: 'nearest' });
  }, [panelId]);

  const remove = async () => {
    if (!data) return;
    const n = data.sheets.length;
    const question = n
      ? `Delete this batch and its ${plural(n, 'sheet')}? This cannot be undone.`
      : 'Delete this batch? This cannot be undone.';
    if (!window.confirm(question)) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.del(`/api/batches/${data.batch.id}`);
      toast('Batch deleted');
      navigate(resultsListPath(data.batch.id), { replace: true });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 404) {
        // Deleted already (in another tab, or by an admin): it is gone either way, and trying
        // again could only fail again.
        toast('This batch was already deleted');
        navigate(resultsListPath(data.batch.id), { replace: true });
        return;
      }
      setDeleting(false);
      setDeleteError(deleteErrorOf(e));
    }
  };

  // Back to the list as the teacher left it: with her search words and chip.
  const backLink = (
    <Link to={resultsListPath(id)} className="link inline-flex min-h-[44px] items-center gap-1 self-start text-[15px]">
      <IconChevronLeft size={18} />
      All results
    </Link>
  );

  if (loadError) {
    return (
      <div className="page flex flex-col gap-3.5">
        {backLink}
        <Notice tone="error" title="The results could not be loaded.">
          <p className="m-0">{loadError.message}</p>
          {loadError.canRetry && (
            <button type="button" className="btn btn-secondary btn-small mt-3" onClick={() => setAttempt(n => n + 1)}>
              Try again
            </button>
          )}
          {/* Installed on a phone, the app has no reload button of its own. */}
          {loadError.reload && (
            <button type="button" className="btn btn-secondary btn-small mt-3" onClick={() => window.location.reload()}>
              Reload page
            </button>
          )}
        </Notice>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page flex flex-col gap-3.5">
        {backLink}
        <BatchSkeleton />
      </div>
    );
  }

  const { batch, test } = data;
  const all = data.sheets;
  const title = batch.name || batch.test_name || test.name;
  const maxScore = Object.keys(test.answer_key || {}).length * test.marks_correct;
  const outOf = maxScore > 0 ? ` of ${fmtScore(maxScore)}` : '';
  // The server's figure, so this line and the Results list round the same way.
  const average = batch.average_score;
  const summary = [
    batch.name ? batch.test_name || test.name : '', // otherwise the title already names the test
    friendlyDate(batch.created_at),
    plural(all.length, 'sheet'),
    average == null ? '' : `average ${fmtScore(average)}${outOf}`,
    `checked by ${whoDid(batch.created_by, me.user)}`,
  ].filter(Boolean).join(' · ');
  const canDelete = me.user.role === 'admin' || batch.created_by === me.user.email;

  let nothingShown = '';
  if (visible.length === 0 && all.length > 0) {
    if (query.trim()) nothingShown = `No student matches “${query.trim()}”${show === 'all' ? '' : ' in this list'}.`;
    else if (show === 'check') nothingShown = 'No sheets need a check.';
    else nothingShown = 'Every sheet was read.';
  }
  // Said to screen reader users a moment after the search or a chip changes the list.
  let shownText = nothingShown;
  if (!shownText) {
    if (query.trim() || show !== 'all') shownText = `Showing ${visible.length} of ${plural(all.length, 'sheet')}.`;
    else shownText = all.length === 1 ? 'Showing 1 sheet.' : `Showing all ${all.length} sheets.`;
  }

  return (
    <div className="page">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section aria-labelledby="batch-title" className="flex w-full min-w-0 flex-col gap-3.5 lg:w-[440px] lg:flex-none">
          {backLink}
          {/* break-words: a long name with no spaces wraps instead of pushing the page sideways */}
          <h1 id="batch-title" className="page-title break-words">{title}</h1>
          <p className="hint break-words">{summary}</p>

          {all.length === 0 ? (
            <EmptyState title="No sheets in this batch"
              action={<Link to="/evaluate" className="btn btn-primary">Check sheets</Link>}>
              Checking may have been stopped before any sheet was read.
            </EmptyState>
          ) : (
            <>
              <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
                <Chip pressed={show === 'all'} onClick={() => setShow('all')}>All {counts.total}</Chip>
                <Chip pressed={show === 'check'} onClick={() => setShow('check')} className="chip-sun">
                  To check {counts.check}
                </Chip>
                <Chip pressed={show === 'error'} onClick={() => setShow('error')} className="chip-danger">
                  Could not read {counts.error}
                </Chip>
              </div>

              {all.length > SEARCH_AFTER && (
                <label className="field">
                  Find a student by name or roll number
                  <span className="relative block">
                    <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input ref={searchRef} type="search" className="input pl-12" value={query}
                      onChange={e => setQuery(e.target.value)} autoComplete="off" spellCheck={false} />
                  </span>
                </label>
              )}

              <LiveCount text={shownText} />

              {nothingShown ? (
                <div className="card flex flex-col items-start gap-3">
                  <p className="m-0 self-stretch break-words">{nothingShown}</p>
                  {query.trim() && (
                    <button type="button" className="btn btn-secondary btn-small"
                      onClick={() => {
                        setQuery('');
                        // The list takes this message's place: keep the keyboard in the search box.
                        searchRef.current?.focus();
                      }}>
                      Clear the search
                    </button>
                  )}
                </div>
              ) : (
                <ul aria-label="Students" className="m-0 flex list-none flex-col gap-3 p-0">
                  {visible.map(s => {
                    const kind = sheetKind(s);
                    const isOpen = open?.id === s.id;
                    const roll = rollNumber(s);
                    // No roll number: say where the sheet came from, unless the title already does.
                    const where = roll ? `Roll ${roll}` : studentName(s) ? sourceLabel(s) : '';
                    const status = kind === 'fine' ? 'Read fine'
                      : kind === 'check' ? checkSummary(problems.get(s.id) || []) : 'Could not read';
                    const badge = kind === 'error' ? '!' : fmtScore(s.score);
                    return (
                      <li key={s.id}>
                        <button type="button" onClick={() => choose(s.id)} aria-current={isOpen ? 'true' : undefined}
                          ref={el => {
                            if (el) rows.current.set(s.id, el);
                            else rows.current.delete(s.id);
                          }}
                          className={classNames(
                            'flex w-full items-center gap-3.5 rounded-2xl border-2 bg-white px-[18px] py-3.5 text-left',
                            isOpen ? 'border-coral' : 'border-line hover:border-brand',
                          )}>
                          <span aria-hidden="true"
                            className={classNames(
                              'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full font-display font-bold',
                              badge.length > 4 ? 'text-[15px]' : 'text-xl', BADGE[kind],
                            )}>
                            {badge}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            {/* A long name is cut short, as on the design. A file name (no name was read)
                                wraps instead: its end has the page number, which the teacher needs to
                                scan that page again. */}
                            <span className={classNames('font-display text-[19px] font-semibold leading-7 text-heading',
                              studentName(s) ? 'truncate' : '[overflow-wrap:anywhere]')}>
                              {sheetTitle(s)}
                            </span>
                            <span className="break-words text-[15px] leading-[22px] text-muted">
                              {where && `${where} · `}
                              <span className={classNames('font-semibold', STATUS_TEXT[kind])}>{status}</span>
                            </span>
                          </span>
                          {kind !== 'error' && <span className="sr-only">, score {fmtScore(s.score)}{outOf}</span>}
                          <IconChevronRight size={22} className="shrink-0 text-brand lg:hidden" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-col gap-1.5 pt-1">
                <a href={`/api/batches/${batch.id}/results.csv`} className="btn btn-primary w-full">
                  <IconDownload />
                  Download for Excel
                </a>
                <p className="hint text-center">Opens in Excel or Google Sheets: one row per student.</p>
              </div>
            </>
          )}

          {/* On white, not the ivory page: red text keeps 4.8:1 contrast; hovering outlines it in red. */}
          {canDelete && (
            <button type="button" onClick={remove} disabled={deleting}
              className="btn btn-quiet self-start bg-white text-danger hover:border-danger hover:bg-white hover:text-danger disabled:opacity-60 disabled:hover:border-transparent">
              <IconTrash />
              {deleting ? 'Deleting…' : 'Delete this batch'}
            </button>
          )}
          {deleteError && <Notice tone="error" onClose={() => setDeleteError('')}>{deleteError}</Notice>}
        </section>

        {wide && open && place && (
          <div className="min-w-0 flex-1 self-start lg:sticky lg:top-6">
            <SheetViewer mode="panel" sheet={open} test={test} maxScore={maxScore} {...place} layouts={layouts}
              onPrev={goPrev} onNext={goNext} />
          </div>
        )}
      </div>

      {!wide && open && place && (
        <SheetViewer mode="screen" sheet={open} test={test} maxScore={maxScore} {...place} layouts={layouts}
          onPrev={goPrev} onNext={goNext} onClose={close} />
      )}
    </div>
  );
}
