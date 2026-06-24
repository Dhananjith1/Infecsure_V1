import { createContext, useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ToastMessage } from "../types";

type ToastContextValue = {
  showToast: (toast: Omit<ToastMessage, "id">) => void;
};

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const showToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = Date.now();
    setMessages((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setMessages((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        {messages.map((toast) => (
          <div key={toast.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-xl" role="status">
            <div className="flex gap-3">
              {toast.type === "success" ? <CheckCircle2 className="text-emerald-600" /> : null}
              {toast.type === "error" ? <AlertTriangle className="text-red-600" /> : null}
              {toast.type === "info" ? <Info className="text-sky-600" /> : null}
              <div>
                <p className="font-semibold text-slate-950">{toast.title}</p>
                {toast.message ? <p className="mt-1 text-sm text-slate-600">{toast.message}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
