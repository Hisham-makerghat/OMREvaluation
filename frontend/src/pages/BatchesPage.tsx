import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Batch, fmtDate } from '../lib/api';

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get<Batch[]>('/api/batches').then(setBatches).catch(e => setMsg(e.message)); }, []);
  return (
    <div className="text-left">
      <h1 className="text-2xl font-bold mb-4">Results</h1>
      {msg && <div className="mb-4 p-3 rounded bg-red-100 text-red-800">{msg}</div>}
      <div className="bg-white border rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#D8F1A038] text-left text-xs uppercase text-gray-700">
            <tr><th className="p-3">When</th><th className="p-3">Test</th><th className="p-3">Batch</th><th className="p-3">Sheets</th><th className="p-3">To review</th><th className="p-3">Failed</th><th className="p-3">By</th></tr>
          </thead>
          <tbody>
            {batches.length === 0 && <tr><td className="p-4 text-gray-500" colSpan={7}>Nothing evaluated yet.</td></tr>}
            {batches.map(b => (
              <tr key={b.id} className="border-t hover:bg-gray-50">
                <td className="p-3 whitespace-nowrap"><Link className="link" to={`/batches/${b.id}`}>{fmtDate(b.created_at)}</Link></td>
                <td className="p-3">{b.test_name}</td>
                <td className="p-3">{b.name || <span className="text-gray-400">—</span>}</td>
                <td className="p-3">{b.read_count} of {b.sheet_count}</td>
                <td className="p-3">{b.review_count || ''}</td>
                <td className="p-3">{b.error_count || ''}</td>
                <td className="p-3 text-gray-600">{b.created_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
