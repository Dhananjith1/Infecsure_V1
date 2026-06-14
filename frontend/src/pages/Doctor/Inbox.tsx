import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { FileCheck, CheckCircle, Send, Clock, AlertTriangle } from 'lucide-react';

const mockReports = [
  { id: 1, ward: 'Ward 04', type: 'Dengue Outbreak', date: 'Today, 10:15 AM', status: 'pending', severity: 'critical' },
  { id: 2, ward: 'Maternity Ward', type: 'Dengue Case (Isolated)', date: 'Yesterday, 14:30 PM', status: 'acknowledged', severity: 'moderate' },
];

export const DoctorInbox = () => {
  const [reports, setReports] = useState(mockReports);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [instructionText, setInstructionText] = useState('');

  const handleAcknowledge = (id: number) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'acknowledged' } : r));
    setSelectedReport(null);
  };

  const handleIssueInstruction = (id: number) => {
    if (!instructionText.trim()) return;
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'acknowledged' } : r));
    setInstructionText('');
    setSelectedReport(null);
  };

  const pendingReports = reports.filter(r => r.status === 'pending');
  const historyReports = reports.filter(r => r.status === 'acknowledged');

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Specialist Inbox</h1>
        <p className="text-slate-500 mt-1">Review validated pathogen reports and issue instructions</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Report List */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                Requires Action
                <span className="bg-risk-red text-white text-xs px-2 py-0.5 rounded-full">{pendingReports.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {pendingReports.map(report => (
                  <button 
                    key={report.id} 
                    onClick={() => setSelectedReport(report.id)}
                    className={`w-full text-left p-4 transition-colors hover:bg-slate-50 ${selectedReport === report.id ? 'bg-brand/5 border-l-4 border-brand' : 'border-l-4 border-transparent'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-slate-800">{report.ward}</span>
                      <span className="text-xs text-slate-500">{report.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <AlertTriangle size={14} className="text-risk-red" />
                       <span className="text-sm font-medium text-risk-red">{report.type}</span>
                    </div>
                  </button>
                ))}
                {pendingReports.length === 0 && (
                  <div className="p-6 text-center text-slate-500 text-sm">No pending reports.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <Clock size={16}/> History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {historyReports.map(report => (
                  <div key={report.id} className="p-4 opacity-75">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-slate-700">{report.ward}</span>
                      <span className="text-xs text-slate-500">{report.date}</span>
                    </div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">
                      <CheckCircle size={14} className="text-risk-green" /> Acknowledged
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Detail View */}
        <div className="lg:col-span-2">
          {selectedReport ? (
            <Card className="border-slate-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
              <CardHeader className="bg-risk-red/5 border-b border-risk-red/10 pb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="bg-risk-red text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">Critical Priority</span>
                  <span className="bg-white border border-slate-200 text-slate-600 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                    <FileCheck size={12} /> ICNO Validated
                  </span>
                </div>
                <CardTitle className="text-2xl text-slate-800">Confirmed Dengue Outbreak</CardTitle>
                <p className="text-slate-600 font-medium">Origin: Ward 04 • Date: Today, 10:15 AM</p>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Clinical Context</h4>
                  <p className="text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
                    Z-Score anomaly detected in the last 48 hours indicates a significant spike in Dengue positive cases. 
                    Root cause analysis correlates this with a 65% drop in hand hygiene compliance and poor waste segregation in the ward.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Digital Management Instruction</h4>
                  <textarea 
                    value={instructionText}
                    onChange={(e) => setInstructionText(e.target.value)}
                    placeholder="Type instructions for ward staff (e.g. Isolate patients, enforce mosquito nets)..."
                    className="w-full p-4 rounded-lg border border-slate-300 focus:border-brand focus:ring-brand/20 min-h-[120px]"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button variant="outline" size="lg" className="flex-1 text-slate-700" onClick={() => handleAcknowledge(selectedReport)}>
                    <CheckCircle className="mr-2" size={18} /> Acknowledge Only
                  </Button>
                  <Button size="lg" className="flex-1 bg-brand hover:bg-brand-light text-white" onClick={() => handleIssueInstruction(selectedReport)}>
                    <Send className="mr-2" size={18} /> Issue Instruction
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full border-dashed border-2 border-slate-300 bg-slate-50/50 flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <FileCheck size={48} className="text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-600">Select a report</h3>
                <p className="text-slate-500 text-sm">Click a report from the queue to view details.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};