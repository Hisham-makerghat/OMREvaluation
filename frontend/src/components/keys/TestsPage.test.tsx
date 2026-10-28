// The Answer keys screen end to end, against a small fake of the JSON API.
// The top-level copy is the one user-event uses; see the act() note in beforeAll.
// eslint-disable-next-line testing-library/no-dom-import
import { configure } from '@testing-library/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, StrictMode } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Batch, Me, Test } from '../../lib/api';
import TestsPage from '../../pages/TestsPage';
import { ToastProvider } from '../Toast';

const me: Me = {
  signed_in: true,
  user: { id: 'u1', email: 'asha@example.org', name: 'Asha', role: 'teacher', status: 'approved', created_at: '2026-10-01T00:00:00Z', approved_by: null },
  sheet: { question_count: 50, field_labels: [] },
};

const ENDLINE = 'Endline Oct 2026 · Class 7';
const BASELINE = 'Baseline Jun 2026 · Class 7';
const LEAVE = 'Leave without saving? Your changes to this answer key will be lost.';

let tests: Test[];
// Newest first, like the server. GET /api/batches sends the first 200.
let batches: Partial<Batch>[];
let calls: { method: string; url: string; body?: any }[];
let failNext: { method: string; status: number; error: string } | null;
// While true, the list of keys cannot be loaded (StrictMode asks twice, so a one-off failure is not enough).
let offline: boolean;
// While true, saving and archiving wait until release() is called.
let holdWrites: boolean;
let release: () => void;

const reply = (status: number, body?: unknown) => Promise.resolve({
  status, ok: status >= 200 && status < 300, statusText: '',
  text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
} as Response);

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn(); // not in jsdom
  // user-event 13 fires its events through the top-level @testing-library/dom, while
  // @testing-library/react 13 wraps only its own nested copy in act(). Wrap this one too, so a
  // click is fully handled before the next line looks at the screen, as in a browser.
  configure({
    eventWrapper: cb => {
      let result: unknown;
      act(() => { result = cb(); });
      return result;
    },
  });
});

beforeEach(() => {
  tests = [
    { id: 't1', name: ENDLINE, question_count: 5, options: 'ABCDE', marks_correct: 1, marks_incorrect: 0, marks_unmarked: 0,
      answer_key: { q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'E' }, created_by: 'asha@example.org', created_at: '2026-10-01T09:00:00Z', archived: false },
    { id: 't2', name: BASELINE, question_count: 50, options: 'ABCD', marks_correct: 1, marks_incorrect: 0, marks_unmarked: 0,
      answer_key: { q1: 'A' }, created_by: 'ravi@example.org', created_at: '2026-06-15T09:00:00Z', archived: false },
  ];
  batches = [{ id: 'b1', test_id: 't1' }, { id: 'b2', test_id: 't1' }];
  calls = [];
  failNext = null;
  offline = false;
  holdWrites = false;
  release = () => undefined;
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const answer = () => {
      if (failNext && failNext.method === method) {
        const { status, error } = failNext;
        failNext = null;
        return reply(status, { error });
      }
      if (method === 'GET' && url === '/api/tests') {
        return offline ? Promise.reject(new TypeError('Failed to fetch')) : reply(200, tests.filter(t => !t.archived));
      }
      if (method === 'GET' && url === '/api/batches') return reply(200, batches.slice(0, 200));
      const forKey = /^\/api\/batches\?test_id=(\w+)$/.exec(url);
      if (method === 'GET' && forKey) return reply(200, batches.filter(b => b.test_id === forKey[1]).slice(0, 200));
      if (method === 'POST' && url === '/api/tests') {
        const created = { ...body, id: 'new1', created_by: me.user.email, created_at: new Date().toISOString(), archived: false };
        tests = [created, ...tests];
        return reply(201, created);
      }
      const match = /^\/api\/tests\/(\w+)$/.exec(url);
      if (method === 'PUT' && match) {
        const i = tests.findIndex(t => t.id === match[1]);
        tests[i] = { ...tests[i], ...body };
        return reply(200, tests[i]);
      }
      return reply(404, { error: 'not found' });
    };
    if (holdWrites && method !== 'GET') return new Promise<Response>(resolve => { release = () => resolve(answer()); });
    return answer();
  }) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

