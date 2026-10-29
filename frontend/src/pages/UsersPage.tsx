// Users (admins only): approve people who signed up, change their role, and turn accounts off or on again.
// Every change is saved straight away, then the list is reloaded so it always matches the server.
import classNames from 'classnames';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconRefresh } from '../components/Icons';
import UsersSkeleton from '../components/skeletons/UsersSkeleton';
import { useToast } from '../components/Toast';
import { Notice } from '../components/ui';
import { api, ApiError, Me, User } from '../lib/api';
import { capitalise, displayName, friendlyDate } from '../lib/format';

type Role = User['role'];
type ChangeKind = 'approve' | 'not-now' | 'turn-off' | 'turn-on' | 'role';

/** A change on its way to the server. `role` is the role being saved; the select shows it meanwhile. */
interface Saving { kind: ChangeKind; role?: Role; }

/** Where keyboard focus goes once a change is done, if the change took it away. */
type FocusTarget = { id: string } | { pendingSlot: number };

const WAITING_ID = 'users-waiting';
const EVERYONE_ID = 'users-everyone';

/** Id of the control a change was made with. Turn off and Turn on share one: they replace each other. */
const controlId = (userId: string, kind: ChangeKind) =>
  `user-${userId}-${kind === 'turn-off' || kind === 'turn-on' ? 'switch' : kind}`;

/** "Priya Sharma" -> "Priya", for the short messages after a change. */
const firstName = (u: User) => displayName(u).split(/\s+/)[0];

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};
const byName = (a: User, b: User) =>
  displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' }) || a.email.localeCompare(b.email);
