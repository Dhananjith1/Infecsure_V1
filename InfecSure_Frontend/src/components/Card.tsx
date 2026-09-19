import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-md transition-all ${className}`}>{children}</section>;
}

export function CardHeader({ title, action, description }: { title: string; action?: ReactNode; description?: string }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 via-white to-sky-50/20 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}
