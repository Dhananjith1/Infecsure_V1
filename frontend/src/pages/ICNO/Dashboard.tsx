import { ShieldCheck, TrendingUp, AlertTriangle, ListTodo, ChevronDown, ChevronUp, Info, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

export const ICNODashboard = () => {
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [priorityList, setPriorityList] = useState<any[]>([]);
  const [rootCauses, setRootCauses] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [dashboardRes, priorityRes, rootCauseRes] = await Promise.all([
          fetch('http://localhost:8000/alerts/analytics/dashboard', { headers }),
          fetch('http://localhost:8000/audits/priority-list', { headers }),
          fetch('http://localhost:8000/alerts/analytics/root-cause', { headers })
        ]);

        if (dashboardRes.ok) setStats(await dashboardRes.json());
        if (priorityRes.ok) setPriorityList(await priorityRes.json());
        if (rootCauseRes.ok) setRootCauses(await rootCauseRes.json());

      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const toggleTask = (id: number) => {
    setExpandedTask(expandedTask === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-brand" size={48} />
        <p className="text-slate-500 mt-4 font-medium">Loading AI Engine Insights...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">ICNO Overview</h1>
        <p className="text-slate-500">Daily outbreak risk & priority actions</p>
      </header>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-risk-pending hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Pending Validation</p>
                <h3 className="text-3xl font-bold text-slate-800">{stats?.pending_alerts || 0}</h3>
              </div>
              <div className="p-3 bg-risk-pending/10 rounded-lg">
                <ShieldCheck className="text-risk-pending" size={24} />
              </div>
            </div>
            <Link to="/icno/validation" className="text-sm font-medium text-brand mt-4 inline-block hover:underline font-semibold">
              Review Inbox →
            </Link>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-risk-amber hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Ward Compliance Avg</p>
                <h3 className="text-3xl font-bold text-slate-800">{stats?.average_compliance || 0}%</h3>
              </div>
              <div className="p-3 bg-risk-amber/10 rounded-lg">
                <TrendingUp className="text-risk-amber" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-risk-red hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Active High-Risk Wards</p>
                <h3 className="text-3xl font-bold text-slate-800">
                  {stats?.risk_distribution?.high || 0 + (stats?.risk_distribution?.critical || 0)}
                </h3>
              </div>
              <div className="p-3 bg-risk-red/10 rounded-lg">
                <AlertTriangle className="text-risk-red" size={24} />
              </div>
            </div>
            <Link to="/heatmap" className="text-sm font-medium text-brand mt-4 inline-block hover:underline font-semibold">
              View Heatmap →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Task List */}
        <div className="lg:col-span-2">
          <Card className="h-full border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/80 p-4 md:p-6">
              <div className="flex items-center gap-2">
                <ListTodo className="text-brand" size={24} />
                <CardTitle className="text-xl text-slate-800">Priority Tasks</CardTitle>
              </div>
              <p className="text-sm text-slate-500 mt-1">Generated by Risk-Weighted Heuristic Engine</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {priorityList.map((task, idx) => (
                  <div key={idx} className="p-4 md:p-6 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-1">
                          <span className={`px-3 py-1 text-xs font-bold rounded-full border uppercase tracking-wide ${idx === 0 ? 'bg-risk-red/10 text-risk-red border-risk-red/20' : 'bg-risk-amber/10 text-risk-amber border-risk-amber/20'}`}>
                            Priority {task.rank || idx + 1}
                          </span>
                          <h4 className="font-bold text-slate-800 text-lg">{task.recommended_action || "Audit Review Required"}</h4>
                        </div>
                        <p className="text-slate-600 mt-2 font-medium">{task.ward_name}</p>
                        <p className="text-sm text-slate-500 mt-1">
                           Compliance Deficit: {task.compliance_deficit}%. Recent Lab Anomalies: {task.anomaly_count || 0}. Max Pathogen Virulence: {task.max_virulence || 0}.
                        </p>
                        
                        <button 
                          onClick={() => toggleTask(idx)}
                          className="mt-4 text-sm font-medium text-brand flex items-center gap-1 hover:underline"
                        >
                          {expandedTask === idx ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                          View Heuristic Breakdown
                        </button>

                        {expandedTask === idx && (
                          <div className="mt-4 p-4 bg-slate-100 rounded-lg animate-in fade-in slide-in-from-top-2">
                             <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Risk Calculation: P = (w1·C) + (w2·V) + (w3·L)</h5>
                             <div className="grid grid-cols-3 gap-4">
                               <div className="bg-white p-3 rounded shadow-sm border border-slate-200">
                                 <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Info size={12}/> Clinical (C)</p>
                                 <p className="text-lg font-bold text-risk-red">{(task.compliance_deficit / 100).toFixed(2)}</p>
                               </div>
                               <div className="bg-white p-3 rounded shadow-sm border border-slate-200">
                                 <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Info size={12}/> Virulence (V)</p>
                                 <p className="text-lg font-bold text-risk-amber">{task.max_virulence.toFixed(2)}</p>
                               </div>
                               <div className="bg-white p-3 rounded shadow-sm border border-slate-200">
                                 <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Info size={12}/> Logistics (L)</p>
                                 <p className="text-lg font-bold text-risk-red">{task.recent_lab_count}</p>
                               </div>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {priorityList.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    No priority tasks detected.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Root Cause Associations */}
        <div className="lg:col-span-1">
          <Card className="h-full border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/80 p-4 md:p-6">
              <CardTitle className="text-xl text-slate-800 flex items-center gap-2">
                 Root Cause Insights
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">Apriori association engine</p>
            </CardHeader>
            <CardContent className="p-4 md:p-6 space-y-4">
              {rootCauses.length > 0 && !rootCauses[0].error ? rootCauses.slice(0, 3).map((rule, idx) => (
                <div key={idx} className={`p-5 rounded-xl border relative overflow-hidden ${rule.confidence > 0.7 ? 'bg-risk-amber/10 border-risk-amber/30' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`absolute top-0 left-0 w-1 h-full ${rule.confidence > 0.7 ? 'bg-risk-amber' : 'bg-slate-400'}`}></div>
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${rule.confidence > 0.7 ? 'text-risk-amber' : 'text-slate-500'}`}>
                      {rule.confidence > 0.7 ? 'Strong Link' : 'Moderate Link'}
                    </span>
                    <span className="text-xs font-bold bg-white text-slate-600 px-2 py-1 rounded shadow-sm">
                      {(rule.confidence * 100).toFixed(0)}% Conf
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: rule.interpretation.replace(/\[/g, '<span class="font-bold underline decoration-2 ' + (rule.confidence > 0.7 ? 'decoration-risk-amber/50' : 'decoration-slate-300') + '">').replace(/\]/g, '</span>') }}></p>
                </div>
              )) : (
                <div className="p-4 text-center text-slate-500 text-sm">
                  {rootCauses[0]?.message || rootCauses[0]?.error || "Not enough data for Apriori association mining. Complete more audits."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
