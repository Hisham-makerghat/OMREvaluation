import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Batch, Me, Sheet, Test } from '../lib/api';
import { countPages, isSupported, pagesOf } from '../lib/pages';

interface Progress { total: number; done: number; read: number; review: number; failed: number; current: string; }

async function uploadWithRetry(batchId: string, form: FormData, tries = 3): Promise<Sheet[]> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try { return await api.upload<Sheet[]>(`/api/batches/${batchId}/sheets`, form); }
    catch (e: any) {
      lastErr = e;
      if (e.status && e.status < 500 && e.status !== 408) throw e;   // a real rejection, not a dropped connection
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

export default function EvaluatePage({ me }: { me: Me }) {
  const [tests, setTests] = useState<Test[]>([]);
  const [testId, setTestId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [msg, setMsg] = useState('');
  const [batchId, setBatchId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<Test[]>('/api/tests').then(ts => { setTests(ts); setTestId(cur => cur || (ts[0]?.id ?? '')); }).catch(e => setMsg(e.message));
  }, []);

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list || []).filter(isSupported);
    setFiles(chosen);
    setMsg(chosen.length === 0 && list && list.length > 0 ? 'No PDF, JPG or PNG files in that selection.' : '');
  };

  const start = async () => {
    setMsg('');
    setProgress({ total: 0, done: 0, read: 0, review: 0, failed: 0, current: 'Counting pages…' });
    let batch: Batch;
    try {
      batch = await api.post<Batch>('/api/batches', { test_id: testId, name: batchName });
    } catch (e: any) { setMsg(e.message); setProgress(null); return; }
    setBatchId(batch.id);
    const total = await countPages(files);
    const p: Progress = { total, done: 0, read: 0, review: 0, failed: 0, current: '' };
    setProgress({ ...p });
    try {
      for await (const page of pagesOf(files)) {
        p.current = `${page.sourceName}, page ${page.pageNo}`;
        setProgress({ ...p });
        const form = new FormData();
        form.append('file', page.blob, `${page.sourceName.replace(/\.[^.]+$/, '')}-p${page.pageNo}.jpg`);
        form.append('source_name', page.sourceName);
        form.append('page_no', String(page.pageNo));
        try {
          const sheets = await uploadWithRetry(batch.id, form);
          for (const s of sheets) {
            if (s.status === 'ok') { p.read++; if (s.needs_review) p.review++; } else p.failed++;
          }
        } catch (e: any) {
          p.failed++;
          setMsg(`Could not upload ${p.current}: ${e.message}`);
        }
        p.done++;
        setProgress({ ...p });
      }
    } finally {
      await api.post(`/api/batches/${batch.id}/finish`).catch(() => undefined);
      p.current = 'Done';
      setProgress({ ...p });
    }
  };

  const pct = progress && progress.total ? Math.round(100 * progress.done / progress.total) : 0;
  const running = progress !== null && progress.current !== 'Done';

  return (
    <div className="text-left">
      <h1 className="text-2xl font-bold mb-4">Evaluate scanned sheets</h1>
      {msg && <div className="mb-4 p-3 rounded bg-red-100 text-red-800">{msg}</div>}

      <div className="bg-white border rounded-lg shadow p-6 mb-6">
        <div className="font-bold text-lg mb-3">Step 1: Choose the answer key</div>
        {tests.length === 0 ? (
          <p className="text-gray-600">No answer keys yet. <button className="link" onClick={() => navigate('/tests')}>Create one first.</button></p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="text-sm font-semibold">Test</span>
              <select className="input" value={testId} onChange={e => setTestId(e.target.value)} disabled={running}>
                {tests.map(t => <option key={t.id} value={t.id}>{t.name} ({t.question_count} questions)</option>)}
              </select></label>
            <label className="block"><span className="text-sm font-semibold">Name for this batch (optional)</span>
              <input className="input" placeholder="e.g. Class 7A, morning" value={batchName} onChange={e => setBatchName(e.target.value)} disabled={running} /></label>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg shadow p-6 mb-6">
        <div className="font-bold text-lg mb-1">Step 2: Choose the scans</div>
        <p className="text-sm text-gray-600 mb-3">PDF, JPG or PNG. A PDF with many pages is fine: every page is read as one sheet. Files are shrunk in your browser before upload, so slow internet is not a problem.</p>
        <div className="flex flex-wrap gap-3 items-center">
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={running}>Choose files</button>
          <button className="btn-secondary" onClick={() => folderRef.current?.click()} disabled={running}>Choose a folder</button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" className="hidden" onChange={e => pick(e.target.files)} />
          <input ref={folderRef} type="file" className="hidden" {...({ webkitdirectory: 'true' } as any)} onChange={e => pick(e.target.files)} />
          {files.length > 0 && <span className="text-sm">{files.length} file{files.length === 1 ? '' : 's'} selected</span>}
          {files.length > 0 && !running && <button className="link" onClick={() => { setFiles([]); setProgress(null); }}>Clear</button>}
        </div>
        {files.length > 0 && (
          <ul className="mt-3 text-xs text-gray-600 max-h-32 overflow-y-auto columns-2 md:columns-3">
            {files.map(f => <li key={f.name + f.size}>{f.name}</li>)}
          </ul>
        )}
        <div className="mt-5">
          <button className="btn-primary" onClick={start} disabled={running || !testId || files.length === 0}>
            {running ? 'Evaluating…' : 'Start evaluation'}
          </button>
        </div>
      </div>

      {progress && (
        <div className="bg-white border rounded-lg shadow p-6">
          <div className="font-bold text-lg mb-3">Step 3: Progress</div>
          <div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden">
            <div className="bg-[#D8F1A0] h-5 text-xs text-center leading-5 transition-all" style={{ width: `${pct}%` }}>{pct}%</div>
          </div>
          <div className="mt-2 text-sm text-gray-700">
            {progress.done} of {progress.total} sheet{progress.total === 1 ? '' : 's'} done
            {progress.current && progress.current !== 'Done' && <span className="text-gray-500"> · {progress.current}</span>}
          </div>
          <div className="mt-2 text-sm flex gap-4">
            <span className="text-green-700">{progress.read} read</span>
            <span className="text-amber-700">{progress.review} to review</span>
            <span className="text-red-700">{progress.failed} failed</span>
          </div>
          {progress.current === 'Done' && batchId && (
            <button className="btn-primary mt-4" onClick={() => navigate(`/batches/${batchId}`)}>View results</button>
          )}
        </div>
      )}
    </div>
  );
}
