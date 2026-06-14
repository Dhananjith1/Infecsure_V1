import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { ICNODashboard } from './pages/ICNO/Dashboard';
import { ValidationInbox } from './pages/ICNO/ValidationInbox';
import { HeatmapView } from './pages/shared/HeatmapView';
import { WardAudit } from './pages/ICNO/WardAudit';
import { OCRScan } from './pages/ICNO/OCRScan';
import { SisterDashboard } from './pages/Sister/Dashboard';
import { LabEntry } from './pages/Lab/LabEntry';
import { DoctorInbox } from './pages/Doctor/Inbox';
import { PublicNotice } from './pages/Public/NoticePanel';
import { Layout } from './components/Layout';

// Protect routes based on roles
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { user, isAuthenticated, loading } = useAuth();
  
  if (loading) return <div className="p-8 text-center">Loading session...</div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/public" element={<PublicNotice />} />
        
        {/* All authenticated routes wrapped in Layout */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          {/* ICNO routes */}
          <Route path="/icno/dashboard" element={
            <ProtectedRoute allowedRoles={['ICNO']}>
              <ICNODashboard />
            </ProtectedRoute>
          } />
          <Route path="/icno/validation" element={
            <ProtectedRoute allowedRoles={['ICNO']}>
              <ValidationInbox />
            </ProtectedRoute>
          } />
          <Route path="/icno/audit" element={
            <ProtectedRoute allowedRoles={['ICNO']}>
              <WardAudit />
            </ProtectedRoute>
          } />
          <Route path="/icno/ocr" element={
            <ProtectedRoute allowedRoles={['ICNO']}>
              <OCRScan />
            </ProtectedRoute>
          } />
          
          {/* Heatmap (Shared among staff) */}
          <Route path="/heatmap" element={<HeatmapView />} />

          {/* Sister/Matron routes */}
          <Route path="/sister/dashboard" element={
            <ProtectedRoute allowedRoles={['Sister', 'ICNO']}>
              <SisterDashboard />
            </ProtectedRoute>
          } />

          {/* Lab personnel routes */}
          <Route path="/lab/entry" element={
            <ProtectedRoute allowedRoles={['Lab', 'ICNO']}>
              <LabEntry />
            </ProtectedRoute>
          } />

          {/* Doctor routes */}
          <Route path="/doctor/inbox" element={
            <ProtectedRoute allowedRoles={['Doctor', 'ICNO']}>
              <DoctorInbox />
            </ProtectedRoute>
          } />

          {/* Default Route */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/unauthorized" element={<div className="p-8 text-center text-red-600">Unauthorized Access</div>} />
        </Route>
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
