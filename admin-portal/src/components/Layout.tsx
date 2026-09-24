import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { roleLabel } from '../utils/readable';
import Crest from './Crest';

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gov-700 bg-gov-900">
        <div className="h-1 bg-gradient-to-r from-crest-600 via-seal-500 to-crest-600" />
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crest className="w-9 h-9" />
            <div>
              <h1 className="font-serif text-lg text-paper leading-tight">Officer Registration Portal</h1>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">Investigation Authority</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-200">{user?.fullName}</p>
            <p className="text-xs text-slate-500">{roleLabel(user?.role)}</p>
            <button
              className="text-xs text-slate-500 hover:text-crest-500 mt-1"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
