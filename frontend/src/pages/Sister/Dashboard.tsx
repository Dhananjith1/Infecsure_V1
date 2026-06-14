import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { FileText, Download, TrendingUp, Users, Activity, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

const mockTrendData = [
  { name: 'Mon', dengue: 2, influenza: 5 },
  { name: 'Tue', dengue: 3, influenza: 6 },
  { name: 'Wed', dengue: 8, influenza: 4 }, // Spike
  { name: 'Thu', dengue: 9, influenza: 5 },
  { name: 'Fri', dengue: 4, influenza: 3 },
  { name: 'Sat', dengue: 2, influenza: 4 },
  { name: 'Sun', dengue: 1, influenza: 2 },
];

const mockComplianceData = [
  { id: 1, ward: 'Ward 04 (General)', compliance: '68%', status: 'amber' },
  { id: 2, ward: 'Ward 05 (Maternity)', compliance: '92%', status: 'green' },
  { id: 3, ward: 'ICU', compliance: '98%', status: 'green' },
  { id: 4, ward: 'Ward 02 (Pediatrics)', compliance: '55%', status: 'red' },
];

const mockAlerts = [
  { id: 1, text: 'Confirmed Dengue Outbreak - Ward 04', date: 'Today, 09:30 AM' },
  { id: 2, text: 'Hand Hygiene Protocol update issued for Pediatric Ward', date: 'Yesterday, 14:15 PM' },
];

export const SisterDashboard = () => {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Executive Dashboard</h1>
          <p className="text-slate-500">Validated hospital KPIs and trend reports</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="text-brand">
            <FileText size={16} className="mr-2" /> Export PDF
          </Button>
          <Button variant="outline" className="text-risk-green">
            <Download size={16} className="mr-2" /> Export Excel
          </Button>
        </div>
      </header>

      {/* Validated KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-brand">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Total Validated Cases</p>
                <h3 className="text-3xl font-bold text-slate-800">24</h3>
              </div>
              <div className="p-3 bg-brand/10 rounded-lg">
                <Users className="text-brand" size={24} />
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-4">Current Week</p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-risk-amber">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Overall Ward Compliance</p>
                <h3 className="text-3xl font-bold text-slate-800">78%</h3>
              </div>
              <div className="p-3 bg-risk-amber/10 rounded-lg">
                <CheckCircle2 className="text-risk-amber" size={24} />
              </div>
            </div>
            <p className="text-sm text-risk-amber mt-4 font-medium flex items-center gap-1">
              <TrendingUp size={16}/> Target: 85%
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-risk-red">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Critical Anomalies</p>
                <h3 className="text-3xl font-bold text-slate-800">1</h3>
              </div>
              <div className="p-3 bg-risk-red/10 rounded-lg">
                <Activity className="text-risk-red" size={24} />
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-4">Approved by ICNO</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Infection Trends Chart */}
        <div className="lg:col-span-2">
          <Card className="h-full border-slate-200">
            <CardHeader className="bg-slate-50 border-b border-slate-100">
              <CardTitle className="text-lg text-slate-800">Pathogen Detection Trends (Validated)</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" tick={{fill: '#64748b'}} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" tick={{fill: '#64748b'}} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <ReferenceLine y={6} stroke="#F59E0B" strokeDasharray="3 3" label={{ position: 'top', value: 'Threshold', fill: '#F59E0B', fontSize: 12 }} />
                    <Line type="monotone" dataKey="dengue" name="Dengue Cases" stroke="#DC2626" strokeWidth={3} dot={{r: 4, fill: '#DC2626'}} activeDot={{r: 6}} />
                    <Line type="monotone" dataKey="influenza" name="Influenza A/B" stroke="#0F4C5C" strokeWidth={3} dot={{r: 4, fill: '#0F4C5C'}} activeDot={{r: 6}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500 mt-4 text-center">Data points represent 100% validated cases only. Excludes pending validation gate items.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          {/* Ward Compliance Summary */}
          <Card className="border-slate-200">
            <CardHeader className="bg-slate-50 border-b border-slate-100">
              <CardTitle className="text-lg text-slate-800">Ward Compliance Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {mockComplianceData.map((row) => (
                  <div key={row.id} className="p-4 flex justify-between items-center">
                    <span className="font-medium text-slate-700">{row.ward}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      row.status === 'green' ? 'bg-risk-green/10 text-risk-green' :
                      row.status === 'amber' ? 'bg-risk-amber/10 text-risk-amber' :
                      'bg-risk-red/10 text-risk-red'
                    }`}>
                      {row.compliance}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Validated Alert Feed */}
          <Card className="border-slate-200">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-3">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">ICNO Approved Alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {mockAlerts.map(alert => (
                <div key={alert.id} className="flex gap-3">
                  <div className="mt-1"><CheckCircle2 size={16} className="text-risk-green" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{alert.text}</p>
                    <p className="text-xs text-slate-500 mt-1">{alert.date}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};