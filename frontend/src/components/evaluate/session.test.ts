import { api, ApiError, Sheet } from '../../lib/api';
import { countPages, pagesOf } from '../../lib/pages';
import { reasonText, startChecking } from './checking';
import { addFiles, countsDone, getSession, removeFile, sheetTotals, startOver, updateSession } from './session';

// pdf.js does not run in the test browser, and nothing here should reach a server.
jest.mock('../../lib/pages', () => ({
  isSupported: (f: File) => /\.(pdf|jpe?g|png)$/i.test(f.name),
  countPages: jest.fn(),
  pagesOf: jest.fn(),
}));
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), del: jest.fn(), upload: jest.fn() },
}));

const mockCount = countPages as jest.Mock;
const mockPages = pagesOf as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockUpload = api.upload as jest.Mock;

const file = (name: string, size = 10, lastModified = 1, type = '') =>
  new File(['x'.repeat(size)], name, { type, lastModified });

const sheet = (source: string, page: number, status: 'ok' | 'error', needsReview = false): Sheet => ({
  id: `${source}-${page}`, batch_id: 'b1', source_name: source, page_no: page, status, error_reason: '',
  fields: {}, answers: {}, score: status === 'ok' ? 10 : null, needs_review: needsReview, review_reason: '',
  has_checked_image: status === 'ok', created_at: '',
});

const allCounted = () => countsDone(getSession().files.map(f => f.key));

// Lets the checking go on until it waits for a timer (pages, uploads and the server are all fakes).
const flush = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};

/** Every file has one page, the batch is made, and the finish call works. */
const onePagePerFile = () => {
  mockPages.mockImplementation(async function* fakePages(files: File[]) {
    yield { blob: new Blob(['jpg']), sourceName: files[0].name, pageNo: 1 };
  });
  mockPost.mockImplementation(async (url: string) => (url === '/api/batches' ? { id: 'b1' } : {}));
};

beforeEach(() => {
  updateSession({ testId: '', batchName: '', files: [], run: null, startError: '' });
});

test('adds files once, renames photos that share a name and skips what it cannot check', async () => {
  mockCount.mockResolvedValue(20);
  const first = addFiles([
    file('image.jpg', 5, 1), file('notes.docx'), file('.DS_Store'), file('class7.pdf', 50), file('photo.webp', 4, 1, 'image/webp'),
  ]);
  expect(first.added.map(f => f.file.name)).toEqual(['class7.pdf', 'image.jpg']);
  expect(first.skipped).toEqual(['notes.docx', 'photo.webp']);

  // The browser's type counts when the name does not say it: no extension, or a JPEG saved as .jfif.
  const second = addFiles([
    file('image.jpg', 5, 1), file('image.jpg', 6, 2), file('scan', 7, 3, 'image/jpeg'), file('photo.jfif', 8, 4, 'image/jpeg'),
  ]);
  expect(second.duplicates).toBe(1);
  expect(second.added.map(f => f.file.name)).toEqual(['image (2).jpg', 'photo.jfif.jpg', 'scan.jpg']);
  expect(second.skipped).toEqual([]);

  expect(sheetTotals(getSession().files).counting).toBe(true);
  await allCounted();
  expect(getSession().files.map(f => f.pages)).toEqual([20, 1, 1, 1, 1]);
  expect(sheetTotals(getSession().files)).toEqual({ counting: false, sheets: 24, unreadable: 0 });
});

test('a PDF that cannot be opened is marked and adds no sheets to the count', async () => {
  mockCount.mockImplementation(async (files: File[]) => {
    if (files[0].name === 'broken.pdf') throw new Error('Invalid PDF structure.');
    return 20;
  });
  addFiles([file('broken.pdf'), file('class7.pdf')]);
  await allCounted();
  expect(getSession().files[0]).toMatchObject({ pages: null, unreadable: true });
  expect(sheetTotals(getSession().files)).toEqual({ counting: false, sheets: 20, unreadable: 1 });
});

