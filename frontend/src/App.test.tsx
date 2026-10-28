// The first screen a teacher sees when the tool cannot open: the reason must be in plain words.
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// pdf.js does not run in the test browser, and no page here reads a file.
jest.mock('./lib/pages', () => ({
  isSupported: () => true,
  countPages: jest.fn(),
  pagesOf: jest.fn(),
}));

/** A reply as fetch gives it, with only the parts lib/api.ts reads. */
const reply = (status: number, text: string, type: ResponseType = 'basic') => Promise.resolve({
  type, status, ok: status >= 200 && status < 300, statusText: '', text: () => Promise.resolve(text),
} as Response);

const answerMeWith = (answer: () => Promise<Response>) => {
  global.fetch = jest.fn(answer) as unknown as typeof fetch;
};

test('a lost connection is said in plain words, not in the browser’s', async () => {
  answerMeWith(() => Promise.reject(new TypeError('Failed to fetch')));
  render(<App />);
  expect(await screen.findByText('The internet connection was lost.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'The OMR Tool could not open' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
});

test.each([
  ['a gateway page while the server restarts', 502, '<html><body>Bad Gateway</body></html>'],
  ['the server’s own unexpected error', 500, JSON.stringify({ error: "unexpected error: KeyError: 'email'" })],
])('%s says the server had a problem', async (_, status, text) => {
  answerMeWith(() => reply(status, text));
  render(<App />);
  expect(await screen.findByText('The server had a problem. Try again in a minute.')).toBeInTheDocument();
  expect(screen.queryByText(/Bad Gateway|request failed|KeyError/)).not.toBeInTheDocument();
});

test('a sign-in that has run out goes to the sign-in page, which brings the teacher back to the same screen', async () => {
  const realLocation = window.location;
  // jsdom cannot leave the page, so the address the app goes to is kept instead.
  delete (window as { location?: Location }).location;
  window.location = { pathname: '/batches', search: '?test=t1', href: 'http://localhost/batches?test=t1' } as Location;
  try {
    // App Service answers an expired sign-in with a redirect to the Microsoft sign-in page; fetch does not follow it.
    answerMeWith(() => reply(0, '', 'opaqueredirect'));
    render(<App />);
    await waitFor(() => expect(window.location.href).toBe('/.auth/login/aad?post_login_redirect_uri=%2Fbatches%3Ftest%3Dt1'));
    expect(screen.queryByText('The OMR Tool could not open')).not.toBeInTheDocument();
  } finally {
    window.location = realLocation;
  }
});

test('the server’s own sentence starts with a capital and ends with a full stop', async () => {
  answerMeWith(() => reply(503, JSON.stringify({
    error: 'the database is starting up or unavailable, please try again in a minute',
  })));
  render(<App />);
  expect(await screen.findByText('The database is starting up or unavailable, please try again in a minute.'))
    .toBeInTheDocument();
});
