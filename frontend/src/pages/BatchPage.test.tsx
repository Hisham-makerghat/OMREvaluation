// The results of one batch on a phone, and the way back to the Results list, against a fake API.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';
import { api, ApiError, Batch, Me, Sheet, Test } from '../lib/api';
import BatchesPage from './BatchesPage';
import BatchPage from './BatchPage';

jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), del: jest.fn(), upload: jest.fn() },
}));

const me: Me = {
  signed_in: true,
  user: { id: 'u1', email: 'asha@example.org', name: 'Asha', role: 'teacher', status: 'approved', created_at: '', approved_by: null },
  sheet: { question_count: 25, field_labels: [] },
};

const answerKey: Record<string, string> = {};
for (let n = 1; n <= 25; n++) answerKey[`q${n}`] = 'A';
const endline: Test = {
  id: 't1', name: 'Endline Oct 2026 · Class 7', question_count: 25, options: 'ABCD', marks_correct: 1, marks_incorrect: 0,
  marks_unmarked: 0, answer_key: answerKey, created_by: 'asha@example.org', created_at: '', archived: false,
};

const batch = (id: string, name: string, extra: Partial<Batch> = {}): Batch => ({
  id, test_id: 't1', test_name: endline.name, name, created_by: 'asha@example.org', created_at: new Date().toISOString(),
  finished_at: null, status: 'finished', sheet_count: 9, read_count: 8, review_count: 0, error_count: 1,
  average_score: 20, max_score: 25, ...extra,
});
const batches: Batch[] = [
  // Python rounds 21.25 to 21.2; the batch page must say the same, not work it out again as 21.3.
  batch('b1', 'ZP Mahalpatane Grade 7', { review_count: 1, average_score: 21.2 }),
  batch('b2', 'ZP Kothur Grade 6'),
  batch('b3', 'ZP Mahalpatane Grade 6'),
];

const FILE = 'ZP Mahalpatane Grade 7.pdf';
const read = (page: number, name: string, roll: string, score: number, extra: Partial<Sheet> = {}): Sheet => ({
  id: `s${page}`, batch_id: 'b1', source_name: FILE, page_no: page, status: 'ok', error_reason: '',
  fields: { Name: name, 'Roll Number': roll }, answers: {}, score, needs_review: false, review_reason: '',
  has_checked_image: true, created_at: '', ...extra,
});
const sheets: Sheet[] = [
  read(1, 'ASHA PATIL', '2301', 20),
  read(2, 'RAHUL DESAI', '2302', 21, { needs_review: true, review_reason: 'name does not start in the first column' }),
  read(3, 'RAVI KUMAR', '2303', 22),
  read(4, 'DHANSHRI BHASKAR KUTE', '2304', 22),
  read(5, 'SWAMINI KUTE', '2305', 20),
  read(6, 'ARJUN NAIR', '2306', 21),
  read(7, 'PRIYA SHAH', '2307', 22),
  read(8, 'NEHA JOSHI', '2308', 22),
  // Could not be read, so no name or roll number either: the file and page are all that say which sheet it is.
  {
    id: 's12', batch_id: 'b1', source_name: FILE, page_no: 12, status: 'error', error_reason: 'corner targets not found',
    fields: {}, answers: {}, score: null, needs_review: false, review_reason: '', has_checked_image: false, created_at: '',
  },
];

/** When set, the batch's own requests fail with this error. */
let batchError: ApiError | null;

beforeAll(() => {
  // A phone: the list fills the page and a sheet opens full screen.
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  window.sessionStorage.clear();
  batchError = null;
  (api.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url === '/api/batches') return batches;
    if (url === '/api/tests/t1') return endline;
    // Where the questions sit on a sheet's picture: no answer yet, as on a slow connection.
    if (url.endsWith('/layout')) return new Promise(() => undefined);
    const one = /^\/api\/batches\/(\w+)(\/sheets)?$/.exec(url);
    if (one) {
      if (batchError) throw batchError;
      const found = batches.find(b => b.id === one[1]);
      if (!found) throw new ApiError(404, 'not found');
      return one[2] ? sheets.map(s => ({ ...s, batch_id: found.id })) : found;
    }
    throw new ApiError(404, 'not found');
  });
});

