import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { roleLabel } from '../utils/readable';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/cases', label: 'Cases' },
  { to: '/review-queue', label: 'Possible Matches' },
  { to: '/social-feed', label: 'Social feed (demo)' },
];

const AUDIT_ROLES = new Set(['AUDITOR', 'ADMINISTRATOR']);

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  let items = navItems;
  if (AUDIT_ROLES.has(user?.role ?? '')) {
    items = [...items, { to: '/audit-log', label: 'Activity Log' }];
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-ink-700 bg-ink-900 flex flex-col">
        <div className="px-5 py-5 border-b border-ink-700">
          <h1 className="font-serif text-base text-slate-100">Investigation Intelligence</h1>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-trust-600/15 text-trust-400'
                    : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {user?.role === 'ADMINISTRATOR' && (
          <div className="px-3 pb-2">
            <a
              href="http://localhost:5174"
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-ink-800 hover:text-slate-200 transition-colors"
            >
              Officer Registration Portal ↗
            </a>
          </div>
        )}
        <div className="px-5 py-4 border-t border-ink-700 text-xs">
          <p className="text-slate-200 text-sm font-medium">{user?.fullName}</p>
          <p className="text-slate-500 mt-0.5">{roleLabel(user?.role)}</p>
          <button
            className="mt-2.5 text-slate-500 hover:text-alert-high"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
