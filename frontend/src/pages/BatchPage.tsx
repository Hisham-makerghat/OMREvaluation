import classNames from 'classnames';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Batch, fmtDate, Me, Sheet, Test } from '../lib/api';

export default function BatchPage({ me }: { me: Me }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [open, setOpen] = useState<string>('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<Batch>(`/api/batches/${id}`).then(b => { setBatch(b); return api.get<Test>(`/api/tests/${b.test_id}`).then(setTest); }).catch(e => setMsg(e.message));
    api.get<Sheet[]>(`/api/batches/${id}/sheets`).then(setSheets).catch(e => setMsg(e.message));
  }, [id]);

  if (msg) return <div className="p-3 rounded bg-red-100 text-red-800">{msg}</div>;
  if (!batch || !test) return <div className="text-gray-500">Loading…</div>;

  const fields = me.sheet.field_labels;
  const qn = test.question_count;
  const key = test.answer_key;
  const ordered = [...sheets].sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error') || Number(b.needs_review) - Number(a.needs_review) || a.source_name.localeCompare(b.source_name) || a.page_no - b.page_no);
  const canDelete = me.user.role === 'admin' || batch.created_by === me.user.email;

  const remove = async () => {
    if (!window.confirm('Delete this batch and all its sheets? This cannot be undone.')) return;
    await api.del(`/api/batches/${batch.id}`);
    navigate('/batches');
  };

  return (
    <div className="text-left">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">{test.name}{batch.name ? ` · ${batch.name}` : ''}</h1>
          <div className="text-sm text-gray-600">{fmtDate(batch.created_at)} by {batch.created_by} · {batch.read_count} read, {batch.review_count} to review, {batch.error_count} failed</div>
        </div>
        <div className="flex gap-2">
          <a className="btn-primary" href={`/api/batches/${batch.id}/results.csv`}>Download CSV</a>
          {canDelete && <button className="btn-secondary" onClick={remove}>Delete batch</button>}
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-[#D8F1A038] text-left text-xs uppercase text-gray-700">
            <tr>
              <th className="p-2">#</th><th className="p-2">File</th><th className="p-2">Status</th><th className="p-2">Score</th>
              {fields.map(f => <th key={f} className="p-2">{f}</th>)}
              {Array.from({ length: qn }, (_, i) => <th key={i} className="p-2 text-center">Q{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {ordered.map((s, idx) => (
              <>
                <tr key={s.id} className={classNames('border-t hover:bg-gray-50', { 'bg-amber-50': s.needs_review, 'bg-red-50': s.status === 'error' })}>
                  <td className="p-2 text-gray-500">{idx + 1}</td>
                  <td className="p-2">
                    <button className="link" onClick={() => setOpen(open === s.id ? '' : s.id)} title="Show the checked picture">
                      {s.source_name}{s.page_no > 1 || s.source_name.toLowerCase().endsWith('.pdf') ? ` p${s.page_no}` : ''}
                    </button>
                  </td>
                  <td className="p-2">
                    {s.status === 'error' ? <span className="text-red-700" title={s.error_reason}>Failed: {s.error_reason}</span>
                      : s.needs_review ? <span className="text-amber-700" title={s.review_reason}>Review: {s.review_reason}</span>
                      : <span className="text-green-700">OK</span>}
                  </td>
                  <td className="p-2 font-semibold">{s.score ?? ''}</td>
                  {fields.map(f => <td key={f} className="p-2">{s.fields[f] || ''}</td>)}
                  {Array.from({ length: qn }, (_, i) => {
                    const q = `q${i + 1}`; const a = s.answers[q] || '';
                    return <td key={q} className={classNames('p-2 text-center', { 'text-green-700': a && a === key[q], 'text-red-700': a && a !== key[q], 'text-gray-300': !a })}>{a || '·'}</td>;
                  })}
                </tr>
                {open === s.id && (
                  <tr key={s.id + '-img'} className="bg-gray-100">
                    <td colSpan={4 + fields.length + qn} className="p-3">
                      <div className="flex gap-4 flex-wrap">
                        {s.has_checked_image && <figure><img className="max-h-[720px] border bg-white" src={`/api/sheets/${s.id}/image`} alt="Checked sheet" /><figcaption className="text-xs text-gray-600 mt-1">What the reader saw: each filled bubble is boxed and labelled.</figcaption></figure>}
                        <figure><img className="max-h-[720px] border bg-white" src={`/api/sheets/${s.id}/image?kind=input`} alt="Uploaded scan" /><figcaption className="text-xs text-gray-600 mt-1">The uploaded scan.</figcaption></figure>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