function Address() {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{pathname + search}</p>;
}

function renderPage(path = '/tests') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          {/* Stands in for the tabs of the app shell. */}
          <Link to="/evaluate">Check</Link>
          <Routes>
            <Route path="/tests" element={<><TestsPage me={me} /><Address /></>} />
            <Route path="/evaluate" element={<p>Check sheets page</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

const card = (name: string) => screen.getByRole('button', { name: `Edit ${name}` });
const writes = () => calls.filter(c => c.method !== 'GET');
/** Waits, inside act(), for every request on its way to finish: a save, then the list reloading after it.
 *  Called straight after the click that sends them, so no update lands outside act(). */
const settle = () => act(() => new Promise<void>(resolve => { setTimeout(resolve, 0); }));

test('lists every key with how many batches used it and who made it', async () => {
  renderPage();
  expect(await screen.findByText(/^5 questions · used by 2 batches · made by you on 1 Oct/)).toBeInTheDocument();
  expect(screen.getByText(/^50 questions · not used yet · made by Ravi on 15 Jun/)).toBeInTheDocument();
  expect(card(ENDLINE)).toHaveTextContent('Edit');
});

test('with more batches than the server lists, a count that may be short says so', async () => {
  // The server lists the newest 200 batches. The October key is newer than all of them, so its
  // count is complete; the June key is older, and two of its batches are past the end of the list.
  const day = (month: number, d: number) => `2026-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T09:00:00Z`;
  batches = [
    ...Array.from({ length: 197 }, (_, i) => ({ id: `n${i}`, test_id: 't1', created_at: day(10, 28 - (i % 26)) })),
    ...[3, 2, 1].map(d => ({ id: `s${d}`, test_id: 't2', created_at: day(9, d) })),
    ...[21, 20].map(d => ({ id: `j${d}`, test_id: 't2', created_at: day(6, d) })),
  ];
  renderPage();
  expect(await screen.findByText(/^5 questions · used by 197 batches · made by you/)).toBeInTheDocument();
  expect(screen.getByText(/^50 questions · used by 3 or more batches · made by Ravi/)).toBeInTheDocument();

  // Its editor asks for the key's own count.
  userEvent.click(card(BASELINE));
  expect(await screen.findByText(/^Used by 5 batches\. Sheets already checked keep their marks/)).toBeInTheDocument();
  expect(calls).toContainEqual({ method: 'GET', url: '/api/batches?test_id=t2', body: undefined });
});

test('a key that was used says what changing it does to past results', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  expect(screen.getByText('Used by 2 batches. Sheets already checked keep their marks, but their results will show '
    + 'right and wrong against the new answers. For a different test, make a new key instead.')).toBeInTheDocument();
  // The page's count is complete, so the editor does not ask again.
  expect(calls.some(c => c.url.startsWith('/api/batches?'))).toBe(false);
});

test('with no keys, says so and offers a new one', async () => {
  tests = [];
  renderPage();
  expect(await screen.findByText('No answer keys yet')).toBeInTheDocument();
  expect(screen.getByText('Make one to start checking sheets.')).toBeInTheDocument();
  userEvent.click(screen.getAllByRole('button', { name: 'New key' })[1]);
  expect(screen.getByRole('heading', { name: 'New answer key' })).toBeInTheDocument();
  expect(screen.queryByText('No answer keys yet')).not.toBeInTheDocument();
});

