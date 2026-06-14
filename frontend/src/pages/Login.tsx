import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Activity, Loader2 } from 'lucide-react';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Invalid email or password');
      }

      const data = await response.json();

      // Safe parsing object
      const userObj = data.user || data;
      const userId = userObj.id || userObj.uid || userObj.user_id || 'default_id';
      const userRole = userObj.role || 'ICNO'; // Default to ICNO if not found
      const userName = userObj.full_name || userObj.name || userObj.email || email;
      const wardId = userObj.ward_id || null;

      login(data.access_token, {
        id: userId,
        name: userName,
        role: userRole,
        wardId: wardId
      });

      // FIXED: Convert role to uppercase and trim spaces to ensure accurate routing
      const exactRole = userRole.toString().toUpperCase().trim();

      switch (exactRole) {
        case 'ICNO':
          navigate('/icno/dashboard');
          break;
        case 'SISTER':
          navigate('/sister/dashboard');
          break;
        case 'LAB':
          navigate('/lab/entry');
          break;
        case 'DOCTOR':
          navigate('/doctor/inbox');
          break;
        default:
          // If it falls through, force navigate to ICNO Dashboard to avoid /public loop
          navigate('/icno/dashboard');
          break;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 border border-slate-100 transition-all duration-300">
        <div className="flex justify-center mb-6">
          <div className="bg-brand-light p-3 rounded-full text-white shadow-sm ring-4 ring-brand-light/20">
            <Activity size={32} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2 tracking-tight">InfecSure</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">Infection Monitoring & Response System</p>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium text-center animate-in fade-in slide-in-from-top-1">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
              placeholder="Enter your email"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
              placeholder="Enter your password"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand text-white py-3 rounded-lg font-bold hover:bg-brand-light hover:shadow-md transition-all active:scale-[0.98] min-h-[48px] flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Access System'}
          </button>
        </form>
      </div>
    </div>
  );
};