import { User } from '../lib/api';

export default function PendingPage({ user }: { user: User }) {
  return (
    <div className="max-w-xl mx-auto mt-16 bg-white border rounded-lg shadow p-8 text-left">
      {user.status === 'pending' ? (
        <>
          <h1 className="text-xl font-bold mb-3">Your account is waiting for approval</h1>
          <p className="text-gray-700">You signed in as <b>{user.email}</b>. An administrator at MakerGhat has to approve new accounts before they can evaluate sheets. Ask them to open the Users page, then refresh this page.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold mb-3">Your account is disabled</h1>
          <p className="text-gray-700">Contact an administrator if you think this is a mistake.</p>
        </>
      )}
    </div>
  );
}
