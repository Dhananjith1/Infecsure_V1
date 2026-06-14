import { useState } from 'react';
import { useAuth, type UserRole } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>('ICNO');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock login simulating FastAPI backend response
    login('mock-jwt-token-xyz', {
      id: 'usr-1',
      name: `Demo ${role}`,
      role: role
    });
    
    // Route to appropriate dashboard based on role
    switch(role) {
      case 'ICNO': navigate('/icno/dashboard'); break;
      case 'Sister': navigate('/sister/dashboard'); break;
      case 'Lab': navigate('/lab/entry'); break;
      case 'Doctor': navigate('/doctor/inbox'); break;
      case 'Staff': navigate('/public'); break;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 border border-slate-100">
        <div className="flex justify-center mb-6">
          <div className="bg-brand-light p-3 rounded-full text-white">
            <Activity size={32} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">InfecSure</h1>
        <p className="text-center text-slate-500 mb-8">Infection Monitoring & Response System</p>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Role Simulator (Dev Only)</label>
            <select 
              value={role} 
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="ICNO">ICNO (Full Admin)</option>
              <option value="Sister">Nursing Sister (Executive)</option>
              <option value="Lab">Lab Personnel</option>
              <option value="Doctor">Supervising Doctor</option>
              <option value="Staff">General Staff</option>
            </select>
          </div>
          <button 
            type="submit"
            className="w-full bg-brand text-white py-3 rounded-lg font-medium hover:bg-brand-light transition-colors min-h-[48px]"
          >
            Access System
          </button>
        </form>
      </div>
    </div>
  );
};
