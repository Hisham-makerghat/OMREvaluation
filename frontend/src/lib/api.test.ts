// The small fetch wrapper: what every request sends, and how a reply becomes data or an ApiError.
import { api, ApiError } from './api';

/** A reply as fetch gives it, with only the parts lib/api.ts reads. */
const reply = (status: number, body: string, type: ResponseType = 'basic') => ({
  type, status, ok: status >= 200 && status < 300, statusText: '', text: jest.fn(() => Promise.resolve(body)),
}) as unknown as Response;

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const AJAX = { 'X-Requested-With': 'XMLHttpRequest' };

test('a JSON reply is read, and the request does not follow redirects', async () => {
  fetchMock.mockResolvedValue(reply(200, '{"id":"t1","name":"Endline"}'));
  await expect(api.get('/api/tests/t1')).resolves.toEqual({ id: 't1', name: 'Endline' });
  expect(fetchMock).toHaveBeenCalledWith('/api/tests/t1', { credentials: 'same-origin', redirect: 'manual', headers: AJAX });
});

test('JSON is sent with its type, and a form is left to the browser', async () => {
  fetchMock.mockResolvedValue(reply(201, '{"id":"b1"}'));
  await expect(api.post('/api/batches', { test_id: 't1' })).resolves.toEqual({ id: 'b1' });
  expect(fetchMock).toHaveBeenLastCalledWith('/api/batches', {
    credentials: 'same-origin', redirect: 'manual', method: 'POST',
    headers: { ...AJAX, 'Content-Type': 'application/json' }, body: '{"test_id":"t1"}',
  });

  const form = new FormData();
  await api.upload('/api/batches/b1/sheets', form);
  expect(fetchMock).toHaveBeenLastCalledWith('/api/batches/b1/sheets', {
    credentials: 'same-origin', redirect: 'manual', method: 'POST', headers: AJAX, body: form,
  });

  fetchMock.mockResolvedValue(reply(204, ''));
  await expect(api.del('/api/batches/b1')).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenLastCalledWith('/api/batches/b1', {
    credentials: 'same-origin', redirect: 'manual', method: 'DELETE', headers: AJAX,
  });
});

test('a redirect to the sign-in page is a 401, not a lost connection', async () => {
  const redirected = reply(0, '', 'opaqueredirect');
  fetchMock.mockResolvedValue(redirected);
  const error = await api.post('/api/batches', { test_id: 't1' }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(401);
  // There is nothing to read in a redirect the page may not follow.
  expect(redirected.text).not.toHaveBeenCalled();
});

test("an error reply carries the server's words, or only its code when it is not the app's JSON", async () => {
  fetchMock.mockResolvedValue(reply(404, '{"error":"batch not found"}'));
  const notFound = await api.get('/api/batches/x').catch((e: unknown) => e);
  expect(notFound).toBeInstanceOf(ApiError);
  expect((notFound as ApiError).status).toBe(404);
  expect((notFound as ApiError).message).toBe('batch not found');

  // A gateway page while the server restarts.
  fetchMock.mockResolvedValue(reply(502, '<html><body>Bad Gateway</body></html>'));
  const gateway = await api.get('/api/batches').catch((e: unknown) => e);
  expect((gateway as ApiError).status).toBe(502);
  expect((gateway as ApiError).message).toBe('request failed (502)');
});
