// Checking a batch: make the batch, turn each file into page pictures on this device, send the
// pages one at a time, and count what comes back. It runs outside the screen (see session.ts), so
// moving to another tab of the app does not stop it; closing the browser tab does.
import { api, ApiError, Batch, Sheet } from '../../lib/api';
import { PageImage, pagesOf } from '../../lib/pages';
import { sheetKind } from '../../lib/sheets';
import { CheckRun, countsDone, expectedPages, getSession, isCounting, ScanFile, updateSession } from './session';

const TRIES = 4;
const WAITING_TEXT = 'Waiting for the internet connection to come back…';
/** The longest wait for the device to say it is online before trying to send anyway. */
const OFFLINE_WAIT_MS = 30000;

// What lib/api.ts puts in an error when the reply was not the server's own JSON, for example a gateway
// page while the server restarts: HTTP wording that means nothing to a teacher.
const HTTP_PHRASES = [
  'bad request', 'unauthorized', 'forbidden', 'not found', 'method not allowed', 'request timeout', 'request time-out',
  'conflict', 'payload too large', 'request entity too large', 'too many requests', 'internal server error',
  'not implemented', 'bad gateway', 'service unavailable', 'gateway timeout', 'gateway time-out',
];
const isBareHttp = (message: string) =>
  /^request failed \(\d+\)$/i.test(message) || HTTP_PHRASES.includes(message.toLowerCase());

/** Why a request did not work, in plain words and without a full stop. */
export function reasonText(e: unknown): string {
  if (!(e instanceof ApiError)) return 'the internet connection was lost';
  if (e.status === 401) return 'you are signed out. Reload the page to sign in again';
  if (e.status === 413) return 'the file is too big to send';
  const message = (e.message || '').trim();
  const bare = !message || isBareHttp(message);
  if (e.status >= 500 && (bare || /^unexpected error/i.test(message))) return 'the server had a problem. Try again in a minute';
  return bare ? 'the server did not answer' : message;
}

export const withFullStop = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);

/** Why a page was not sent, for the list of problems. Without "try again in a minute": checking has
 *  already tried it again, and the list has no button to try once more. */
const pageReasonText = (e: unknown) => reasonText(e).replace(/[.,]\s*(?:please\s+)?try again in a minute$/i, '');

const sleep = (ms: number) => new Promise<void>(resolve => { window.setTimeout(resolve, ms); });

/** Resolves when the device says it is online again, or after OFFLINE_WAIT_MS at the latest: some
 *  computers (with a VPN, for example) say they are offline while the internet works. */
function waitUntilOnline(): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      window.removeEventListener('online', check);
      window.clearInterval(timer);
      window.clearTimeout(limit);
      resolve();
    };
    const check = () => {
      if (navigator.onLine) done();
    };
    const timer = window.setInterval(check, 5000); // in case the "online" event is missed
    const limit = window.setTimeout(done, OFFLINE_WAIT_MS);
    window.addEventListener('online', check);
  });
}

// Set to false once a page goes through while the device says it is offline. From then on that signal
// is ignored, so a computer that wrongly says "offline" does not wait half a minute before every page.
let trustOnlineSignal = true;
const looksOffline = () => trustOnlineSignal && !navigator.onLine;

/** Sends one page. A dropped connection or a busy server is tried again. While the device is offline
 *  it waits for the connection, and a try that fails meanwhile is not counted, so a long gap in the
 *  internet does not lose pages. */
async function uploadWithRetry(batchId: string, form: FormData, onWaiting: (waiting: boolean) => void): Promise<Sheet[]> {
  let attempt = 1;
  for (;;) {
    if (looksOffline()) {
      onWaiting(true);
      await waitUntilOnline();
      onWaiting(false);
    }
    try {
      const sheets = await api.upload<Sheet[]>(`/api/batches/${batchId}/sheets`, form);
      if (!navigator.onLine) trustOnlineSignal = false;
      return sheets;
    } catch (e) {
      // The server looked at the page and said no: sending it again will not help.
      if (e instanceof ApiError && e.status < 500 && e.status !== 408) throw e;
      // The page may have reached the server with only its reply lost on the way. Sent again, it says
      // so: the server then answers with the sheet it saved instead of adding the same sheet twice.
      form.set('retry', '1');
      // No connection, and the device says it is offline: wait for it again instead of using up a try.
      if (!(e instanceof ApiError) && looksOffline()) continue;
      if (attempt >= TRIES) throw e;
      await sleep(1500 * attempt);
      attempt += 1;
    }
  }
}

