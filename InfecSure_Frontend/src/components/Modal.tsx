import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Modal({
  open,
  title,
  children,
  onClose,
  footer
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose} icon={<X size={18} />} />
        </div>
        <div className="p-5 text-sm leading-6 text-slate-700">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
