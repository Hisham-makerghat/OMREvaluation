// Users: a new role is saved only after the admin says yes, whichever way it goes. On Windows an arrow
// key on the closed select already picks the other role, so a role must never change without asking.
import { fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '../components/Toast';
import { api, Me, User } from '../lib/api';
import UsersPage from './UsersPage';

// Nothing here should reach a server.
jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), del: jest.fn(), upload: jest.fn() },
}));

const person = (id: string, name: string, role: User['role']): User => ({
  id, email: `${name.toLowerCase()}@example.org`, name, role, status: 'approved',
  created_at: '2026-10-01T09:00:00Z', approved_by: 'asha@example.org',
});
const asha = person('u1', 'Asha', 'admin');
const ravi = person('u2', 'Ravi', 'admin');
const priya = person('u3', 'Priya', 'teacher');
const me: Me = { signed_in: true, user: asha, sheet: { question_count: 50, field_labels: [] } };

beforeEach(() => {
  (api.get as jest.Mock).mockResolvedValue([asha, ravi, priya]);
});

afterEach(() => jest.restoreAllMocks());

const renderPage = () => render(<ToastProvider><UsersPage me={me} /></ToastProvider>);

test.each([
  ['an admin a teacher', 'Ravi', 'teacher', 'Make Ravi a teacher? They will no longer be able to approve people or change roles.'],
  ['a teacher an admin', 'Priya', 'admin', 'Make Priya an admin? Admins can approve people and change roles.'],
])('making %s asks first, and No changes nothing', async (_, name, role, question) => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  renderPage();
  const select = await screen.findByRole('combobox', { name: `Role for ${name}` });
  const before = (select as HTMLSelectElement).value;
  fireEvent.change(select, { target: { value: role } });
  expect(confirm).toHaveBeenCalledWith(question);
  expect(api.patch).not.toHaveBeenCalled();
  // The select still shows the saved role.
  expect(select).toHaveValue(before);
});

test('Yes saves the new role and says so', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  (api.patch as jest.Mock).mockResolvedValue({ ...ravi, role: 'teacher' });
  renderPage();
  fireEvent.change(await screen.findByRole('combobox', { name: 'Role for Ravi' }), { target: { value: 'teacher' } });
  expect(await screen.findByText('Ravi is now a teacher.')).toBeInTheDocument();
  expect(api.patch).toHaveBeenCalledWith('/api/users/u2', { role: 'teacher' });
});