test('says in plain words why a request did not work', () => {
  const busy = 'the server had a problem. Try again in a minute';
  expect(reasonText(new TypeError('Failed to fetch'))).toBe('the internet connection was lost');
  // A gateway page instead of the server answer, during a restart: over HTTP/2 and HTTP/1.1.
  expect(reasonText(new ApiError(502, 'request failed (502)'))).toBe(busy);
  expect(reasonText(new ApiError(502, 'Bad Gateway'))).toBe(busy);
  expect(reasonText(new ApiError(503, 'Service Unavailable'))).toBe(busy);
  expect(reasonText(new ApiError(504, 'Gateway Time-out'))).toBe(busy);
  expect(reasonText(new ApiError(500, 'unexpected error: KeyError: q1'))).toBe(busy);
  expect(reasonText(new ApiError(404, 'NOT FOUND'))).toBe('the server did not answer');
  // Words the server wrote itself stay.
  const database = 'the database is starting up or unavailable, please try again in a minute';
  expect(reasonText(new ApiError(503, database))).toBe(database);
  expect(reasonText(new ApiError(400, 'empty file'))).toBe('empty file');
  expect(reasonText(new ApiError(401, 'Unauthorized'))).toBe('you are signed out. Reload the page to sign in again');
  expect(reasonText(new ApiError(413, 'Request Entity Too Large'))).toBe('the file is too big to send');
});

test('checks every page one at a time, counts the tiles, and always finishes the batch', async () => {
  const pagesIn: Record<string, number> = { 'a.pdf': 3, 'c.pdf': 2 };
  mockCount.mockImplementation(async (files: File[]) => {
    if (files[0].name === 'd.pdf') throw new Error('locked');
    return pagesIn[files[0].name];
  });
  mockPages.mockImplementation(async function* fakePages(files: File[]) {
    const f = files[0];
    if (f.name === 'd.pdf') {
      const locked = new Error('No password given');
      locked.name = 'PasswordException';
      throw locked;
    }
    const readable = f.name === 'a.pdf' ? 3 : 1; // c.pdf stops after its first page
    for (let pageNo = 1; pageNo <= readable; pageNo++) yield { blob: new Blob(['jpg']), sourceName: f.name, pageNo };
    if (f.name === 'c.pdf') throw new Error('bad page');
  });
  mockPost.mockImplementation(async (url: string) => (url === '/api/batches' ? { id: 'b1' } : {}));
  mockUpload.mockImplementation(async (url: string, form: FormData) => {
    const source = String(form.get('source_name'));
    const page = Number(form.get('page_no'));
    if (source === 'b.jpg') throw new ApiError(400, 'empty file');
    if (source === 'a.pdf' && page === 2) return [sheet(source, page, 'ok', true)];
    if (source === 'a.pdf' && page === 3) return [sheet(source, page, 'error')];
    return [sheet(source, page, 'ok')];
  });

  addFiles([file('d.pdf'), file('c.pdf'), file('b.jpg'), file('a.pdf')]);
  updateSession({ batchName: '  ZP School  ' });
  await startChecking('t1'); // pages are still being counted: checking waits for them

  expect(mockPost).toHaveBeenCalledWith('/api/batches', { test_id: 't1', name: 'ZP School' });
  expect(mockUpload).toHaveBeenCalledTimes(5);
  const firstForm = mockUpload.mock.calls[0][1] as FormData;
  expect(mockUpload.mock.calls[0][0]).toBe('/api/batches/b1/sheets');
  expect((firstForm.get('file') as File).name).toBe('a-p1.jpg');
  expect(firstForm.get('page_no')).toBe('1');

  const run = getSession().run!;
  expect(run).toMatchObject({ phase: 'finished', batchId: 'b1', total: 7, done: 7, fine: 2, check: 1, bad: 4, now: '' });
  expect(run.problems).toEqual([
    'Could not send b.jpg: empty file.',
    'Could not open c.pdf from page 2 on: the file may be damaged.',
    'Could not open d.pdf: it is locked with a password.',
  ]);
  expect(mockPost).toHaveBeenLastCalledWith('/api/batches/b1/finish');

  // While a run is shown, the list belongs to it.
  expect(addFiles([file('late.jpg')]).added).toEqual([]);
  removeFile(getSession().files[0].key);
  expect(getSession().files).toHaveLength(4);

  // "Check more sheets" keeps the test and clears the rest.
  startOver();
  expect(getSession()).toMatchObject({ testId: 't1', batchName: '', files: [], run: null, startError: '' });
});

