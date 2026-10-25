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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50/50 to-teal-50/40 lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-3.5 shadow-sm backdrop-blur-lg sm:px-6">
          <p className="text-xs sm:text-sm font-bold tracking-wide text-slate-800">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
            AI-assisted infection monitoring and outbreak response
          </p>
          <div className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/80 px-3.5 py-1.5 text-xs font-bold text-sky-900 shadow-inner">
            <Clock size={15} className="text-sky-700" />
            <span>{minutes}:{seconds.toString().padStart(2, "0")}</span>
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
