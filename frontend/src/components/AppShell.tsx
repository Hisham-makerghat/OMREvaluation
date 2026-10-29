// The frame around every screen.
// Laptop: one white bar across the whole width, with the MakerGhat logo and the app name at the left
// edge, the tabs in the middle and the signed-in person at the right edge (their name from 1280px).
// Tablet: the same bar with only the logo and the round letter, so the tabs fit on one row. Phone:
// the bar shows the logo and the page name, and the tabs move to the bottom.
import classNames from 'classnames';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { User } from '../lib/api';
import { displayName, initialOf } from '../lib/format';
import { IconChart, IconChevronDown, IconKey, IconSignOut, IconUpload, IconUsers } from './Icons';
import { Avatar, Logo } from './ui';

export const SIGN_OUT_URL = '/.auth/logout?post_logout_redirect_uri=/';

interface Tab { to: string; label: string; title: string; Icon: typeof IconUpload; adminOnly?: boolean; }

export const TABS: Tab[] = [
  { to: '/evaluate', label: 'Check', title: 'Check sheets', Icon: IconUpload },
  { to: '/tests', label: 'Keys', title: 'Answer keys', Icon: IconKey },
  { to: '/batches', label: 'Results', title: 'Results', Icon: IconChart },
  { to: '/users', label: 'Users', title: 'Users', Icon: IconUsers, adminOnly: true },
];

/** The page name for the phone bar and the browser tab. */
function titleFor(pathname: string): string {
  const tab = TABS.find(t => pathname === t.to || pathname.startsWith(`${t.to}/`));
  return tab ? tab.title : 'OMR Tool';
}

function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    firstItem.current?.focus();
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = displayName(user);
  return (
    <div ref={wrap} className="relative order-2 shrink-0">
      <button ref={button} type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}
        aria-label={`Account: ${name}`}
        className="inline-flex min-h-[48px] items-center gap-2 rounded-full py-1 pl-1 pr-2 font-semibold text-brand hover:bg-coral-wash xl:pr-3">
        <Avatar letter={initialOf(user)} className="h-10 w-10" />
        {/* Name and arrow only from 1280px: below that the tabs need the room to stay on one row
            beside the logo and the app name (at 1024px a long name pushed the last tab to a second row). */}
        <span className="hidden max-w-[160px] truncate text-[15px] xl:inline">{name}</span>
        <IconChevronDown size={18} className="hidden xl:inline" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(300px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-2 shadow-lg">
          <div className="px-3 pb-3 pt-2">
            <p className="m-0 truncate font-semibold text-heading">{name}</p>
            <p className="m-0 truncate text-[15px] text-muted">{user.email}</p>
            <p className="m-0 mt-1 text-[15px] text-muted">{user.role === 'admin' ? 'Admin' : 'Teacher'}</p>
          </div>
          <a ref={firstItem} href={SIGN_OUT_URL}
            className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 font-semibold text-brand no-underline hover:bg-coral-wash">
            <IconSignOut /> Sign out
          </a>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const { pathname } = useLocation();
  const tabs = TABS.filter(t => !t.adminOnly || user.role === 'admin');
  const title = titleFor(pathname);

  useEffect(() => {
    document.title = `${title} · OMR Tool`;
  }, [title]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">Skip to the page</a>
      <header className="border-b border-line bg-white">
        {/* No max width: on a wide screen the logo stays at the left edge and the person at the right. */}
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6 md:gap-6">
          {/* The logo keeps its clear space (twice the height of its "a": 17.6px at 36px high, 19.5px at 40px,
              21.5px at 44px) from what follows it: gap-6 to the divider, and on phones mr-1 / sm:mr-2 on top
              of the row's 16px gap to the page name. */}
          <Link to="/evaluate" className="mr-1 flex shrink-0 items-center gap-6 no-underline sm:mr-2 md:mr-0" aria-label="MakerGhat OMR Tool home">
            {/* The MakerGhat logo from the design system, recoloured to the app's coral (hand) and heading
                brown (words). 40px high on a phone and 44px from 640px, above the brand's 30px minimum.
                Under 340px it is 36px, so the page name beside it ("Check sheets") still fits on a 320px
                phone; below about 316px it is shortened with "…". */}
            <Logo alt="" className="h-9 w-auto min-[340px]:h-10 sm:h-11" />
            {/* forced-colors: a contrast theme repaints backgrounds in the page colour, which would hide the line. */}
            <span aria-hidden="true" className="hidden h-8 w-px bg-line lg:block forced-colors:bg-[CanvasText]" />
            <span className="hidden font-display text-lg font-semibold text-heading lg:inline">OMR Tool</span>
          </Link>
          <span className="flex-1 truncate font-display text-lg font-semibold text-heading md:hidden">{title}</span>
          {/* Narrower tabs below 1024px, so all four stay on one row beside the logo, also on a phone held
              sideways whose notch takes 50px on each side (iPhone 12/13 mini). */}
          <nav aria-label="Main" className="order-1 hidden flex-1 flex-wrap justify-center gap-2 md:flex">
            {tabs.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => classNames(
                  'inline-flex h-12 items-center gap-2 rounded-full px-4 text-base font-semibold text-heading no-underline lg:px-5',
                  isActive ? 'bg-coral' : 'hover:bg-coral-wash')}>
                <Icon />
                {label}
              </NavLink>
            ))}
          </nav>
          <AccountMenu user={user} />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden"
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        <div className="flex pt-1.5">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => classNames(
                'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold no-underline',
                isActive ? 'text-heading' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <span className={classNames('inline-flex rounded-full px-[18px] py-1', isActive && 'bg-coral-wash text-coral-dark')}>
                    <Icon strokeWidth={isActive ? 2.2 : 2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