test('Save explains what is missing instead of saving', async () => {
  renderPage();
  await screen.findByText(/used by 2 batches/);
  userEvent.click(screen.getByRole('button', { name: 'New key' }));
  expect(screen.getByRole('heading', { name: 'New answer key' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New key' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Test name')).toHaveFocus();
  expect(screen.getByText('0 of 50 set')).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  // The missing answers are explained right above the questions, the name next to the buttons.
  const [missingAlert, nameAlert] = screen.getAllByRole('alert');
  expect(missingAlert).toHaveTextContent('50 questions have no answer yet: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 …');
  expect(missingAlert.compareDocumentPosition(screen.getByRole('button', { name: 'Question 1: A' })))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(nameAlert).toHaveTextContent('Give the test a name.');
  expect(nameAlert).not.toHaveTextContent('no answer yet');
  expect(screen.getByLabelText('Test name')).toHaveFocus();
  expect(screen.getByLabelText('Test name')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('group', { name: 'Question 1, no answer yet' })).toBeInTheDocument();
  expect(writes()).toHaveLength(0);

  // The name message goes as soon as there is a name; the answers one keeps up until they are all set.
  userEvent.type(screen.getByLabelText('Test name'), 'Baseline');
  expect(screen.getByRole('alert')).not.toHaveTextContent('Give the test a name.');
  expect(screen.getByRole('alert')).toHaveTextContent('50 questions have no answer yet');
  userEvent.click(screen.getByRole('button', { name: 'Question 1: A' }));
  userEvent.click(screen.getByRole('button', { name: 'Question 3: B' }));
  expect(screen.getByRole('alert')).toHaveTextContent('48 questions have no answer yet: 2, 4, 5, 6, 7, 8, 9, 10, 11, 12 …');
});

test('typing all the answers fills the grid, and Save stores the key', async () => {
  renderPage();
  await screen.findByText(/used by 2 batches/);
  userEvent.click(screen.getByRole('button', { name: 'New key' }));
  userEvent.type(screen.getByLabelText('Test name'), 'Midline Aug 2026');
  userEvent.type(screen.getByLabelText('Or type all the answers in order'), '1.a 2.b, cde '.repeat(10));
  userEvent.click(screen.getByRole('button', { name: 'Fill' }));
  expect(await screen.findByText('Filled 50 answers')).toBeInTheDocument();
  expect(screen.getByText('50 of 50 set')).toHaveClass('tone-fine');
  expect(screen.getByRole('button', { name: 'Question 7: B' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Or type all the answers in order')).toHaveValue('');

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await settle();
  expect(screen.getByText('Answer key saved')).toBeInTheDocument();
  const post = writes()[0];
  expect(post).toMatchObject({ method: 'POST', url: '/api/tests' });
  expect(post.body).toMatchObject({ name: 'Midline Aug 2026', question_count: 50, options: 'ABCDE', marks_correct: 1, marks_incorrect: 0, marks_unmarked: 0 });
  expect(Object.keys(post.body.answer_key)).toHaveLength(50);
  expect(post.body.answer_key.q7).toBe('B');
  expect(card('Midline Aug 2026')).toHaveFocus();
  expect(screen.queryByRole('heading', { name: 'New answer key' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New key' })).toBeInTheDocument();
});

test('quick fill refuses letters that are not answer choices', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${BASELINE}` }));
  userEvent.type(screen.getByLabelText('Or type all the answers in order'), 'ABCE{enter}');
  expect(screen.getByText('“E” is not an answer choice. Use only the letters A to D.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Question 2: B' })).toHaveAttribute('aria-pressed', 'false');
  // The note has no close button (too small to tap); it goes once the box is emptied.
  expect(screen.queryByRole('button', { name: 'Close this message' })).not.toBeInTheDocument();
  userEvent.clear(screen.getByLabelText('Or type all the answers in order'));
  expect(screen.queryByText(/is not an answer choice/)).not.toBeInTheDocument();
});

test('letters typed for a quick fill count as changes, and Save uses them', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  userEvent.type(screen.getByLabelText('Or type all the answers in order'), 'edcba');
  confirm.mockReturnValueOnce(false);
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(confirm).toHaveBeenCalledWith(LEAVE);
  expect(screen.getByRole('heading', { name: ENDLINE })).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await settle();
  expect(screen.getByText('Answer key saved')).toBeInTheDocument();
  expect(writes()[0].body.answer_key).toEqual({ q1: 'E', q2: 'D', q3: 'C', q4: 'B', q5: 'A' });
});

test('Save stops at typed letters that are not answer choices', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${BASELINE}` }));
  const fill = screen.getByLabelText('Or type all the answers in order');
  userEvent.type(fill, 'ABE');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('“E” is not an answer choice. Use only the letters A to D.')).toBeInTheDocument();
  expect(fill).toHaveFocus();
  expect(fill).toHaveAccessibleDescription(/“E” is not an answer choice/);
  expect(writes()).toHaveLength(0);
});

test('a tap chooses a letter and a second tap clears it', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  expect(screen.getByRole('heading', { name: ENDLINE })).toHaveFocus();
  expect(screen.getByText('5 of 5 set')).toBeInTheDocument();
  const b = screen.getByRole('button', { name: 'Question 2: B' });
  expect(b).toHaveAttribute('aria-pressed', 'true');
  userEvent.click(b);
  expect(b).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByText('4 of 5 set')).toHaveClass('tone-check');
  userEvent.click(screen.getByRole('button', { name: 'Question 2: D' }));
  expect(within(screen.getByRole('group', { name: 'Question 2' })).getByRole('button', { name: 'Question 2: D' }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('unsaved changes are never dropped without asking', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));

  // No changes: other keys and Cancel need no question.
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(card(ENDLINE)).toHaveFocus();

  userEvent.click(card(ENDLINE));
  userEvent.click(screen.getByRole('button', { name: 'Question 1: C' }));
  confirm.mockReturnValueOnce(false);
  userEvent.click(card(BASELINE));
  expect(confirm).toHaveBeenLastCalledWith(LEAVE);
  expect(screen.getByRole('heading', { name: ENDLINE })).toBeInTheDocument();

  confirm.mockReturnValueOnce(false);
  userEvent.click(screen.getByRole('button', { name: 'New key' }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('heading', { name: 'New answer key' })).not.toBeInTheDocument();

  confirm.mockReturnValueOnce(true);
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(confirm).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole('heading', { name: ENDLINE })).not.toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});

test('moving to another screen with unsaved changes asks first', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  userEvent.click(screen.getByRole('button', { name: 'Question 1: C' }));

  confirm.mockReturnValueOnce(false);
  userEvent.click(screen.getByRole('link', { name: 'Check' }));
  expect(confirm).toHaveBeenCalledWith(LEAVE);
  expect(screen.getByRole('button', { name: 'Question 1: C' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('address')).toHaveTextContent(/^\/tests$/);

  confirm.mockReturnValueOnce(true);
  userEvent.click(screen.getByRole('link', { name: 'Check' }));
  expect(await screen.findByText('Check sheets page')).toBeInTheDocument();
  expect(confirm).toHaveBeenCalledTimes(2);
});

test('with no changes, moving to another screen does not ask', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  userEvent.click(screen.getByRole('link', { name: 'Check' }));
  expect(await screen.findByText('Check sheets page')).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
});

test('while a key is being saved, the other keys wait for it', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  holdWrites = true;
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  userEvent.click(screen.getByRole('button', { name: 'Question 1: C' }));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

  userEvent.click(card(BASELINE));
  userEvent.click(screen.getByRole('button', { name: 'New key' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: ENDLINE })).toBeInTheDocument();

  release();
  await settle();
  expect(screen.getByText('Answer key saved')).toBeInTheDocument();
  expect(card(ENDLINE)).toHaveFocus();
  expect(screen.queryByRole('heading', { name: BASELINE })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'New answer key' })).not.toBeInTheDocument();
});

