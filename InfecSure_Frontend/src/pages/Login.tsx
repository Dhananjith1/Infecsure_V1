import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock, User, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { defaultRouteForRole } from "../components/Sidebar";

export function Login() {
  const { login, isAuthenticated, role } = useAuth();
  const [email, setEmail] = useState("icno@infecsure.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (isAuthenticated) {
    return <Navigate to={defaultRouteForRole(role)} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const nextRole = await login(email, password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || defaultRouteForRole(nextRole), { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Login failed. Check your credentials."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center lg:justify-end bg-cover bg-center bg-no-repeat p-6 lg:pr-48 selection:bg-sky-500 selection:text-white"
      style={{ backgroundImage: `url('/Login_BG.png')` }}
    >
      {/* High-end Ultra-Glassmorphic Container */}
      <div className="group relative w-full max-w-md overflow-hidden rounded-3xl border border-white/50 bg-white/30 p-8 sm:p-10 shadow-[0_20px_50px_rgba(8,112,184,0.25)] backdrop-blur-xl transition-all duration-500 hover:border-white/70 hover:bg-white/35">
        
        {/* Subtle ambient lighting inside card */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-blue-600/15 blur-3xl" />

        {/* Header with Custom Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/40 p-2 shadow-lg shadow-sky-900/20 backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
            <img src="/logo.png" alt="InfecSure Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 bg-clip-text text-3xl font-extrabold tracking-wider text-transparent">
            INFECSURE
          </h1>
          <p className="mt-1 text-xs font-semibold tracking-wide text-slate-600">
            Infection Surveillance & Monitoring
          </p>
        </div>

        <form onSubmit={onSubmit} className="relative z-10 space-y-5">
          {/* Username Input */}
          <div className="group/input relative flex items-center rounded-2xl border border-white/60 bg-white/50 px-4 py-3 shadow-inner transition-all duration-300 focus-within:border-sky-600 focus-within:bg-white/80 focus-within:ring-4 focus-within:ring-sky-500/20 hover:bg-white/70">
            <User className="mr-3 text-slate-500 transition-colors group-focus-within/input:text-sky-700" size={20} />
            <input
              className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500 placeholder:font-normal"
              type="text"
              placeholder="Username / Staff ID"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Password Input */}
          <div className="group/input relative flex items-center rounded-2xl border border-white/60 bg-white/50 px-4 py-3 shadow-inner transition-all duration-300 focus-within:border-sky-600 focus-within:bg-white/80 focus-within:ring-4 focus-within:ring-sky-500/20 hover:bg-white/70">
            <Lock className="mr-3 text-slate-500 transition-colors group-focus-within/input:text-sky-700" size={20} />
            <input
              className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500 placeholder:font-normal"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="ml-2 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-200/50 hover:text-slate-800"
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200/80 bg-red-50/90 p-3 text-center text-xs font-semibold text-red-700 shadow-sm">
              {error}
            </p>
          ) : null}

          {/* Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d4f8b] via-[#0f5394] to-[#1261ad] py-3.5 text-sm font-bold tracking-widest text-white shadow-lg shadow-sky-900/30 transition-all duration-300 hover:shadow-xl hover:shadow-sky-900/40 active:scale-[0.98] disabled:opacity-70"
          >
            <span className="relative z-10">{loading ? "LOGGING IN..." : "LOG IN"}</span>
            <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 hover:opacity-100" />
          </button>
        </form>
      </div>
    </main>
  );
}
