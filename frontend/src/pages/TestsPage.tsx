import { useEffect, useState } from 'react';
import AnswerInput from '../components/AnswerInput';
import { api, fmtDate, Me, Test } from '../lib/api';

const blank = (qn: number): Partial<Test> => ({ name: '', question_count: qn, options: 'ABCDE', marks_correct: 1, marks_incorrect: 0, marks_unmarked: 0, answer_key: {} });

export default function TestsPage({ me }: { me: Me }) {
  const [tests, setTests] = useState<Test[]>([]);
  const [editing, setEditing] = useState<Partial<Test> | null>(null);
  const [msg, setMsg] = useState('');
  const maxQ = me.sheet.question_count;

  const load = () => api.get<Test[]>('/api/tests').then(setTests).catch(e => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    setMsg('');
    try {
      if (editing.id) await api.put(`/api/tests/${editing.id}`, editing);
      else await api.post('/api/tests', editing);
      setEditing(null);
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  const archive = async (t: Test) => {
    if (!window.confirm(`Archive "${t.name}"? Past results are kept.`)) return;
    await api.put(`/api/tests/${t.id}`, { ...t, archived: true });
    load();
  };

  const setAnswer = (opt: string, idx: number) =>
    setEditing(e => e && ({ ...e, answer_key: { ...e.answer_key, [`q${idx}`]: opt } }));

  const filled = editing ? Object.values(editing.answer_key || {}).filter(Boolean).length : 0;
  const qn = editing?.question_count || maxQ;

  return (
    <div className="text-left">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Answer keys</h1>
        {!editing && <button className="btn-primary" onClick={() => setEditing(blank(maxQ))}>New answer key</button>}
      </div>
      {msg && <div className="mb-4 p-3 rounded bg-red-100 text-red-800">{msg}</div>}

      {editing ? (
        <div className="bg-white border rounded-lg shadow p-6">
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold">Test name</span>
              <input className="input" value={editing.name || ''} placeholder="e.g. Endline Oct 2026, Class 7"
                onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Questions (max {maxQ})</span>
              <input className="input" type="number" min={1} max={maxQ} value={editing.question_count || maxQ}
                onChange={e => setEditing({ ...editing, question_count: Math.max(1, Math.min(maxQ, Number(e.target.value) || 1)) })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Options</span>
              <input className="input" value={editing.options || ''} maxLength={5}
                onChange={e => setEditing({ ...editing, options: e.target.value.toUpperCase().replace(/[^A-E]/g, '') })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Marks: correct</span>
              <input className="input" type="number" step="0.25" value={editing.marks_correct ?? 1}
                onChange={e => setEditing({ ...editing, marks_correct: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Marks: wrong</span>
              <input className="input" type="number" step="0.25" value={editing.marks_incorrect ?? 0}
                onChange={e => setEditing({ ...editing, marks_incorrect: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Marks: blank</span>
              <input className="input" type="number" step="0.25" value={editing.marks_unmarked ?? 0}
                onChange={e => setEditing({ ...editing, marks_unmarked: Number(e.target.value) })} />
            </label>
          </div>

          <div className="text-sm text-gray-600 mb-2">Click the correct option for each question. {filled} of {qn} set.</div>
          <div className="grid gap-y-2 gap-x-6 grid-flow-col" style={{ gridTemplateRows: `repeat(${Math.ceil(qn / 5)}, minmax(0, 1fr))` }}>
            {Array.from({ length: qn }, (_, i) => (
              <AnswerInput key={i} index={i + 1} options={editing.options || 'ABCDE'}
                answer={editing.answer_key?.[`q${i + 1}`] || ''} onOptionClick={setAnswer} />
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <button className="btn-primary" onClick={save} disabled={filled < qn}>
              {filled < qn ? `Set all ${qn} answers to save` : (editing.id ? 'Save changes' : 'Save answer key')}
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bg-white border rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#D8F1A038] text-left text-xs uppercase text-gray-700">
              <tr><th className="p-3">Test</th><th className="p-3">Questions</th><th className="p-3">Marks (right / wrong / blank)</th><th className="p-3">Created</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {tests.length === 0 && <tr><td className="p-4 text-gray-500" colSpan={5}>No answer keys yet. Create one to start evaluating.</td></tr>}
              {tests.map(t => (
                <tr key={t.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-semibold">{t.name}</td>
                  <td className="p-3">{t.question_count} × {t.options}</td>
                  <td className="p-3">{t.marks_correct} / {t.marks_incorrect} / {t.marks_unmarked}</td>
                  <td className="p-3 text-gray-600">{fmtDate(t.created_at)} by {t.created_by}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button className="link" onClick={() => setEditing({ ...t })}>Edit</button>
                    <span className="mx-2 text-gray-300">|</span>
                    <button className="link" onClick={() => archive(t)}>Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