test('fewer questions drops the answers past them, and only those questions are sent', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  const questions = screen.getByLabelText('Questions');
  userEvent.clear(questions);
  userEvent.type(questions, '3');
  userEvent.tab();
  expect(screen.getByText('3 of 3 set')).toBeInTheDocument();
  userEvent.clear(questions);
  userEvent.type(questions, '5');
  userEvent.tab();
  expect(screen.getByText('3 of 5 set')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Question 5: E' })).toHaveAttribute('aria-pressed', 'false');

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('2 questions have no answer yet: 4, 5. If the test has only 3 questions, change “Questions” to 3.');
  // The sentence is brought into view, and the keyboard goes to the first question with no answer.
  const scrolled = (Element.prototype.scrollIntoView as jest.Mock).mock.instances;
  expect(scrolled[scrolled.length - 1]).toContainElement(alert);
  expect(screen.getByRole('button', { name: 'Question 4: A' })).toHaveFocus();

  userEvent.clear(questions);
  userEvent.type(questions, '3');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await settle();
  expect(screen.getByText('Answer key saved')).toBeInTheDocument();
  expect(writes()[0]).toMatchObject({ method: 'PUT', url: '/api/tests/t1' });
  expect(writes()[0].body).toMatchObject({ question_count: 3, answer_key: { q1: 'A', q2: 'B', q3: 'C' } });
  expect(Object.keys(writes()[0].body.answer_key)).toEqual(['q1', 'q2', 'q3']);
});

