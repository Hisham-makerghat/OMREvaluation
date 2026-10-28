import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { api, ApiError, Me, Sheet, Test } from '../../lib/api';
import { countPages, pagesOf } from '../../lib/pages';
import EvaluatePage from '../../pages/EvaluatePage';
import { ToastProvider } from '../Toast';
import { getSession, updateSession } from './session';

jest.mock('../../lib/pages', () => ({
  isSupported: (f: File) => /\.(pdf|jpe?g|png)$/i.test(f.name),
  countPages: jest.fn(),
  pagesOf: jest.fn(),
}));
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), del: jest.fn(), upload: jest.fn() },
}));

const me: Me = {
  signed_in: true,
  user: { id: 'u1', email: 'teacher@example.org', name: 'Teacher', role: 'teacher', status: 'approved', created_at: '', approved_by: null },
  sheet: { question_count: 50, field_labels: [] },
};
const endline: Test = {
  id: 't1', name: 'Endline Oct 2026 · Class 7', question_count: 50, options: 'ABCD', marks_correct: 1, marks_incorrect: 0,
  marks_unmarked: 0, answer_key: { q1: 'A' }, created_by: 'teacher@example.org', created_at: '', archived: false,
};
const okSheet = (source: string, page: number, needsReview: boolean): Sheet => ({
  id: `${source}-${page}`, batch_id: 'b1', source_name: source, page_no: page, status: 'ok', error_reason: '', fields: {},
  answers: {}, score: 10, needs_review: needsReview, review_reason: '', has_checked_image: true, created_at: '',
});

// jsdom has no layout: give it the few browser calls the screen makes.
beforeAll(() => {
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  updateSession({ testId: '', batchName: '', files: [], run: null, startError: '' });
});

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={['/evaluate']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <EvaluatePage me={me} />
      </ToastProvider>
    </MemoryRouter>,
  );

const DONE_HINT = 'These sheets are checked. To check other sheets, press “Check more sheets” above.';

