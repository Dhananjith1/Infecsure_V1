import { NavLink } from "react-router-dom";
import { Activity, Bell, Camera, ClipboardCheck, FileCheck, Home, LogOut, MapPin, Microscope, Radar, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import type { NavItem, UserRole } from "../types";
import { Button } from "./Button";

const navItems: NavItem[] = [
  { label: "ICNO Home", to: "/icno", icon: Home, roles: ["icno"] },
  { label: "New Audit", to: "/icno/audit", icon: ClipboardCheck, roles: ["icno"] },
  { label: "Pending Approvals", to: "/icno/approvals", icon: ShieldCheck, roles: ["icno"] },
  { label: "Scan Document", to: "/icno/scan", icon: Camera, roles: ["icno"] },
  { label: "Surveillance", to: "/icno/surveillance", icon: Radar, roles: ["icno"] },
  { label: "System Console", to: "/icno/system", icon: Settings, roles: ["icno"] },
  { label: "Sister Dashboard", to: "/sister", icon: MapPin, roles: ["sister"] },
  { label: "Lab Results", to: "/lab", icon: Microscope, roles: ["lab"] },
  { label: "Clinical Alerts", to: "/doctor", icon: Bell, roles: ["doctor"] },
  { label: "Notice Panel", to: "/public/notices", icon: FileCheck, roles: ["staff"] },
  { label: "Staff Heatmap", to: "/public/heatmap", icon: Activity, roles: ["staff"] }
];

export function defaultRouteForRole(role: UserRole | null) {
  if (role === "icno") return "/icno";
  if (role === "sister") return "/sister";
  if (role === "lab") return "/lab";
  if (role === "doctor") return "/doctor";
  return "/public/notices";
}

export function Sidebar() {
  const { role, user, logout } = useAuth();
  const visible = navItems.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <aside className="flex w-full flex-col border-b border-slate-200 bg-white lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-clinical-700 text-white">
            <Activity size={22} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-950">InfecSure</p>
            <p className="text-xs font-medium text-slate-500">Divisional Hospital Thalangama</p>
          </div>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible" aria-label="Role navigation">
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `touch-target flex shrink-0 items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition ${
                  isActive ? "bg-clinical-50 text-clinical-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`
              }
            >
              <Icon size={19} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <p className="truncate text-sm font-semibold text-slate-900">{user?.full_name || user?.email}</p>
        <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">{role || "signed in"}</p>
        <Button variant="ghost" className="w-full justify-start" icon={<LogOut size={18} />} onClick={logout}>
          Logout
        </Button>
      </div>
    </aside>
  );
}
