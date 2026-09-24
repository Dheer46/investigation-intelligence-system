import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SsoCallbackPage from './pages/SsoCallbackPage';
import DashboardPage from './pages/DashboardPage';
import CasesListPage from './pages/CasesListPage';
import CaseDetailPage from './pages/CaseDetailPage';
import ReconstructionPage from './pages/ReconstructionPage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import AuditLogPage from './pages/AuditLogPage';
import SocialFeedPage from './pages/SocialFeedPage';
import GatePage from './pages/GatePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sso-callback" element={<SsoCallbackPage />} />
      <Route path="/gate" element={<GatePage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="cases" element={<CasesListPage />} />
        <Route path="cases/:caseId" element={<CaseDetailPage />} />
        <Route path="cases/:caseId/reconstruction" element={<ReconstructionPage />} />
        <Route path="review-queue" element={<ReviewQueuePage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
      </Route>
      <Route
        path="/social-feed"
        element={
          <ProtectedRoute>
            <SocialFeedPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
