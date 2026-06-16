import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { defaultRouteForRole } from "./components/Sidebar";
import { useAuth } from "./hooks/useAuth";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { Login } from "./pages/Login";
import { ICNODashboard } from "./pages/ICNO/Dashboard";
import { ValidationInbox } from "./pages/ICNO/ValidationInbox";
import { WardAudit } from "./pages/ICNO/WardAudit";
import { OCRScan } from "./pages/ICNO/OCRScan";
import { SystemConsole } from "./pages/ICNO/SystemConsole";
import { Surveillance } from "./pages/ICNO/Surveillance";
import { SisterDashboard } from "./pages/Sister/Dashboard";
import { LabDashboard } from "./pages/Lab/Dashboard";
import { DoctorDashboard } from "./pages/Doctor/Dashboard";
import { NoticePanel } from "./pages/Public/NoticePanel";
import { HeatmapView } from "./pages/Public/HeatmapView";

function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={defaultRouteForRole(role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/public-display/heatmap" element={<HeatmapView />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<HomeRedirect />} />
          <Route element={<ProtectedRoute roles={["icno"]} />}>
            <Route path="/icno" element={<ICNODashboard />} />
            <Route path="/icno/approvals" element={<ValidationInbox />} />
            <Route path="/icno/audit" element={<WardAudit />} />
            <Route path="/icno/scan" element={<OCRScan />} />
            <Route path="/icno/surveillance" element={<Surveillance />} />
            <Route path="/icno/system" element={<SystemConsole />} />
          </Route>
          <Route element={<ProtectedRoute roles={["sister"]} />}>
            <Route path="/sister" element={<SisterDashboard />} />
          </Route>
          <Route element={<ProtectedRoute roles={["lab"]} />}>
            <Route path="/lab" element={<LabDashboard />} />
          </Route>
          <Route element={<ProtectedRoute roles={["doctor"]} />}>
            <Route path="/doctor" element={<DoctorDashboard />} />
          </Route>
          <Route element={<ProtectedRoute roles={["staff"]} />}>
            <Route path="/public/notices" element={<NoticePanel />} />
            <Route path="/public/heatmap" element={<HeatmapView />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
