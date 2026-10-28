// What the "Check sheets" screen holds: the chosen test, the batch name, the chosen files and the
// checking run. It lives outside React on purpose. Moving to another tab of the app and back keeps
// the files a teacher picked (often photos taken one by one) and shows the checking, which keeps
// going meanwhile: it runs in this browser tab, not in the screen.
import { useSyncExternalStore } from 'react';
import { countPages, isSupported } from '../../lib/pages';

/** One file in the Scans list. */
export interface ScanFile {
  /** Name, size and date of the file as picked, to skip the same file picked twice. */
  key: string;
  /** The file to read. Renamed when another file in the list has the same name ("image (2).jpg"). */
  file: File;
  kind: 'pdf' | 'photo';
  /** Pages, one sheet each. null while a PDF is being counted, or when it could not be opened. */
  pages: number | null;
  /** The PDF could not be opened to count its pages. */
  unreadable: boolean;
}

export interface CheckRun {
  /** starting: making the batch and finishing the page count. checking: sending pages. */
  phase: 'starting' | 'checking' | 'finished';
  batchId: string;
  /** Sheets to check, and sheets done so far (including those that could not be read). */
  total: number;
  done: number;
  /** The three tiles: read fine, to check, could not read. */
  fine: number;
  check: number;
  bad: number;
  /** What is happening now, e.g. "class7.pdf, page 3". */
  now: string;
  /** One plain sentence for each page or file that did not get checked. */
  problems: string[];
}

export interface Session {
  testId: string;
  batchName: string;
  files: ScanFile[];
  /** The checking run; null until "Check sheets" is pressed, and again after "Check more sheets". */
  run: CheckRun | null;
  /** Why checking could not start, as a sentence. */
  startError: string;
}

let session: Session = { testId: '', batchName: '', files: [], run: null, startError: '' };
const listeners = new Set<() => void>();

export const getSession = () => session;

export function updateSession(patch: Partial<Session> | ((current: Session) => Partial<Session>)) {
  session = { ...session, ...(typeof patch === 'function' ? patch(session) : patch) };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The screen's state; the component re-renders whenever it changes. */
export const useSession = () => useSyncExternalStore(subscribe, getSession);

export const setTestId = (testId: string) => updateSession({ testId });
export const setBatchName = (batchName: string) => updateSession({ batchName });

/** Sheets a file stands for while checking. A file that could not be opened counts as one sheet that
 *  could not be read, so it shows in the "could not read" tile. */
export const expectedPages = (f: ScanFile) => (f.pages !== null && f.pages > 0 ? f.pages : 1);

/** For the list hint and the big button: are pages still being counted, how many sheets the counted
 *  files hold, and how many files could not be opened (they add no sheets: nobody knows their pages). */
export function sheetTotals(files: ScanFile[]) {
  return {
    counting: files.some(f => f.pages === null && !f.unreadable),
    sheets: files.reduce((n, f) => n + (f.pages ?? 0), 0),
    unreadable: files.filter(f => f.unreadable).length,
  };
}

// ---- adding and removing files ---------------------------------------------------------------

export interface AddResult {
  added: ScanFile[];
  /** Files that were already in the list. */
  duplicates: number;
  /** Names of files that are not PDF, JPG or PNG. */
  skipped: string[];
}

// Files a computer puts in folders by itself; nobody means to check these, so they are left out quietly.
const SYSTEM_FILE = /^(\..*|thumbs\.db|desktop\.ini)$/i;
// The browser knows a file's type even when its name does not say it: some phones hand over a photo
// with no extension, and Windows saves many JPEG photos as .jfif. Such names get the right extension.
const EXTENSION_FOR_TYPE: Record<string, string> = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
};

const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

// Natural order, so scan2.jpg comes before scan10.jpg.
const byPath = (a: File, b: File) =>
  (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: 'base' });

/** The name to use for a picked file ("photo.jfif" becomes "photo.jfif.jpg"), or null when it is not
 *  a PDF, JPG or PNG. */
function usableName(f: File): string | null {
  if (isSupported(f)) return f.name;
  const ext = EXTENSION_FOR_TYPE[f.type];
  return ext ? `${f.name || 'scan'}${ext}` : null;
}

/** "image.jpg" becomes "image (2).jpg" when that name is taken: iPhones call every new photo image.jpg,
 *  and the name is how a teacher tells sheets apart in the results. */
function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
  return candidate;
}

/** Adds picked files to the end of the list, leaving out files already there and files that are
 *  not PDF, JPG or PNG. PDFs are then counted in the background. */
export function addFiles(picked: File[]): AddResult {
  const result: AddResult = { added: [], duplicates: 0, skipped: [] };
  if (session.run) return result; // the list belongs to the checking run until "Check more sheets"
  const keys = new Set(session.files.map(f => f.key));
  const names = new Set(session.files.map(f => f.file.name.toLowerCase()));
  for (const original of picked.slice().sort(byPath)) {
    if (SYSTEM_FILE.test(original.name)) continue;
    const name = usableName(original);
    if (!name) {
      result.skipped.push(original.name);
      continue;
    }
    const key = keyOf(original);
    if (keys.has(key)) {
      result.duplicates += 1;
      continue;
    }
    const unique = uniqueName(name, names);
    keys.add(key);
    names.add(unique.toLowerCase());
    const file = unique === original.name
      ? original
      : new File([original], unique, { type: original.type, lastModified: original.lastModified });
    const kind = /\.pdf$/i.test(unique) ? 'pdf' : 'photo';
    result.added.push({ key, file, kind, pages: kind === 'photo' ? 1 : null, unreadable: false });
  }
  if (result.added.length > 0) {
    updateSession(current => ({ files: current.files.concat(result.added), startError: '' }));
    result.added.filter(f => f.kind === 'pdf').forEach(queueCount);
  }
  return result;
}

export function removeFile(key: string) {
  if (session.run) return;
  updateSession(current => ({ files: current.files.filter(f => f.key !== key) }));
}

export function removeAllFiles() {
  if (session.run) return;
  updateSession({ files: [] });
}

/** "Check more sheets": an empty list and no batch name, with the same test still chosen. */
export function startOver() {
  if (session.run && session.run.phase !== 'finished') return;
  updateSession({ files: [], batchName: '', run: null, startError: '' });
}

// ---- counting PDF pages ----------------------------------------------------------------------

// One PDF at a time: opening several big PDFs at once can run a phone out of memory.
let countQueue: Promise<void> = Promise.resolve();
const counts = new Map<string, Promise<void>>();

function patchFile(key: string, patch: Partial<ScanFile>) {
  updateSession(current => ({ files: current.files.map(f => (f.key === key ? { ...f, ...patch } : f)) }));
}

function queueCount(item: ScanFile) {
  const job = countQueue.then(async () => {
    if (!session.files.some(f => f.key === item.key)) return; // removed before its turn
    try {
      const pages = await countPages([item.file]);
      patchFile(item.key, pages > 0 ? { pages } : { unreadable: true });
    } catch {
      patchFile(item.key, { unreadable: true });
    }
  });
  countQueue = job.catch(() => undefined);
  counts.set(item.key, job);
  job
    .finally(() => {
      if (counts.get(item.key) === job) counts.delete(item.key);
    })
    .catch(() => undefined);
}

/** True while any of these files is still waiting for its page count. */
export const isCounting = (keys: string[]) => keys.some(key => counts.has(key));

/** Resolves once every one of these files has been counted (or found unreadable). */
export const countsDone = (keys: string[]) =>
  Promise.all(keys.map(key => counts.get(key)?.catch(() => undefined))).then(() => undefined);
