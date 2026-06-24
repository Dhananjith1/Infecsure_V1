import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: ReactNode;
};

const variants = {
  primary: "bg-clinical-700 text-white hover:bg-clinical-800 border-clinical-700",
  secondary: "bg-white text-slate-800 hover:bg-slate-50 border-slate-300",
  danger: "bg-red-600 text-white hover:bg-red-700 border-red-600",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 border-transparent"
};

export function Button({ variant = "primary", icon, className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`touch-target inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
