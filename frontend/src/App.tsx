import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { reasonText, withFullStop } from './components/evaluate/checking';
import { ToastProvider } from './components/Toast';
import { Loading } from './components/ui';
import { api, ApiError, Me } from './lib/api';
import { capitalise } from './lib/format';
import BatchPage from './pages/BatchPage';
import BatchesPage from './pages/BatchesPage';
import EvaluatePage from './pages/EvaluatePage';
import PendingPage from './pages/PendingPage';
import TestsPage from './pages/TestsPage';
import UsersPage from './pages/UsersPage';

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string>('');

  const load = useCallback(async (): Promise<Me | null> => {
    try {
      const m = await api.get<Me>('/api/me');
      setMe(m);
      setError('');
      return m;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = '/.auth/login/aad?post_login_redirect_uri='
          + encodeURIComponent(window.location.pathname + window.location.search);
      } else {
        // In plain words, as on the other screens: "The internet connection was lost.",
        // "The server had a problem. Try again in a minute.", never "Failed to fetch" or "Bad Gateway".
        setError(capitalise(withFullStop(reasonText(e))));
      }
      return null;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card flex w-full max-w-[520px] flex-col gap-4">
          <h1 className="m-0 font-display text-2xl font-semibold text-heading">The OMR Tool could not open</h1>
          <p className="m-0">{error}</p>
          <p className="hint">Check your internet connection and try again. If it keeps happening, tell a MakerGhat admin.</p>
          <div><button type="button" className="btn btn-primary" onClick={() => { setError(''); load(); }}>Try again</button></div>
        </div>
      </main>
    );
  }
  if (!me) return <main className="flex min-h-screen items-center justify-center"><Loading label="Opening the OMR Tool…" /></main>;
  if (me.user.status !== 'approved') return <PendingPage user={me.user} onCheckAgain={load} />;

  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell user={me.user}>
          <Routes>
            <Route path="/" element={<Navigate to="/evaluate" replace />} />
            <Route path="/evaluate" element={<EvaluatePage me={me} />} />
            <Route path="/tests" element={<TestsPage me={me} />} />
            <Route path="/batches" element={<BatchesPage me={me} />} />
            <Route path="/batches/:id" element={<BatchPage me={me} />} />
            {me.user.role === 'admin' && <Route path="/users" element={<UsersPage me={me} />} />}
            <Route path="*" element={<Navigate to="/evaluate" replace />} />
          </Routes>
        </AppShell>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