test('typing a count passes through smaller numbers without losing answers', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${BASELINE}` }));
  userEvent.type(screen.getByLabelText('Or type all the answers in order'), 'ABCD'.repeat(10));
  userEvent.click(screen.getByRole('button', { name: 'Fill' }));
  const questions = screen.getByLabelText('Questions');
  userEvent.clear(questions);
  userEvent.type(questions, '40'); // passes through "4"
  userEvent.tab();
  expect(screen.getByText('40 of 40 set')).toBeInTheDocument();
});

test('new answer choices clear the letters they no longer allow', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  userEvent.selectOptions(screen.getByLabelText('Answer choices'), 'ABCD');
  expect(screen.getByText('Question 5 is now blank: its answer is not in A to D.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Question 5: E' })).not.toBeInTheDocument();
  expect(screen.getByText('4 of 5 set')).toBeInTheDocument();
  // The note goes by itself once question 5 has an answer again.
  expect(screen.queryByRole('button', { name: 'Close this message' })).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Question 5: D' }));
  expect(screen.queryByText(/Question 5 is now blank/)).not.toBeInTheDocument();
});

test('changing the answer choices back brings back the answers they took away', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  // An arrow key on the closed select (or a slip of the mouse) picks the other choices, then back again.
  const choices = screen.getByLabelText('Answer choices');
  userEvent.selectOptions(choices, 'ABCD');
  expect(screen.getByText('4 of 5 set')).toBeInTheDocument();
  userEvent.selectOptions(choices, 'ABCDE');
  expect(screen.getByText('5 of 5 set')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Question 5: E' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText(/is now blank/)).not.toBeInTheDocument();
  // The key is as it was, so closing it has nothing to ask about.
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
});

test('an answer given meanwhile stays when the answer choices change back', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  const choices = screen.getByLabelText('Answer choices');
  userEvent.selectOptions(choices, 'ABCD');
  userEvent.click(screen.getByRole('button', { name: 'Question 5: D' }));
  userEvent.selectOptions(choices, 'ABCDE');
  expect(screen.getByRole('button', { name: 'Question 5: D' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Question 5: E' })).toHaveAttribute('aria-pressed', 'false');
  // Clearing it now is the teacher's own doing: no note blames the answer choices for it.
  userEvent.click(screen.getByRole('button', { name: 'Question 5: D' }));
  expect(screen.getByText('4 of 5 set')).toBeInTheDocument();
  expect(screen.queryByText(/is now blank/)).not.toBeInTheDocument();
});

test('an answer dropped with fewer questions stays dropped when the answer choices change back', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  const choices = screen.getByLabelText('Answer choices');
  userEvent.selectOptions(choices, 'ABCD');
  expect(screen.getByText('Question 5 is now blank: its answer is not in A to D.')).toBeInTheDocument();
  const questions = screen.getByLabelText('Questions');
  userEvent.clear(questions);
  userEvent.type(questions, '4');
  userEvent.tab();
  userEvent.clear(questions);
  userEvent.type(questions, '5');
  userEvent.tab();
  // Question 5 went with the count, so it is back as a new, empty question: no note blames the answer choices.
  expect(screen.getByText('4 of 5 set')).toBeInTheDocument();
  expect(screen.queryByText(/is now blank/)).not.toBeInTheDocument();
  // And changing back does not bring its old answer back.
  userEvent.selectOptions(choices, 'ABCDE');
  expect(screen.getByText('4 of 5 set')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Question 5: E' })).toHaveAttribute('aria-pressed', 'false');
});

test('marks must be numbers, and a minus number is fine', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  const wrong = screen.getByLabelText('Marks if wrong');
  userEvent.clear(wrong);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Write a number in “Marks if wrong”, for example 0 or -0.25.');
  expect(wrong).toHaveFocus();
  fireEvent.change(wrong, { target: { value: '-0.25' } });
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await settle();
  expect(screen.getByText('Answer key saved')).toBeInTheDocument();
  expect(writes()[0].body.marks_incorrect).toBe(-0.25);
});

test('a problem on the server is shown inside the editor, which stays open', async () => {
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  failNext = { method: 'PUT', status: 503, error: 'the database is starting up or unavailable, please try again in a minute' };
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not save the answer key. The server is starting up. Try again in a minute.');
  expect(screen.getByRole('heading', { name: ENDLINE })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('archiving asks first, then the key leaves the list', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  renderPage();
  userEvent.click(await screen.findByRole('button', { name: `Edit ${ENDLINE}` }));
  userEvent.click(screen.getByRole('button', { name: 'Archive this key' }));
  expect(confirm).toHaveBeenCalledWith(`Archive “${ENDLINE}”? It will no longer be offered for checking. Past results are kept.`);
  await settle();
  expect(screen.getByText('Answer key archived')).toBeInTheDocument();
  expect(writes()).toEqual([{ method: 'PUT', url: '/api/tests/t1', body: { archived: true } }]);
  expect(screen.queryByRole('button', { name: `Edit ${ENDLINE}` })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New key' })).toHaveFocus();
});

test('a new key has no Archive button', async () => {
  renderPage();
  await screen.findByText(/used by 2 batches/);
  userEvent.click(screen.getByRole('button', { name: 'New key' }));
  expect(screen.queryByRole('button', { name: 'Archive this key' })).not.toBeInTheDocument();
});

test('?new=1 opens a new key straight away and leaves a clean address', async () => {
  renderPage('/tests?new=1');
  await settle();
  expect(screen.getByTestId('address').textContent).toBe('/tests');
  expect(screen.getAllByRole('heading', { name: 'New answer key' })).toHaveLength(1);
});

test('when the keys cannot be loaded, says so and can try again', async () => {
  offline = true;
  renderPage();
  expect(await screen.findByText('Could not load the answer keys. Check your internet connection and try again.')).toBeInTheDocument();
  offline = false;
  userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  // The message and its button go away; the keyboard stays on the page, at its heading.
  expect(screen.getByRole('heading', { name: 'Answer keys' })).toHaveFocus();
  expect(await screen.findByRole('button', { name: `Edit ${ENDLINE}` })).toBeInTheDocument();
  expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
});
