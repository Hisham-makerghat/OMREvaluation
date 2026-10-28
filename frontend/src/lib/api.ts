// Small wrapper around fetch for the JSON API. Errors carry the server's message.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const msg = (body && body.error) || res.statusText || `request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const api = {
  get: <T>(url: string) => fetch(url, { credentials: 'same-origin' }).then(r => handle<T>(r)),
  post: <T>(url: string, body?: unknown) =>
    fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) }).then(r => handle<T>(r)),
  put: <T>(url: string, body: unknown) =>
    fetch(url, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body) }).then(r => handle<T>(r)),
  patch: <T>(url: string, body: unknown) =>
    fetch(url, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body) }).then(r => handle<T>(r)),
  del: (url: string) => fetch(url, { method: 'DELETE', credentials: 'same-origin' }).then(r => handle<void>(r)),
  upload: <T>(url: string, form: FormData) =>
    fetch(url, { method: 'POST', credentials: 'same-origin', body: form }).then(r => handle<T>(r)),
};

export interface User { id: string; email: string; name: string; role: 'teacher' | 'admin'; status: 'pending' | 'approved' | 'disabled'; created_at: string; approved_by: string | null; }
export interface Me { signed_in: boolean; user: User; sheet: { question_count: number; field_labels: string[] }; }
export interface Test { id: string; name: string; question_count: number; options: string; marks_correct: number; marks_incorrect: number; marks_unmarked: number; answer_key: Record<string, string>; created_by: string; created_at: string; archived: boolean; }
export interface Batch { id: string; test_id: string; test_name: string; name: string; created_by: string; created_at: string; finished_at: string | null; status: 'open' | 'finished'; sheet_count: number; read_count: number; review_count: number; error_count: number; }
export interface Sheet { id: string; batch_id: string; source_name: string; page_no: number; status: 'ok' | 'error'; error_reason: string; fields: Record<string, string>; answers: Record<string, string>; score: number | null; needs_review: boolean; review_reason: string; has_checked_image: boolean; created_at: string; }

export const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString() : '';
