import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import Header from './components/Header';
import { api, ApiError, Me } from './lib/api';
import BatchPage from './pages/BatchPage';
import BatchesPage from './pages/BatchesPage';
import EvaluatePage from './pages/EvaluatePage';
import PendingPage from './pages/PendingPage';
import TestsPage from './pages/TestsPage';
import UsersPage from './pages/UsersPage';

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    api.get<Me>('/api/me').then(setMe).catch((e: ApiError) => {
      if (e.status === 401) window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.pathname);
      else setError(e.message);
    });
  }, []);

  if (error) return <div className="p-10 text-red-700">Could not load: {error}</div>;
  if (!me) return <div className="p-10 text-gray-500">Loading…</div>;

  const approved = me.user.status === 'approved';
  return (
    <BrowserRouter>
      <div className="App min-h-screen bg-gray-50">
        <Header user={me.user} />
        <main className="mx-auto max-w-7xl px-4 py-6">
          {!approved ? <PendingPage user={me.user} /> : (
            <Routes>
              <Route path="/" element={<Navigate to="/evaluate" replace />} />
              <Route path="/evaluate" element={<EvaluatePage me={me} />} />
              <Route path="/tests" element={<TestsPage me={me} />} />
              <Route path="/batches" element={<BatchesPage />} />
              <Route path="/batches/:id" element={<BatchPage me={me} />} />
              {me.user.role === 'admin' && <Route path="/users" element={<UsersPage me={me} />} />}
              <Route path="*" element={<Navigate to="/evaluate" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