afterEach(() => jest.restoreAllMocks());

function Address() {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{pathname + search}</p>;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        {/* Stands in for "See results" after checking sheets: a batch page reached without the list. */}
        <Link to="/batches/b1">See results</Link>
        <Routes>
          <Route path="/batches" element={<BatchesPage me={me} />} />
          <Route path="/batches/:id" element={<BatchPage me={me} />} />
        </Routes>
        <Address />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const listSearch = () => screen.findByRole('searchbox', { name: 'Search results' });
const allResults = () => screen.findByRole('link', { name: 'All results' });
const batchTitle = (name: string) => screen.findByRole('heading', { level: 1, name });

test('"All results" brings back the search and the chip the list was left with', async () => {
  renderApp('/batches');
  fireEvent.change(await listSearch(), { target: { value: 'Mahal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Has sheets to check' }));
  fireEvent.click(screen.getByRole('link', { name: /ZP Mahalpatane Grade 7/ }));
  await batchTitle('ZP Mahalpatane Grade 7');

  fireEvent.click(await allResults());
  expect(await listSearch()).toHaveValue('Mahal');
  expect(screen.getByRole('button', { name: 'Has sheets to check' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('address')).toHaveTextContent('/batches?q=Mahal&show=check');
});

test('a batch reached another way goes back to the whole list, not to an earlier search', async () => {
  renderApp('/batches');
  fireEvent.change(await listSearch(), { target: { value: 'Mahal' } });
  fireEvent.click(screen.getByRole('link', { name: /ZP Mahalpatane Grade 6/ }));
  await batchTitle('ZP Mahalpatane Grade 6');
  expect(await allResults()).toHaveAttribute('href', '/batches?q=Mahal');

  fireEvent.click(screen.getByRole('link', { name: 'See results' }));
  await batchTitle('ZP Mahalpatane Grade 7');
  expect(await allResults()).toHaveAttribute('href', '/batches');
});

test('with the browser\'s storage turned off, "All results" still works and shows the whole list', async () => {
  const blocked = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
  renderApp('/batches');
  fireEvent.change(await listSearch(), { target: { value: 'Mahal' } });
  fireEvent.click(screen.getByRole('link', { name: /ZP Mahalpatane Grade 7/ }));
  await batchTitle('ZP Mahalpatane Grade 7');

  fireEvent.click(await allResults());
  expect(await listSearch()).toHaveValue('');
  expect(screen.getByTestId('address')).toHaveTextContent(/^\/batches$/);
});

test('the average is the server\'s, so it reads the same as on the Results list', async () => {
  renderApp('/batches/b1');
  await batchTitle('ZP Mahalpatane Grade 7');
  expect(screen.getByText(/· 9 sheets · average 21\.2 of 25 · checked by you$/)).toBeInTheDocument();
});

test('a turned-off account is told so, with a way to reload, not to check the internet', async () => {
  batchError = new ApiError(403, 'your account is disabled');
  renderApp('/batches/b1');
  expect(await screen.findByText('Your account is disabled.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(screen.queryByText(/internet/)).not.toBeInTheDocument();
});

test('a problem on the server says so, and trying again loads the results', async () => {
  batchError = new ApiError(500, 'unexpected error');
  renderApp('/batches/b1');
  expect(await screen.findByText('The server had a problem. Try again in a minute.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload page' })).not.toBeInTheDocument();

  batchError = null;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await batchTitle('ZP Mahalpatane Grade 7');
});

test('signed out, or refused with no words of the app\'s own: plain words and a way to reload', async () => {
  batchError = new ApiError(401, 'you are signed out');
  const { unmount } = renderApp('/batches/b1');
  expect(await screen.findByText('You have been signed out. Reload the page to sign in again.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  unmount();

  // Refused by something in front of the app (only a code, no words): not "Request failed (403)."
  batchError = new ApiError(403, 'request failed (403)');
  renderApp('/batches/b1');
  expect(await screen.findByText('You cannot see these results right now.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
});

test('deleting with a turned-off account says so, not that someone else checked the sheets', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  (api.del as jest.Mock).mockRejectedValueOnce(new ApiError(403, 'your account is disabled'));
  renderApp('/batches/b1');
  fireEvent.click(await screen.findByRole('button', { name: 'Delete this batch' }));
  expect(await screen.findByText('The batch could not be deleted. Your account is disabled.')).toBeInTheDocument();
  expect(screen.queryByText(/Only the person who checked/)).not.toBeInTheDocument();

  // A problem on the server is not blamed on the internet connection either.
  fireEvent.click(screen.getByRole('button', { name: 'Close this message' }));
  (api.del as jest.Mock).mockRejectedValueOnce(new ApiError(500, 'unexpected error'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete this batch' }));
  expect(await screen.findByText('The batch could not be deleted. The server had a problem. Try again in a minute.'))
    .toBeInTheDocument();
});

test('screen readers hear how many sheets the search and the chips leave', async () => {
  renderApp('/batches/b1');
  const search = await screen.findByRole('searchbox', { name: 'Find a student by name or roll number' });
  // In place from the start, so nothing is read out when the list first appears.
  const count = screen.getByText('Showing all 9 sheets.');
  expect(count).toHaveAttribute('role', 'status');

  fireEvent.change(search, { target: { value: 'ravi' } });
  await waitFor(() => expect(count).toHaveTextContent('Showing 1 of 9 sheets.'), { timeout: 2000 });

  fireEvent.change(search, { target: { value: 'ravl' } });
  await waitFor(() => expect(count).toHaveTextContent('No student matches “ravl”.'), { timeout: 2000 });

  fireEvent.click(screen.getByRole('button', { name: 'Clear the search' }));
  fireEvent.click(screen.getByRole('button', { name: 'To check 1' }));
  await waitFor(() => expect(count).toHaveTextContent('Showing 1 of 9 sheets.'), { timeout: 2000 });
});

test('a sheet with no name shows its file and page in full, in the list and full screen', async () => {
  renderApp('/batches/b1');
  await batchTitle('ZP Mahalpatane Grade 7');
  // The file name wraps, so its end (the page to scan again) is never cut off. A long name is cut short.
  expect(screen.getByText(`${FILE}, page 12`)).not.toHaveClass('truncate');
  expect(screen.getByText('Dhanshri Bhaskar Kute')).toHaveClass('truncate');

  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${FILE}, page 12`) }));
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByText(`Sheet 1 of 9 · ${FILE}, page 12`)).toBeInTheDocument();

  // A sheet with a name keeps the file out of that line: it is under the picture.
  fireEvent.click(within(sheet).getByRole('button', { name: /^Next: Rahul Desai/ }));
  expect(await within(sheet).findByText('Sheet 2 of 9 · roll 2302')).toBeInTheDocument();
});

test('full screen, the notice stays above the sheet, or scrolls with it on a short screen: one copy at a time', async () => {
  renderApp('/batches/b1');
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${FILE}, page 12`) }));
  const sheet = await screen.findByRole('dialog');
  // jsdom applies no CSS, so check the classes that choose the copy shown. The other one is display:
  // none, which also keeps screen readers from reading the notice twice.
  const copies = within(sheet).getAllByText(/Scan the sheet again, flat/);
  expect(copies).toHaveLength(2);
  const [pinned, scrolling] = copies;
  // The nearest element around a copy that matches the selector.
  // eslint-disable-next-line testing-library/no-node-access
  const around = (el: HTMLElement, selector: string) => el.closest(selector);
  expect(around(pinned, '[data-scroll-area]')).toBeNull();
  expect(around(pinned, '[class~="[@media(max-height:500px)]:hidden"]')).not.toBeNull();
  expect(around(scrolling, '[data-scroll-area]')).not.toBeNull();
  expect(around(scrolling, '[class~="hidden"]')).toHaveClass('[@media(max-height:500px)]:block');
});