const pick = (container: HTMLElement, files: File[]) => {
  // The picker is a hidden <input type="file"> that a button opens, so there is no role or label to find it by.
  // eslint-disable-next-line testing-library/no-node-access
  const input = container.querySelector('input[type="file"][accept^=".pdf"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
};

/** Every file is one photo, the batch is made, and the finish call works. */
const onePagePerFile = () => {
  (pagesOf as jest.Mock).mockImplementation(async function* fakePages(files: File[]) {
    yield { blob: new Blob(['jpg']), sourceName: files[0].name, pageNo: 1 };
  });
  (api.post as jest.Mock).mockImplementation(async (url: string) => (url === '/api/batches' ? { id: 'b1' } : {}));
};

test('without answer keys it asks for one first', async () => {
  (api.get as jest.Mock).mockResolvedValue([]);
  renderScreen();
  expect(await screen.findByText('First, make an answer key')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Make an answer key' })).toHaveAttribute('href', '/tests?new=1');
});

test('picks files, checks them and shows the result', async () => {
  (api.get as jest.Mock).mockResolvedValue([endline]);
  (countPages as jest.Mock).mockResolvedValue(20);
  (pagesOf as jest.Mock).mockImplementation(async function* fakePages(files: File[]) {
    const pages = files[0].name.endsWith('.pdf') ? 20 : 1;
    for (let pageNo = 1; pageNo <= pages; pageNo++) yield { blob: new Blob(['jpg']), sourceName: files[0].name, pageNo };
  });
  (api.post as jest.Mock).mockImplementation(async (url: string) => (url === '/api/batches' ? { id: 'b1' } : {}));
  (api.upload as jest.Mock).mockImplementation(async (url: string, form: FormData) =>
    [okSheet(String(form.get('source_name')), Number(form.get('page_no')), form.get('page_no') === '3')]);

  const { container } = renderScreen();
  const select = await screen.findByLabelText('Which test?');
  expect(within(select).getByRole('option', { name: 'Endline Oct 2026 · Class 7 (50 questions)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check sheets' })).toBeDisabled();

  pick(container, [new File(['x'], 'notes.docx'), new File(['pdf'], 'class7.pdf'), new File(['jpg'], 'IMG_1.jpg')]);
  expect(screen.getByText('Skipped 1 file that is not PDF, JPG or PNG: notes.docx')).toBeInTheDocument();
  expect(await screen.findByText('20 pages')).toBeInTheDocument();
  expect(screen.getByText('1 photo')).toBeInTheDocument();
  expect(screen.getByText('2 files · 21 sheets')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove class7.pdf' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/Batch name/), { target: { value: 'ZP Mahalpatane, Grade 7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check 21 sheets' }));
  expect(screen.getByRole('progressbar', { name: 'Sheets checked' })).toBeInTheDocument();

  const finishedTitle = await screen.findByRole('heading', { name: 'Finished: 21 sheets checked' });
  // The pressed button is gone: keyboard focus goes to the card, which is now at the top of the screen.
  expect(finishedTitle).toHaveFocus();
  expect(finishedTitle.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText(DONE_HINT)).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/api/batches', { test_id: 't1', name: 'ZP Mahalpatane, Grade 7' });
  expect(api.post).toHaveBeenLastCalledWith('/api/batches/b1/finish');
  expect(screen.getByText('Finished. 21 sheets checked: 20 read fine, 1 to check, 0 could not read.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See results' })).toHaveAttribute('href', '/batches/b1');
  expect(screen.queryByRole('button', { name: 'Remove class7.pdf' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Which test?')).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Check more sheets' }));
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText('class7.pdf')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check sheets' })).toBeDisabled();
  expect(screen.getByLabelText(/Batch name/)).toHaveValue('');
  expect(screen.getByLabelText('Which test?')).toHaveValue('t1');
});

test('a PDF that cannot be opened is marked and left out of the sheet count', async () => {
  (api.get as jest.Mock).mockResolvedValue([endline]);
  (countPages as jest.Mock).mockRejectedValue(new Error('Invalid PDF structure.'));
  const { container } = renderScreen();
  await screen.findByLabelText('Which test?');

  pick(container, [new File(['pdf'], 'broken.pdf'), new File(['jpg'], 'IMG_1.jpg')]);
  expect(await screen.findByText('could not open')).toBeInTheDocument();
  expect(screen.getByText('2 files · 1 sheet · 1 file could not be opened')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check 1 sheet' })).toBeEnabled();

  // With only that PDF left there is nothing to check.
  fireEvent.click(screen.getByRole('button', { name: 'Remove IMG_1.jpg' }));
  expect(screen.getByText('1 file · 0 sheets · 1 file could not be opened')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check sheets' })).toBeDisabled();
});

test('coming back to a finished check shows its card first and leaves focus alone', async () => {
  (api.get as jest.Mock).mockResolvedValue([endline]);
  updateSession({
    testId: 't1',
    files: [{ key: 'k1', file: new File(['jpg'], 'IMG_1.jpg'), kind: 'photo', pages: 1, unreadable: false }],
    run: { phase: 'finished', batchId: 'b1', total: 1, done: 1, fine: 1, check: 0, bad: 0, now: '', problems: [] },
  });
  renderScreen();
  expect(screen.getByRole('heading', { name: 'Finished: 1 sheet checked' })).not.toHaveFocus();
  expect(screen.getByRole('link', { name: 'See results' })).toHaveAttribute('href', '/batches/b1');
  expect(await screen.findByText(DONE_HINT)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Choose PDF or photos' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Check 1 sheet' })).not.toBeInTheDocument();
});

test('the answer key shown stays chosen when a newer key is made meanwhile', async () => {
  const newer: Test = { ...endline, id: 't2', name: 'Baseline Nov 2026 · Class 7' };
  (api.get as jest.Mock).mockResolvedValue([endline]);
  onePagePerFile();
  (api.upload as jest.Mock).mockImplementation(async (url: string, form: FormData) =>
    [okSheet(String(form.get('source_name')), 1, false)]);

  const { container, unmount } = renderScreen();
  expect(await screen.findByLabelText('Which test?')).toHaveValue('t1');
  pick(container, [new File(['jpg'], 'IMG_1.jpg')]);
  // The teacher looks at another tab of the app, and someone makes a newer key meanwhile.
  unmount();
  (api.get as jest.Mock).mockResolvedValue([newer, endline]);

  renderScreen();
  expect(await screen.findByLabelText('Which test?')).toHaveValue('t1');
  fireEvent.click(screen.getByRole('button', { name: 'Check 1 sheet' }));
  expect(await screen.findByRole('heading', { name: 'Finished: 1 sheet checked' })).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/api/batches', { test_id: 't1', name: '' });
});

test('when the chosen answer key is gone, the key shown is the key used', async () => {
  (api.get as jest.Mock).mockResolvedValue([endline]);
  updateSession({ testId: 'archived-key' });
  renderScreen();
  expect(await screen.findByLabelText('Which test?')).toHaveValue('t1');
  expect(getSession().testId).toBe('t1');
});

test('says the first problem once, and lists the others without reading them out', async () => {
  (api.get as jest.Mock).mockResolvedValue([endline]);
  onePagePerFile();
  // IMG_1 fails at once; IMG_2 and IMG_3 wait for the test to answer for the server.
  const reply: Record<string, (works: boolean) => void> = {};
  (api.upload as jest.Mock).mockImplementation((url: string, form: FormData) => {
    const source = String(form.get('source_name'));
    if (source === 'IMG_1.jpg') return Promise.reject(new ApiError(400, 'empty file'));
    return new Promise((resolve, reject) => {
      reply[source] = works => (works ? resolve([okSheet(source, 1, false)]) : reject(new ApiError(400, 'empty file')));
    });
  });

  const { container } = renderScreen();
  await screen.findByLabelText('Which test?');
  pick(container, [new File(['jpg'], 'IMG_1.jpg'), new File(['jpg'], 'IMG_2.jpg'), new File(['jpg'], 'IMG_3.jpg')]);
  fireEvent.click(screen.getByRole('button', { name: 'Check 3 sheets' }));

  const said = 'Could not send IMG_1.jpg: empty file. Checking goes on.';
  expect(await screen.findByText(said)).toBeInTheDocument();
  expect(screen.getByText('Could not send IMG_1.jpg: empty file.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  await screen.findByText('Now: IMG_2.jpg');
  reply['IMG_2.jpg'](false);
  expect(await screen.findByText('Could not send IMG_2.jpg: empty file.')).toBeInTheDocument();
  // A new problem changes nothing that is read out.
  expect(screen.getByText(said)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  // What to do about these pages is said once checking is over.
  expect(screen.queryByText(/These pages are not in the results/)).not.toBeInTheDocument();

  await screen.findByText('Now: IMG_3.jpg');
  reply['IMG_3.jpg'](true);
  expect(await screen.findByRole('heading', { name: 'Finished: 3 sheets checked' })).toBeInTheDocument();
  expect(screen.getByText('Finished. 3 sheets checked: 1 read fine, 0 to check, 2 could not read.')).toBeInTheDocument();
  expect(screen.queryByText(said)).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText(
    'These pages are not in the results. To check them, press “Check more sheets”, then add those files again or take '
    + 'new photos of those sheets. They are checked as a new batch.',
  )).toBeInTheDocument();
});