/** Marks the batch finished, tried again like a page: a batch left open shows "not finished" in
 *  Results for good. False when it did not get through. */
async function finishBatch(batchId: string, onWaiting: (waiting: boolean) => void): Promise<boolean> {
  for (let attempt = 1; ; attempt += 1) {
    if (looksOffline()) {
      onWaiting(true);
      await waitUntilOnline();
      onWaiting(false);
    }
    try {
      await api.post(`/api/batches/${batchId}/finish`);
      return true;
    } catch (e) {
      // The server said no (the batch was deleted meanwhile, say): trying again will not help.
      if ((e instanceof ApiError && e.status < 500 && e.status !== 408) || attempt >= TRIES) return false;
      await sleep(1500 * attempt);
    }
  }
}

/** "class7.pdf, page 3", or the photo's name. */
const pageLabel = (item: ScanFile, pageNo: number) => (item.kind === 'pdf' ? `${item.file.name}, page ${pageNo}` : item.file.name);

function pageForm(item: ScanFile, page: PageImage): FormData {
  const form = new FormData();
  form.append('file', page.blob, `${item.file.name.replace(/\.[^.]+$/, '')}-p${page.pageNo}.jpg`);
  form.append('source_name', item.file.name);
  form.append('page_no', String(page.pageNo));
  return form;
}

function openProblemText(item: ScanFile, fromPage: number, error: unknown): string {
  const where = fromPage > 1 ? `${item.file.name} from page ${fromPage} on` : item.file.name;
  let why = item.kind === 'pdf' ? 'the file may be damaged' : 'the photo may be damaged';
  if ((error as { name?: unknown } | null)?.name === 'PasswordException') why = 'it is locked with a password';
  else if (error instanceof RangeError) why = 'it is too big for this device';
  return `Could not open ${where}: ${why}.`;
}

/** read fine = read and nothing to look at; to check = read but flagged; could not read = the rest. */
function countSheets(progress: CheckRun, sheets: Sheet[]) {
  if (sheets.length === 0) progress.bad += 1;
  for (const s of sheets) {
    const kind = sheetKind(s);
    if (kind === 'fine') progress.fine += 1;
    else if (kind === 'check') progress.check += 1;
    else progress.bad += 1;
  }
}

/** The sign-in ran out (App Service ends it after 8 hours). Every other page would be refused the
 *  same way, so checking stops and says so once, instead of listing every page. */
class SignedOut extends Error {}

const SIGNED_OUT_TEXT = 'Checking stopped: you are signed out. Reload the page to sign in again, '
  + 'then check the sheets that are not in the results.';

/** Sends every page of one file. If the file cannot be opened, or stops part way, its missing pages
 *  count as "could not read" and checking goes on with the next file. */
async function checkFile(batchId: string, item: ScanFile, progress: CheckRun, publish: () => void) {
  const expected = expectedPages(item);
  let pagesSeen = 0;
  let openError: unknown = null;
  try {
    for await (const page of pagesOf([item.file])) {
      pagesSeen += 1;
      if (pagesSeen > expected) progress.total += 1; // more pages than counted before
      const label = pageLabel(item, page.pageNo);
      progress.now = label;
      publish();
      try {
        const sheets = await uploadWithRetry(batchId, pageForm(item, page), waiting => {
          progress.now = waiting ? WAITING_TEXT : label;
          publish();
        });
        countSheets(progress, sheets);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) throw new SignedOut();
        progress.bad += 1;
        progress.problems.push(`Could not send ${label}: ${withFullStop(pageReasonText(e))}`);
      }
      progress.done += 1;
      publish();
    }
  } catch (e) {
    if (e instanceof SignedOut) throw e;
    openError = e;
  }
  const missing = expected - pagesSeen;
  if (missing > 0) {
    progress.bad += missing;
    progress.done += missing;
    progress.problems.push(openProblemText(item, pagesSeen + 1, openError));
    publish();
  }
}

// ---- keeping the page alive while it checks ----------------------------------------------------

function warnBeforeLeaving(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = ''; // some browsers only ask "Leave site?" when this is set
}