test('while the device is offline it waits for the connection and loses no pages', async () => {
  jest.useFakeTimers();
  const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  try {
    onePagePerFile();
    // The "retry" field of each try, read as it is sent: every try sends the same form.
    const resends: Array<FormDataEntryValue | null> = [];
    mockUpload.mockImplementation(async (url: string, form: FormData) => {
      resends.push(form.get('retry'));
      if (!navigator.onLine) throw new TypeError('Failed to fetch');
      return [sheet(String(form.get('source_name')), 1, 'ok')];
    });
    addFiles([file('a.jpg')]);
    const done = startChecking('t1');
    await flush();
    expect(getSession().run).toMatchObject({ phase: 'checking', now: 'Waiting for the internet connection to come back…' });

    // Ten minutes without internet: it tries every half minute, and those tries are not counted.
    for (let seconds = 0; seconds < 600; seconds += 5) {
      jest.advanceTimersByTime(5000);
      await flush();
    }
    expect(mockUpload.mock.calls.length).toBeGreaterThan(10);
    expect(getSession().run).toMatchObject({ phase: 'checking', done: 0, bad: 0, problems: [] });

    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await done;
    expect(getSession().run).toMatchObject({ phase: 'finished', done: 1, fine: 1, bad: 0, problems: [] });
    // Every try after the first says the page is sent again, also the one that went through.
    expect(resends[0]).toBeNull();
    expect(new Set(resends.slice(1))).toEqual(new Set(['1']));
  } finally {
    onLine.mockRestore();
    jest.useRealTimers();
  }
});

test('a page sent again says so, and a page that never gets through is listed without "try again"', async () => {
  jest.useFakeTimers();
  try {
    onePagePerFile();
    // The "retry" field of each try, read as it is sent: every try of a page sends the same form.
    const resends: Record<string, Array<FormDataEntryValue | null>> = { 'a.jpg': [], 'b.jpg': [] };
    mockUpload.mockImplementation(async (url: string, form: FormData) => {
      const source = String(form.get('source_name'));
      resends[source].push(form.get('retry'));
      if (source === 'a.jpg' && resends[source].length === 1) throw new TypeError('Failed to fetch');
      if (source === 'a.jpg') throw new ApiError(502, 'Bad Gateway');
      throw new ApiError(503, 'the database is starting up or unavailable, please try again in a minute');
    });
    addFiles([file('a.jpg'), file('b.jpg')]);
    const done = startChecking('t1');
    // Four tries a page, 1.5, 3 and 4.5 seconds apart.
    for (let step = 0; step < 10; step++) {
      await flush();
      jest.advanceTimersByTime(5000);
    }
    await done;
    expect(resends).toEqual({ 'a.jpg': [null, '1', '1', '1'], 'b.jpg': [null, '1', '1', '1'] });
    expect(getSession().run).toMatchObject({ phase: 'finished', done: 2, bad: 2 });
    expect(getSession().run!.problems).toEqual([
      'Could not send a.jpg: the server had a problem.',
      'Could not send b.jpg: the database is starting up or unavailable.',
    ]);
  } finally {
    jest.useRealTimers();
  }
});

test('the finish call is tried again when it does not get through', async () => {
  jest.useFakeTimers();
  try {
    onePagePerFile();
    let finishCalls = 0;
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/api/batches') return { id: 'b1' };
      finishCalls += 1;
      if (finishCalls === 1) throw new TypeError('Failed to fetch');
      return {};
    });
    mockUpload.mockImplementation(async (url: string, form: FormData) => [sheet(String(form.get('source_name')), 1, 'ok')]);
    addFiles([file('a.jpg')]);
    const done = startChecking('t1');
    await flush();
    expect(getSession().run).toMatchObject({ phase: 'checking', done: 1, now: 'Finishing…' });

    jest.advanceTimersByTime(1500);
    await done;
    expect(finishCalls).toBe(2);
    expect(mockPost).toHaveBeenLastCalledWith('/api/batches/b1/finish');
    expect(getSession().run).toMatchObject({ phase: 'finished', done: 1, fine: 1, bad: 0, problems: [] });
  } finally {
    jest.useRealTimers();
  }
});

