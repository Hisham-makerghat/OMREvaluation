import { NavLink } from 'react-router-dom';
import classNames from 'classnames';
import { User } from '../lib/api';

const link = ({ isActive }: { isActive: boolean }) =>
  classNames('px-3 py-1.5 rounded-md text-sm font-semibold', { 'bg-white/70': isActive, 'hover:bg-white/40': !isActive });

function Header({ user }: { user: User | null }) {
  return (
    <nav className="bg-[#D8F1A0]">
      <div className="mx-auto max-w-7xl px-4 flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-4">
          <img className="h-16 w-auto" src={`${process.env.PUBLIC_URL}/MG_LOGO.png`} alt="Maker Ghat" />
          <div className="text-xl font-semibold">OMR Evaluation Tool</div>
        </div>
        {user && user.status === 'approved' && (
          <div className="flex flex-wrap items-center gap-1">
            <NavLink to="/evaluate" className={link}>Evaluate</NavLink>
            <NavLink to="/tests" className={link}>Answer keys</NavLink>
            <NavLink to="/batches" className={link}>Results</NavLink>
            {user.role === 'admin' && <NavLink to="/users" className={link}>Users</NavLink>}
          </div>
        )}
        {user && (
          <div className="text-sm text-gray-700 flex items-center gap-3">
            <span>{user.email}</span>
            <a className="underline" href="/.auth/logout?post_logout_redirect_uri=/">Sign out</a>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Header;
