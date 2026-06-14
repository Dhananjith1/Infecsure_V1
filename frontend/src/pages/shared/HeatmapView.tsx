import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { MapPin, Activity, X, TrendingUp } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

const mockWards = [
  { id: 'W01', name: 'Ward 01 (OPD)', riskScore: 0.1, status: 'green', compliance: '94%', pathogens: ['None'] },
  { id: 'W02', name: 'Ward 02 (Pediatrics)', riskScore: 0.8, status: 'amber', compliance: '65%', pathogens: ['Influenza B'] },
  { id: 'W03', name: 'Ward 03 (Surgical)', riskScore: 0.2, status: 'green', compliance: '88%', pathogens: ['None'] },
  { id: 'W04', name: 'Ward 04 (General)', riskScore: 2.4, status: 'red', compliance: '52%', pathogens: ['Dengue'] },
  { id: 'W05', name: 'Ward 05 (Maternity)', riskScore: 0.1, status: 'green', compliance: '98%', pathogens: ['None'] },
  { id: 'W06', name: 'Ward 06 (Orthopedic)', riskScore: 0.4, status: 'green', compliance: '85%', pathogens: ['None'] },
  { id: 'ICU', name: 'Intensive Care Unit', riskScore: 1.2, status: 'amber', compliance: '75%', pathogens: ['MRSA'] },
  { id: 'LAB', name: 'Laboratory', riskScore: 0.3, status: 'green', compliance: '95%', pathogens: ['None'] },
];

const mockZScoreData = [
  { day: '1', score: 0.5 },
  { day: '2', score: 0.8 },
  { day: '3', score: 1.2 },
  { day: '4', score: 2.1 },
  { day: '5', score: 2.4 },
];

export const HeatmapView = () => {
  const [selectedWard, setSelectedWard] = useState<typeof mockWards[0] | null>(null);

  return (
    <div className="p-4 md:p-8 space-y-6 relative overflow-hidden h-full">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
          <MapPin className="text-brand" />
          Hospital Heatmap
        </h1>
        <p className="text-slate-500 mt-1">Real-time ward outbreak risk and compliance monitoring</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
        {/* Main Heatmap Grid */}
        <div className={`transition-all duration-300 ${selectedWard ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          <Card className="border-slate-200 shadow-sm bg-slate-50/50">
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-700">Campus Layout</h3>
                <div className="flex gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                   <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-risk-green"></div> Low</div>
                   <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-risk-amber"></div> Watch</div>
                   <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-risk-red"></div> Critical</div>
                </div>
              </div>
              
              {/* The Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {mockWards.map(ward => (
                  <button
                    key={ward.id}
                    onClick={() => setSelectedWard(ward)}
                    className={`
                      aspect-square rounded-xl p-4 flex flex-col justify-between text-left transition-all hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand/20
                      ${ward.status === 'green' ? 'bg-risk-green text-white shadow-risk-green/20' : ''}
                      ${ward.status === 'amber' ? 'bg-risk-amber text-white shadow-risk-amber/20' : ''}
                      ${ward.status === 'red' ? 'bg-risk-red text-white shadow-risk-red/20' : ''}
                      ${selectedWard?.id === ward.id ? 'ring-4 ring-offset-2 ring-slate-800' : 'shadow-md'}
                    `}
                  >
                    <div className="font-bold text-lg">{ward.id}</div>
                    <div>
                      <div className="text-sm font-medium opacity-90 truncate">{ward.name}</div>
                      <div className="text-xs opacity-75 mt-1 font-mono bg-black/10 inline-block px-2 py-0.5 rounded">Risk: {ward.riskScore.toFixed(1)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side Drawer (Details) */}
        {selectedWard && (
          <div className="lg:col-span-1 fixed inset-y-0 right-0 w-full md:w-96 lg:static lg:w-auto bg-white lg:bg-transparent shadow-2xl lg:shadow-none z-50 lg:z-auto border-l lg:border-l-0 border-slate-200 flex flex-col animate-in slide-in-from-right duration-300">
            <Card className="h-full border-none lg:border-solid border-slate-200 rounded-none lg:rounded-xl shadow-none">
              <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row justify-between items-center sticky top-0 z-10">
                <div>
                  <CardTitle className="text-xl text-slate-800">{selectedWard.name}</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">ID: {selectedWard.id}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedWard(null)} className="lg:hidden text-slate-500 hover:text-slate-800">
                  <X size={24} />
                </Button>
              </CardHeader>
              
              <CardContent className="p-6 space-y-6 overflow-y-auto">
                {/* Risk Status */}
                <div className="space-y-2">
                   <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Outbreak Risk</h4>
                   <div className={`p-4 rounded-lg flex items-center justify-between ${
                     selectedWard.status === 'green' ? 'bg-risk-green/10 text-risk-green border border-risk-green/20' :
                     selectedWard.status === 'amber' ? 'bg-risk-amber/10 text-risk-amber border border-risk-amber/20' :
                     'bg-risk-red/10 text-risk-red border border-risk-red/20'
                   }`}>
                     <span className="font-bold text-lg">{selectedWard.status === 'green' ? 'Low' : selectedWard.status === 'amber' ? 'Moderate' : 'Critical'}</span>
                     <span className="font-mono bg-white/50 px-2 py-1 rounded text-sm font-bold shadow-sm">Z-Score: {selectedWard.riskScore}</span>
                   </div>
                </div>

                {/* Compliance */}
                <div className="space-y-2">
                   <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><TrendingUp size={14}/> Ward Compliance</h4>
                   <div className="flex items-end gap-2">
                     <span className="text-3xl font-bold text-slate-800">{selectedWard.compliance}</span>
                     <span className="text-sm text-slate-500 mb-1">Target: 85%</span>
                   </div>
                   <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                     <div 
                       className={`h-full ${parseInt(selectedWard.compliance) >= 85 ? 'bg-risk-green' : parseInt(selectedWard.compliance) >= 60 ? 'bg-risk-amber' : 'bg-risk-red'}`} 
                       style={{width: selectedWard.compliance}}
                     ></div>
                   </div>
                </div>

                {/* Pathogen Activity */}
                <div className="space-y-2">
                   <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Activity size={14}/> Recent Pathogens</h4>
                   <div className="flex flex-wrap gap-2">
                     {selectedWard.pathogens.map((p, i) => (
                       <span key={i} className={`px-3 py-1 rounded-full text-sm font-semibold border ${p === 'None' ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-risk-red/10 text-risk-red border-risk-red/20'}`}>
                         {p}
                       </span>
                     ))}
                   </div>
                </div>

                {/* Z-Score Trend Chart */}
                {selectedWard.status !== 'green' && (
                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Z-Score Trend (Last 5 Days)</h4>
                    <div className="h-32 w-full mt-2 bg-slate-50 rounded-lg p-2 border border-slate-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mockZScoreData}>
                          <YAxis hide domain={[0, 3]} />
                          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px', padding: '4px 8px' }}/>
                          <Line type="monotone" dataKey="score" stroke={selectedWard.status === 'red' ? '#DC2626' : '#F59E0B'} strokeWidth={3} dot={{r: 4}} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      
      {/* Mobile Backdrop for drawer */}
      {selectedWard && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setSelectedWard(null)}></div>
      )}
    </div>
  );
};