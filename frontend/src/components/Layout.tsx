import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '../contexts/AuthContext';
import {
  Activity, LayoutDashboard, ShieldCheck, MapPin,
  Droplets, Microscope, FileCheck, LogOut, Clock, ScanLine
} from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';

export const Layout = () => {
  const { user, logout, sessionTimeout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getNavLinks = (role?: string) => {
    // FIXED: Convert role to uppercase to make it completely case-insensitive
    const cleanRole = role ? role.toString().toUpperCase().trim() : '';

    switch (cleanRole) {
      case 'ICNO':
        return [
          { name: 'Dashboard', path: '/icno/dashboard', icon: LayoutDashboard },
          { name: 'Validation Inbox', path: '/icno/validation', icon: ShieldCheck, badge: 3 },
          { name: 'Ward Audit', path: '/icno/audit', icon: Droplets },
          { name: 'Hospital Map', path: '/heatmap', icon: MapPin },
          { name: 'OCR Scan', path: '/icno/ocr', icon: ScanLine },
        ];
      case 'SISTER':
      case 'MATRON':
        return [
          { name: 'Executive Dashboard', path: '/sister/dashboard', icon: LayoutDashboard },
          { name: 'Hospital Map', path: '/heatmap', icon: MapPin },
        ];
      case 'LAB':
        return [
          { name: 'Enter Lab Result', path: '/lab/entry', icon: Microscope },
        ];
      case 'DOCTOR':
        return [
          { name: 'Validated Reports', path: '/doctor/inbox', icon: FileCheck },
        ];
      default:
        return [];
    }
  };

  const navLinks = getNavLinks(user?.role);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar / Topbar */}
      <aside className={clsx(
        "bg-brand text-white w-full md:w-64 flex-shrink-0 flex flex-col transition-all duration-300",
        "md:min-h-screen md:sticky md:top-0"
      )}>
        <div className="p-4 flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-2">
            <Activity className="text-white" size={28} />
            <h1 className="text-xl font-bold border-b-2 border-transparent">InfecSure</h1>
          </div>
          <button
            className="md:hidden p-2 bg-brand-dark rounded min-h-[48px] min-w-[48px]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            ☰
          </button>
        </div>

        <nav className={clsx(
          "flex-1 px-3 py-4 flex flex-col gap-2 relative",
          mobileMenuOpen ? "block" : "hidden md:flex"
        )}>
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = location.pathname.startsWith(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors min-h-[48px]",
                  active ? "bg-white text-brand font-medium shadow-sm" : "hover:bg-brand-dark hover:text-white text-slate-100"
                )}
              >
                <Icon size={20} />
                <span>{link.name}</span>
                {link.badge && (
                  <span className="ml-auto bg-risk-pending text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {link.badge}
                  </span>
                )}
              </Link>
            )
          })}

          <div className="mt-auto border-t border-brand-dark pt-4 mb-4">
            <div className="px-3 mb-4 hidden md:block">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-brand-light">{user?.role}</p>
            </div>

            <div className={clsx(
              "flex items-center gap-2 px-3 mb-4",
              sessionTimeout < 120 ? "text-risk-amber animate-pulse" : "text-slate-300"
            )}>
              <Clock size={16} />
              <span className="text-sm">Session: {formatTime(sessionTimeout)}</span>
            </div>

            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-slate-200 hover:bg-brand-dark hover:text-white transition-colors min-h-[48px]"
            >
              <LogOut size={20} />
              <span>Log out</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full bg-slate-50 relative pb-16 md:pb-0">
        <div className="max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      {/* Expiry Warning Modal */}
      {sessionTimeout > 0 && sessionTimeout <= 120 && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Session Expiring Soon</h3>
            <p className="text-slate-600 mb-6">Your session will expire in {formatTime(sessionTimeout)} for security. Would you like to stay logged in?</p>
            <div className="flex gap-3">
              <button
                onClick={logout}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-lg font-medium hover:bg-slate-50 min-h-[48px]"
              >
                Log Out
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-brand text-white py-3 rounded-lg font-medium hover:bg-brand-light min-h-[48px]"
              >
                Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};