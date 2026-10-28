// Shown instead of the tool to someone who signed up but is not approved yet, or was turned off.
import { useState } from 'react';
import { SIGN_OUT_URL } from '../components/AppShell';
import { IconClock, IconWarning } from '../components/Icons';
import { Notice } from '../components/ui';
import { Me, User } from '../lib/api';

export default function PendingPage({ user, onCheckAgain }: { user: User; onCheckAgain: () => Promise<Me | null> }) {
  const [checking, setChecking] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const pending = user.status === 'pending';

  const checkAgain = async () => {
    setChecking(true);
    setStillWaiting(false);
    const me = await onCheckAgain();
    setChecking(false);
    if (!me || me.user.status !== 'approved') setStillWaiting(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-4 sm:p-10">
      <div className="flex w-full max-w-[560px] flex-col gap-5 rounded-[20px] border border-line bg-white p-6 shadow-[0_4px_6px_-2px_rgba(0,0,0,0.1)] sm:p-9">
        <img src={`${process.env.PUBLIC_URL}/MG_LOGO.png`} alt="MakerGhat" className="h-12 w-12" />
        <div className="flex items-center gap-3.5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${pending ? 'bg-sun-wash text-sun-ink' : 'bg-danger-wash text-danger'}`}>
            {pending ? <IconClock /> : <IconWarning />}
          </span>
          <h1 className="m-0 font-display text-[26px] font-semibold leading-9 text-heading sm:text-[28px]">
            {pending ? 'Your account is waiting for approval' : 'Your account is turned off'}
          </h1>
        </div>
        {pending ? (
          <>
            {/* break-words: a long email has no place to wrap and would run out of the card on a phone. */}
            <p className="m-0 break-words text-lg leading-7">
              You signed in as <b>{user.email}</b>. A MakerGhat admin has to approve new accounts before they can check sheets.
              This usually takes a day.
            </p>
            <p className="m-0 text-base leading-6 text-muted">Need it faster? Message your programme coordinator and tell them the email above.</p>
          </>
        ) : (
          <p className="m-0 break-words text-lg leading-7">
            You signed in as <b>{user.email}</b>. An admin has turned this account off. Contact a MakerGhat admin if you think this is a mistake.
          </p>
        )}
        {stillWaiting && <Notice tone="warn">Still waiting. You will be able to check sheets as soon as an admin approves you.</Notice>}
        <div className="flex flex-wrap gap-3">
          {pending && (
            <button type="button" className="btn btn-primary" onClick={checkAgain} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </button>
          )}
          <a href={SIGN_OUT_URL} className="btn btn-secondary">Sign out</a>
        </div>
      </div>
    </main>
  );
}
