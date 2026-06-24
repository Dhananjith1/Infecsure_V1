import { Outlet } from "react-router-dom";
import { Clock } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { useSessionTimeout } from "../hooks/useSessionTimeout";

export function Layout() {
  const { secondsRemaining, showWarning, sessionRefreshPending, stayLoggedIn } = useSessionTimeout();
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <p className="text-sm font-semibold text-slate-700">AI-assisted infection monitoring and outbreak response</p>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600">
            <Clock size={16} />
            {minutes}:{seconds.toString().padStart(2, "0")}
          </div>
        </div>
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
      <Modal
        open={showWarning}
        title="Session ending soon"
        onClose={() => undefined}
        footer={
          <Button onClick={stayLoggedIn} disabled={sessionRefreshPending}>
            {sessionRefreshPending ? "Refreshing..." : "Stay logged in"}
          </Button>
        }
      >
        Your 15-minute clinical session is close to expiring. Refresh your token before continuing patient-safety actions.
      </Modal>
    </div>
  );
}