/** If the tab is closed anyway, still mark the batch finished so it does not look stuck in Results. */
function finishIfClosed(batchId: string): () => void {
  const onHide = (e: PageTransitionEvent) => {
    if (!e.persisted && typeof navigator.sendBeacon === 'function') navigator.sendBeacon(`/api/batches/${batchId}/finish`);
  };
  window.addEventListener('pagehide', onHide);
  return () => window.removeEventListener('pagehide', onHide);
}

// The Screen Wake Lock API is not in this TypeScript version's DOM types.
interface WakeLockSentinelLike { release(): Promise<void>; }
interface WakeLockLike { request(type: 'screen'): Promise<WakeLockSentinelLike>; }

/** Keeps a phone's screen on while checking: a phone that locks itself can pause this page. */
function keepScreenOn(): () => void {
  const found = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  if (!found) return () => undefined;
  const wakeLock: WakeLockLike = found;
  let active = true;
  let sentinel: WakeLockSentinelLike | null = null;
  const request = () => {
    if (!active || document.visibilityState !== 'visible') return;
    wakeLock.request('screen')
      .then(s => {
        if (active) sentinel = s;
        else s.release().catch(() => undefined);
      })
      .catch(() => undefined); // not allowed right now (battery saver, older browser): carry on without it
  };
  // The browser lets go of the lock whenever the page is hidden; ask again when it is back.
  document.addEventListener('visibilitychange', request);
  request();
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', request);
    if (sentinel) sentinel.release().catch(() => undefined);
    sentinel = null;
  };
}

// ---- the run ---------------------------------------------------------------------------------

/** Checks every file in the list against the test. Resolves when checking has finished, or when
 *  the batch could not be made (then the session's startError says why). */
export async function startChecking(testId: string): Promise<void> {
  const { files, batchName, run } = getSession();
  if (run || files.length === 0 || !testId) return;

  const progress: CheckRun = {
    phase: 'starting', batchId: '', total: 0, done: 0, fine: 0, check: 0, bad: 0, now: 'Getting ready…', problems: [],
  };
  const publish = () => updateSession({ run: { ...progress, problems: progress.problems.slice() } });
  updateSession({ testId, startError: '' });
  publish();

  const batch = await api.post<Batch>('/api/batches', { test_id: testId, name: batchName.trim() })
    .catch((e: unknown) => {
      updateSession({ run: null, startError: `Could not start checking: ${withFullStop(reasonText(e))}` });
      return null;
    });
  if (!batch) return;

  progress.batchId = batch.id;
  window.addEventListener('beforeunload', warnBeforeLeaving);
  const stopFinishIfClosed = finishIfClosed(batch.id);
  const letScreenSleep = keepScreenOn();
  let stoppedEarly = '';
  try {
    const keys = files.map(f => f.key);
    if (isCounting(keys)) {
      progress.now = 'Counting pages…';
      publish();
      await countsDone(keys);
    }
    // Use the page counts as they are now: some may have finished after the button was pressed.
    const latest = getSession().files;
    const items = files.map(f => latest.find(x => x.key === f.key) || f);
    progress.phase = 'checking';
    progress.total = items.reduce((n, f) => n + expectedPages(f), 0);
    publish();
    for (const item of items) await checkFile(batch.id, item, progress, publish);
  } catch (e) {
    if (e instanceof SignedOut) {
      // The pages not sent count as "could not read", like any other page that did not get through.
      progress.bad += Math.max(0, progress.total - progress.done);
      progress.done = Math.max(progress.done, progress.total);
      stoppedEarly = SIGNED_OUT_TEXT;
    } else {
      // Not expected: every file and page deals with its own problems. Say so rather than stop silently.
      stoppedEarly = `Checking stopped early: ${withFullStop(e instanceof Error ? e.message : String(e))}`;
    }
  } finally {
    progress.now = 'Finishing…';
    publish();
    const finishedOnServer = await finishBatch(batch.id, waiting => {
      progress.now = waiting ? WAITING_TEXT : 'Finishing…';
      publish();
    });
    window.removeEventListener('beforeunload', warnBeforeLeaving);
    // Still not through: closing the tab later sends it once more.
    if (finishedOnServer) stopFinishIfClosed();
    letScreenSleep();
    // Listed only now that checking is over. Listed earlier, it could be the first problem, which the
    // screen reads out with "Checking goes on." after it.
    if (stoppedEarly) progress.problems.push(stoppedEarly);
    progress.phase = 'finished';
    progress.now = '';
    publish();
  }
}
