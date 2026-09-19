import { Fragment } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Activity, BarChart3, Bell, Camera, ClipboardCheck, ClipboardList, FileCheck, FileText, Home, LayoutDashboard, LogOut, MapPin, MessageSquare, Microscope, Radar, Settings, ShieldCheck, TrendingUp } from "lucide-react";
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
  { label: "Doctor Dashboard", to: "/doctor", icon: Bell, roles: ["doctor"] },
  { label: "Staff Portal", to: "/public/notices", icon: FileCheck, roles: ["staff"] }
];

const sisterSections = [
  { label: "Overview", to: "/sister?tab=overview", tab: "overview", icon: LayoutDashboard },
  { label: "Trends", to: "/sister?tab=trends", tab: "trends", icon: BarChart3 },
  { label: "Heatmap", to: "/sister?tab=heatmap", tab: "heatmap", icon: ShieldCheck },
  { label: "Root Cause", to: "/sister?tab=analytics", tab: "analytics", icon: TrendingUp },
  { label: "Reports", to: "/sister?tab=reports", tab: "reports", icon: FileText },
  { label: "Daily Report", to: "/sister?tab=summary", tab: "summary", icon: ClipboardList },
];

const labSections = [
  { label: "New Result", to: "/lab?tab=entry", tab: "entry", icon: Microscope },
  { label: "OCR Scan", to: "/lab?tab=ocr", tab: "ocr", icon: Camera },
  { label: "Status Tracker", to: "/lab?tab=status", tab: "status", icon: ClipboardList },
];

const doctorSections = [
  { label: "Clinical Inbox", to: "/doctor?tab=alerts", tab: "alerts", icon: Bell },
  { label: "Dengue Reports", to: "/doctor?tab=reports", tab: "reports", icon: FileText },
  { label: "Instructions", to: "/doctor?tab=instructions", tab: "instructions", icon: MessageSquare },
];

const staffSections: typeof sisterSections = [];

export function defaultRouteForRole(role: UserRole | null) {
  if (role === "icno") return "/icno";
  if (role === "sister") return "/sister";
  if (role === "lab") return "/lab";
  if (role === "doctor") return "/doctor";
  return "/public/notices";
}

export function Sidebar() {
  const { role, user, logout } = useAuth();
  const location = useLocation();
  const visible = navItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
  const currentTab = new URLSearchParams(location.search).get("tab")
    || (role === "lab" ? "entry" : role === "doctor" ? "alerts" : "overview");
  const dashboardSections = role === "sister" && location.pathname === "/sister"
    ? sisterSections
    : role === "lab" && location.pathname === "/lab"
      ? labSections
      : role === "doctor" && location.pathname === "/doctor"
        ? doctorSections
        : role === "staff" && (location.pathname === "/public/notices" || location.pathname === "/public/heatmap")
          ? staffSections
          : [];
  const dashboardParentPath = role === "icno"
    ? "/icno"
    : role === "sister"
      ? "/sister"
      : role === "lab"
        ? "/lab"
        : role === "doctor"
          ? "/doctor"
          : role === "staff"
            ? "/public/notices"
            : "";

  return (
    <aside className="flex w-full flex-col border-b border-slate-200/80 bg-white/90 shadow-lg backdrop-blur-md lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-200/80 p-5 bg-gradient-to-b from-slate-50 to-white">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white p-1.5 shadow-md border border-slate-200/80 transition-transform hover:scale-105">
            <img src="/logo.png" alt="InfecSure Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-lg font-black tracking-wide text-slate-900">InfecSure</p>
            <p className="text-[11px] font-semibold text-teal-800">Divisional Hospital Thalangama</p>
          </div>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto p-3.5 lg:flex-1 lg:flex-col lg:overflow-visible" aria-label="Role navigation">
        {visible.map((item) => {
          const Icon = item.icon;
          const showSectionsBelow = dashboardSections.length > 0 && item.to === dashboardParentPath;
          return (
            <Fragment key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `touch-target flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-r from-sky-900 to-teal-900 text-white shadow-md shadow-sky-950/20"
                      : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-950"
                  }`
                }
              >
                <Icon size={19} />
                {item.label}
              </NavLink>
              {showSectionsBelow ? (
                <div className="flex shrink-0 gap-2 lg:mb-2 lg:ml-4 lg:flex-col">
                  {dashboardSections.map((section) => {
                    const SectionIcon = section.icon;
                    const isActive = currentTab === section.tab;
                    return (
                      <Link
                        key={section.to}
                        to={section.to}
                        className={`touch-target flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all duration-300 ${
                          isActive
                            ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-900/20"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                      >
                        <SectionIcon size={16} />
                        {section.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </nav>
      <div className="border-t border-slate-200/80 p-5 bg-gradient-to-t from-slate-50 via-white to-white">
        <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 shadow-sm backdrop-blur-sm">
          <p className="truncate text-sm font-bold text-slate-900">{user?.full_name || user?.email}</p>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800">{role || "signed in"}</p>
        </div>
        <Button variant="ghost" className="mt-3 w-full justify-start rounded-xl font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700" icon={<LogOut size={18} />} onClick={logout}>
          Logout
        </Button>
      </div>
    </aside>
  );
}