test('when the finish call never gets through, closing the tab still sends it', async () => {
  jest.useFakeTimers();
  // jsdom has no sendBeacon.
  const sendBeacon = jest.fn(() => true);
  Object.defineProperty(window.navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
  try {
    onePagePerFile();
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/api/batches') return { id: 'b1' };
      throw new ApiError(502, 'Bad Gateway');
    });
    mockUpload.mockImplementation(async (url: string, form: FormData) => [sheet(String(form.get('source_name')), 1, 'ok')]);
    addFiles([file('a.jpg')]);
    const done = startChecking('t1');
    for (let step = 0; step < 5; step++) {
      await flush();
      jest.advanceTimersByTime(5000);
    }
    await done;
    expect(mockPost.mock.calls.filter(([url]) => url === '/api/batches/b1/finish')).toHaveLength(4);
    expect(getSession().run).toMatchObject({ phase: 'finished', done: 1, fine: 1 });
    expect(sendBeacon).not.toHaveBeenCalled();

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    expect(sendBeacon).toHaveBeenCalledWith('/api/batches/b1/finish');
  } finally {
    delete (window.navigator as { sendBeacon?: unknown }).sendBeacon;
    jest.useRealTimers();
  }
});

test('the finish call waits for the connection like a page, and says so', async () => {
  jest.useFakeTimers();
  const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  try {
    onePagePerFile();
    let finishCalls = 0;
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/api/batches') return { id: 'b1' };
      finishCalls += 1;
      if (finishCalls === 1) {
        onLine.mockReturnValue(false); // the connection drops just as the last page comes back
        throw new TypeError('Failed to fetch');
      }
      return {};
    });
    mockUpload.mockImplementation(async (url: string, form: FormData) => [sheet(String(form.get('source_name')), 1, 'ok')]);
    addFiles([file('a.jpg')]);
    const done = startChecking('t1');
    await flush();
    jest.advanceTimersByTime(1500);
    await flush();
    expect(getSession().run).toMatchObject({ phase: 'checking', done: 1, now: 'Waiting for the internet connection to come back…' });

    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await done;
    expect(finishCalls).toBe(2);
    expect(getSession().run).toMatchObject({ phase: 'finished', done: 1, fine: 1, bad: 0, now: '', problems: [] });
  } finally {
    onLine.mockRestore();
    jest.useRealTimers();
  }
});

test('when the sign-in runs out, checking stops and says so once', async () => {
  onePagePerFile();
  mockUpload.mockImplementation(async (url: string, form: FormData) => {
    const source = String(form.get('source_name'));
    if (source === 'a.jpg') return [sheet(source, 1, 'ok')];
    throw new ApiError(401, 'you are signed out');
  });
  addFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')]);
  await allCounted();
  await startChecking('t1');

  // a.jpg is checked, b.jpg is refused, and c.jpg is not sent at all.
  expect(mockUpload).toHaveBeenCalledTimes(2);
  const run = getSession().run!;
  expect(run).toMatchObject({ phase: 'finished', total: 3, done: 3, fine: 1, check: 0, bad: 2, now: '' });
  expect(run.problems).toEqual([
    'Checking stopped: you are signed out. Reload the page to sign in again, then check the sheets that are not in the results.',
  ]);
});

test('when the batch cannot be made, it says why and sends nothing', async () => {
  mockPost.mockRejectedValue(new ApiError(400, 'this test has no answer key yet'));
  addFiles([file('a.jpg')]);
  await startChecking('t1');
  expect(getSession().run).toBeNull();
  expect(getSession().startError).toBe('Could not start checking: this test has no answer key yet.');
  expect(mockUpload).not.toHaveBeenCalled();
  expect(getSession().files).toHaveLength(1);
});

// Keep this test last: once a page goes through while the device says it is offline, the checking
// ignores that signal for as long as the page is open (here: the rest of this file).
test('a computer that wrongly says it is offline still sends its pages, waiting only once', async () => {
  jest.useFakeTimers();
  const onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  try {
    onePagePerFile();
    mockUpload.mockImplementation(async (url: string, form: FormData) => [sheet(String(form.get('source_name')), 1, 'ok')]);
    addFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')]);
    const done = startChecking('t1');
    await flush();
    expect(mockUpload).not.toHaveBeenCalled();

    jest.advanceTimersByTime(30000); // the longest it waits for the device to say it is online
    await done;
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(getSession().run).toMatchObject({ phase: 'finished', done: 3, fine: 3, bad: 0, problems: [] });
  } finally {
    onLine.mockRestore();
    jest.useRealTimers();
  }
});
