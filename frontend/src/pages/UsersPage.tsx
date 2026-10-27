import { useEffect, useState } from 'react';
import { api, fmtDate, Me, User } from '../lib/api';

export default function UsersPage({ me }: { me: Me }) {
  const [users, setUsers] = useState<User[]>([]);
  const [msg, setMsg] = useState('');
  const load = () => api.get<User[]>('/api/users').then(setUsers).catch(e => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const update = async (u: User, body: Partial<User>) => {
    setMsg('');
    try { await api.patch(`/api/users/${u.id}`, body); load(); } catch (e: any) { setMsg(e.message); }
  };

  const pending = users.filter(u => u.status === 'pending');
  const others = users.filter(u => u.status !== 'pending');
  const Row = ({ u }: { u: User }) => (
    <tr className="border-t hover:bg-gray-50">
      <td className="p-3">{u.email}{u.id === me.user.id && <span className="ml-2 text-xs text-gray-500">(you)</span>}</td>
      <td className="p-3">{u.name}</td>
      <td className="p-3">
        <select className="input py-1" value={u.role} disabled={u.id === me.user.id} onChange={e => update(u, { role: e.target.value as User['role'] })}>
          <option value="teacher">Teacher</option><option value="admin">Admin</option>
        </select>
      </td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{fmtDate(u.created_at)}</td>
      <td className="p-3 whitespace-nowrap">
        {u.status !== 'approved' && <button className="btn-primary py-1" onClick={() => update(u, { status: 'approved' })}>Approve</button>}
        {u.status === 'approved' && u.id !== me.user.id && <button className="btn-secondary py-1" onClick={() => update(u, { status: 'disabled' })}>Disable</button>}
        {u.status === 'disabled' && <span className="ml-2 text-xs text-gray-500">disabled</span>}
      </td>
    </tr>
  );
  const Table = ({ rows, empty }: { rows: User[]; empty: string }) => (
    <div className="bg-white border rounded-lg shadow overflow-x-auto mb-6">
      <table className="w-full text-sm text-left">
        <thead className="bg-[#D8F1A038] text-xs uppercase text-gray-700"><tr><th className="p-3">Email</th><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Signed up</th><th className="p-3"></th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td className="p-4 text-gray-500" colSpan={5}>{empty}</td></tr> : rows.map(u => <Row key={u.id} u={u} />)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="text-left">
      <h1 className="text-2xl font-bold mb-4">Users</h1>
      {msg && <div className="mb-4 p-3 rounded bg-red-100 text-red-800">{msg}</div>}
      <h2 className="font-bold mb-2">Waiting for approval ({pending.length})</h2>
      <Table rows={pending} empty="No one is waiting." />
      <h2 className="font-bold mb-2">Approved and disabled</h2>
      <Table rows={others} empty="No users yet." />
      <p className="text-sm text-gray-600">New people create their own account on the sign-in page with an email and password. They can use the tool only after an admin approves them here.</p>
    </div>
  );
}
