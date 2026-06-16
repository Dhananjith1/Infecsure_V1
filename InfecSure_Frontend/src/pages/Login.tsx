import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Activity, Lock, Mail } from "lucide-react";
import { Button } from "../components/Button";
import { Card, CardBody } from "../components/Card";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { defaultRouteForRole } from "../components/Sidebar";

export function Login() {
  const { login, isAuthenticated, role } = useAuth();
  const [email, setEmail] = useState("icno@infecsure.com");
  const [password, setPassword] = useState("");
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
      setError(apiErrorMessage(err, "Login failed. Check the email and password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="bg-clinical-800 p-6 text-white">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-lg bg-white/15">
            <Activity size={25} />
          </div>
          <h1 className="text-2xl font-bold">InfecSure</h1>
          <p className="mt-2 text-sm leading-6 text-clinical-50">Secure access for infection-control workflows at Divisional Hospital, Thalangama.</p>
        </div>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <span className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                <Mail size={18} className="text-slate-400" />
                <input className="min-h-8 w-full outline-none" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <span className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                <Lock size={18} className="text-slate-400" />
                <input className="min-h-8 w-full outline-none" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </span>
            </label>
            {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <Button className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