const newestFirst = (a: User, b: User) => time(b.created_at) - time(a.created_at);

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/** What went wrong, in plain words, from the server's message or a lost connection. */
function reason(e: unknown, saving: boolean): string {
  if (!(e instanceof ApiError)) return 'Check your internet connection and try again.';
  const said = e.message.trim().toLowerCase();
  if (e.status === 401) return 'You have been signed out. Reload the page to sign in again.';
  if (said === 'admin only') return 'Only admins can do this. Another admin may have changed your role.';
  if (said.includes('your account is disabled')) return 'Your own account has been turned off.';
  if (said.includes('disable your own account')) return 'You cannot turn off your own account.';
  if (said.includes('remove your own admin role')) return 'You cannot take away your own admin role. Another admin can do it.';
  if (saving && e.status === 404) return 'This person could not be found. The account may have been removed.';
  if (e.status >= 500) return 'Please try again in a minute.';
  const text = capitalise(e.message.trim());
  if (!text) return 'Please try again.';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** After a waiting card leaves: the card that moved up into its place, else the one above, else the heading. */
function pendingCardAt(slot: number): HTMLElement | null {
  const cards = document.querySelectorAll<HTMLElement>('[data-pending-card]');
  return cards[Math.min(slot, cards.length - 1)] ?? document.getElementById(WAITING_ID);
}

export default function UsersPage({ me }: { me: Me }) {
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<Record<string, Saving>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  // Every load gets a number and only the newest may update the page, so a slow older answer
  // (or one that arrives after the page has closed) never replaces a newer list.
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latestLoad.current;
    try {
      const list = await api.get<User[]>('/api/users');
      if (ticket !== latestLoad.current) return;
      setUsers(list);
      setLoadError('');
    } catch (e) {
      if (ticket !== latestLoad.current) return;
      setLoadError(reason(e, false));
    }
  }, []);

  useEffect(() => {
    load();
    return () => { latestLoad.current += 1; };
  }, [load]);

  // A saved change can move a person to the other list or swap their button, which drops keyboard
  // focus on the page body. Put it somewhere sensible, but never pull it away from where the person went.
  useEffect(() => {
    if (!focusTarget) return;
    setFocusTarget(null);
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const el = 'id' in focusTarget ? document.getElementById(focusTarget.id) : pendingCardAt(focusTarget.pendingSlot);
    el?.focus();
  }, [focusTarget]);

  const change = async (u: User, body: Partial<Pick<User, 'status' | 'role'>>, kind: ChangeKind, done: string,
    focusDone: FocusTarget = { id: controlId(u.id, kind) }) => {
    setSaving(s => ({ ...s, [u.id]: { kind, role: body.role } }));
    setErrors(errs => without(errs, u.id));
    try {
      const saved = await api.patch<User>(`/api/users/${u.id}`, body);
      // Show the change straight away; the reload below brings in anything else that changed.
      setUsers(list => list && list.map(x => (x.id === saved.id ? saved : x)));
      toast(done);
      setFocusTarget(focusDone);
    } catch (e) {
      setErrors(errs => ({ ...errs, [u.id]: `The change was not saved. ${reason(e, true)}` }));
      setFocusTarget({ id: controlId(u.id, kind) });
    } finally {
      setSaving(s => without(s, u.id));
      load();
    }
  };

  const all = users ?? [];
  const pending = all.filter(u => u.status === 'pending').sort(newestFirst);
  const everyone = [
    ...all.filter(u => u.status === 'approved').sort(byName),
    ...all.filter(u => u.status === 'disabled').sort(byName),
  ];
  // Messages about someone who is no longer in the list (for example, the account was removed).
  const known = new Set(all.map(u => u.id));
  const strayErrors = Object.entries(errors).filter(([id]) => !known.has(id));

  const decide = (u: User, approve: boolean) => {
    const name = firstName(u);
    const slot = { pendingSlot: pending.findIndex(p => p.id === u.id) };
    if (approve) change(u, { status: 'approved' }, 'approve', `${name} can now check sheets.`, slot);
    else change(u, { status: 'disabled' }, 'not-now', `${name} was not approved. You can turn the account on later under Everyone.`, slot);
  };

  const turnOff = (u: User) => {
    if (!window.confirm(`Turn off ${displayName(u)}'s account? They will not be able to check sheets until you turn it on again.`)) return;
    change(u, { status: 'disabled' }, 'turn-off', `${firstName(u)}'s account is turned off.`);
  };

  // Someone who was never approved (they got "Not now") is let in for the first time.
  const turnOn = (u: User) => change(u, { status: 'approved' }, 'turn-on',
    u.approved_by ? `${firstName(u)}'s account is on again.` : `${firstName(u)} can now check sheets.`);

  const changeRole = (u: User, role: Role) => {
    if (role === u.role) return;
    // Both ways ask first: on Windows an arrow key on the closed select already picks the other role.
    // Cancelling leaves the select as it was: its value always comes from the saved role.
    const question = role === 'admin'
      ? `Make ${displayName(u)} an admin? Admins can approve people and change roles.`
      : `Make ${displayName(u)} a teacher? They will no longer be able to approve people or change roles.`;
    if (!window.confirm(question)) return;
    change(u, { role }, 'role', role === 'admin' ? `${firstName(u)} is now an admin.` : `${firstName(u)} is now a teacher.`);
  };

  const dismissError = (id: string) => setErrors(errs => without(errs, id));
  const retry = () => {
    setLoadError('');
    load();
  };

  return (
    <div className="page flex flex-col gap-4">
      <h1 className="page-title">Users</h1>
      <p className="hint">Teachers sign up on the sign-in page with their email. Approve them here and they can start checking sheets.</p>

      {loadError && (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="error" className="w-full">
            {users ? 'The list could not be refreshed, so it may be out of date.' : 'The list of people could not be loaded.'} {loadError}
          </Notice>
          <button type="button" className="btn btn-secondary" onClick={retry}>
            <IconRefresh /> Try again
          </button>
        </div>
      )}
      {strayErrors.map(([id, message]) => (
        <Notice key={id} tone="error" onClose={() => dismissError(id)}>{message}</Notice>
      ))}

      {!users ? (
        !loadError && <UsersSkeleton />
      ) : (
        <>
          <h2 id={WAITING_ID} tabIndex={-1} className={classNames('section-label mt-2', pending.length > 0 && 'text-sun-ink')}>
            Waiting for approval · {pending.length}
          </h2>
          {pending.length === 0 ? (
            <p className="hint">No one is waiting.</p>
          ) : (
            <ul aria-labelledby={WAITING_ID} className="m-0 flex flex-col gap-4 p-0">
              {pending.map(u => (
                <PendingCard key={u.id} user={u} saving={saving[u.id]} error={errors[u.id]}
                  onApprove={() => decide(u, true)} onNotNow={() => decide(u, false)}
                  onDismissError={() => dismissError(u.id)} />
              ))}
            </ul>
          )}

          <h2 id={EVERYONE_ID} className="section-label mt-2">Everyone · {everyone.length}</h2>
          {everyone.length === 0 ? (
            <p className="hint">No one has been approved yet.</p>
          ) : (
            <ul aria-labelledby={EVERYONE_ID} className="m-0 flex flex-col gap-4 p-0">
              {everyone.map(u => (
                <PersonRow key={u.id} user={u} isMe={u.id === me.user.id} saving={saving[u.id]} error={errors[u.id]}
                  onRole={role => changeRole(u, role)} onTurnOff={() => turnOff(u)} onTurnOn={() => turnOn(u)}
                  onDismissError={() => dismissError(u.id)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Someone who signed up and is waiting: their name, email, when they signed up, and two buttons. */
function PendingCard({ user, saving, error, onApprove, onNotNow, onDismissError }: {
  user: User; saving?: Saving; error?: string;
  onApprove: () => void; onNotNow: () => void; onDismissError: () => void;
}) {
  const name = displayName(user);
  const when = friendlyDate(user.created_at);
  return (
    <li data-pending-card tabIndex={-1} className="flex flex-col gap-3 rounded-2xl border-2 border-sun bg-white px-[18px] py-4">
      <div className="flex min-w-0 flex-col">
        <p className="m-0 break-words font-display text-[19px] font-semibold leading-7 text-heading">{name}</p>
        <p className="m-0 break-words text-[15px] leading-[22px] text-muted">
          {user.email}{when && ` · signed up ${when}`}
        </p>
      </div>
      {/* The hidden words tell screen reader users whose card each button belongs to. */}
      <div className="flex flex-wrap gap-2.5">
        <button id={controlId(user.id, 'approve')} type="button" className="btn btn-primary flex-1 sm:flex-none"
          disabled={!!saving} onClick={onApprove}>
          {saving?.kind === 'approve' ? 'Approving…' : 'Approve'}<span className="sr-only"> {name}</span>
        </button>
        <button id={controlId(user.id, 'not-now')} type="button" className="btn btn-secondary"
          disabled={!!saving} onClick={onNotNow}>
          {saving?.kind === 'not-now' ? 'Saving…' : 'Not now'}<span className="sr-only">, {name}</span>
        </button>
      </div>
      {error && <Notice tone="error" onClose={onDismissError}>{error}</Notice>}
    </li>
  );
}

/** One approved or turned-off person: name and email, their role, and a button to turn the account off or on. */
function PersonRow({ user, isMe, saving, error, onRole, onTurnOff, onTurnOn, onDismissError }: {
  user: User; isMe: boolean; saving?: Saving; error?: string;
  onRole: (role: Role) => void; onTurnOff: () => void; onTurnOn: () => void; onDismissError: () => void;
}) {
  const name = displayName(user);
  const off = user.status === 'disabled';
  const youId = `user-${user.id}-you`;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-[18px] py-3.5">
      <div className="flex min-w-0 flex-[1_1_220px] flex-col">
        <p className="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 break-words font-semibold text-heading">{name}{isMe && ' (you)'}</span>
          {off && <span className="pill tone-neutral">Turned off</span>}
        </p>
        <span className="break-words text-[15px] leading-[22px] text-muted">{user.email}</span>
      </div>
      {/* On phones this group wraps under the name. */}
      <div className="flex flex-wrap items-center gap-3">
        <select id={controlId(user.id, 'role')} className="select select-small w-auto min-w-[140px]"
          aria-label={`Role for ${name}`} aria-describedby={isMe ? youId : undefined}
          value={saving?.role ?? user.role} disabled={isMe || !!saving}
          onChange={e => onRole(e.target.value as Role)}>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>
        {isMe ? (
          <span id={youId} className="hint">This is you</span>
        ) : off ? (
          <button id={controlId(user.id, 'turn-on')} type="button" className="btn btn-primary btn-small"
            disabled={!!saving} onClick={onTurnOn}>
            {saving?.kind === 'turn-on' ? 'Turning on…' : 'Turn on'}<span className="sr-only"> {name}&apos;s account</span>
          </button>
        ) : (
          <button id={controlId(user.id, 'turn-off')} type="button" className="btn btn-secondary btn-small"
            disabled={!!saving} onClick={onTurnOff}>
            {saving?.kind === 'turn-off' ? 'Turning off…' : 'Turn off'}<span className="sr-only"> {name}&apos;s account</span>
          </button>
        )}
        {saving?.kind === 'role' && <span className="hint">Saving…</span>}
      </div>
      {error && <Notice tone="error" onClose={onDismissError} className="basis-full">{error}</Notice>}
    </li>
  );
}
