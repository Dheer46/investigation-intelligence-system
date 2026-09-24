import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token || user?.role !== 'ADMINISTRATOR') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
