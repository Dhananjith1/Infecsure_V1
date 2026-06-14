import { Card, CardContent } from '../../components/ui/card';
import { Link } from 'react-router-dom';
import { AlertCircle, Droplets, Info, ShieldAlert } from 'lucide-react';
import { useState, useEffect } from 'react';

export const PublicNotice = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto flex flex-col min-h-[calc(100vh-4rem)]">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Hospital Notice Board</h1>
          <p className="text-slate-500 mt-1 font-medium">{time.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <Link to="/login" className="text-brand hover:underline font-medium text-sm border border-slate-200 px-4 py-2 rounded-lg bg-white shadow-sm">Staff Login →</Link>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
        
        {/* Alerts Section */}
        <div className="space-y-6">
          <Card className="border-l-4 border-l-risk-amber bg-risk-amber/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-risk-amber/20 rounded-full mt-1">
                  <ShieldAlert className="text-risk-amber" size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Notice: Dengue Precaution</h3>
                  <p className="text-slate-700 leading-relaxed font-medium">
                    Due to a recent increase in regional Dengue cases, visitors must ensure they use mosquito repellent. Restricted visitation hours apply to Ward 04 until further notice.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-risk-green">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-risk-green/20 rounded-full mt-1">
                  <Info className="text-risk-green" size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">General Hospital Status</h3>
                  <p className="text-slate-700 leading-relaxed font-medium">
                    All other wards are operating normally. Routine screening procedures are in place at the main entrance.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Hygiene Reminders */}
        <div className="space-y-6">
          <Card className="border-slate-200 h-full">
            <CardContent className="p-8 h-full flex flex-col justify-center items-center text-center">
              <div className="p-6 bg-brand/10 rounded-full mb-6">
                <Droplets className="text-brand" size={64} />
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-4">Practice Hand Hygiene</h2>
              <p className="text-lg text-slate-600 max-w-sm mb-8 font-medium leading-relaxed">
                Please sanitize your hands before entering and after leaving patient areas to protect our vulnerable patients.
              </p>
              
              <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-center gap-3">
                <AlertCircle className="text-slate-400" />
                <span className="text-slate-600 font-semibold uppercase tracking-wider text-sm">Sanitizer stations available at all entrances</span>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};