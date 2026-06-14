import { ShieldCheck, TrendingUp, AlertTriangle, ListTodo } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Link } from 'react-router-dom';

export const ICNODashboard = () => {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">ICNO Overview</h1>
        <p className="text-slate-500">Daily outbreak risk & priority actions</p>
      </header>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Validations */}
        <Card className="border-l-4 border-l-risk-pending">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Pending Validation</p>
                <h3 className="text-3xl font-bold text-slate-800">3</h3>
              </div>
              <div className="p-3 bg-risk-pending/10 rounded-lg">
                <ShieldCheck className="text-risk-pending" size={24} />
              </div>
            </div>
            <Link to="/icno/validation" className="text-sm font-medium text-brand mt-4 inline-block hover:underline">
              Review Inbox →
            </Link>
          </CardContent>
        </Card>

        {/* Global Compliance */}
        <Card className="border-l-4 border-l-risk-amber">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Ward Compliance Avg</p>
                <h3 className="text-3xl font-bold text-slate-800">72%</h3>
              </div>
              <div className="p-3 bg-risk-amber/10 rounded-lg">
                <TrendingUp className="text-risk-amber" size={24} />
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-4">-4% from yesterday</p>
          </CardContent>
        </Card>

        {/* Active Outbreak Alerts */}
        <Card className="border-l-4 border-l-risk-red">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Active High-Risk Wards</p>
                <h3 className="text-3xl font-bold text-slate-800">2</h3>
              </div>
              <div className="p-3 bg-risk-red/10 rounded-lg">
                <AlertTriangle className="text-risk-red" size={24} />
              </div>
            </div>
            <Link to="/heatmap" className="text-sm font-medium text-brand mt-4 inline-block hover:underline">
              View Heatmap →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Task List */}
        <div className="lg:col-span-2">
          <Card className="h-full border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <ListTodo className="text-brand" size={20} />
                <CardTitle className="text-lg">Priority Tasks (Heuristic Sorted)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {/* Task Item 1 */}
                <div className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-800">Investigate Dengue Spike - Ward 04</h4>
                      <p className="text-sm text-slate-500 mt-1">Z-Score anomaly detected in recent 48h. Routine hygiene scored low.</p>
                      <div className="flex gap-2 mt-3">
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">C: 0.8</span>
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">V: 0.9</span>
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">L: 0.5</span>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-risk-red/10 text-risk-red text-xs font-bold rounded-full border border-risk-red/20">
                      Priority 1
                    </span>
                  </div>
                </div>
                {/* Task Item 2 */}
                <div className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-800">Audit Review - Maternity Ward</h4>
                      <p className="text-sm text-slate-500 mt-1">Hand hygiene compliance dropped below 60% threshold.</p>
                    </div>
                    <span className="px-3 py-1 bg-risk-amber/10 text-risk-amber text-xs font-bold rounded-full border border-risk-amber/20">
                      Priority 2
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Root Cause Associations */}
        <div className="lg:col-span-1">
          <Card className="h-full border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg">AI Insights: Root Causes</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="bg-risk-amber/10 p-4 rounded-lg border border-risk-amber/20">
                <p className="text-sm text-slate-800">
                  <span className="font-bold">Pattern:</span> Poor waste segregation in Ward 04 correlates strongly (85% confidence) with recent Dengue cases.
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <p className="text-sm text-slate-800">
                  <span className="font-bold">Pattern:</span> Missing PPE protocol in ICU correlates with anomalous pathogen spikes.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
