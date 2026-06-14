import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Plus, Save, CloudOff, Check } from 'lucide-react';

export const WardAudit = () => {
  const [isOffline] = useState(true);
  const [pendingSync, setPendingSync] = useState(3);
  const [auditStarted, setAuditStarted] = useState(false);
  const [formData, setFormData] = useState<{
    wardId: string;
    handHygiene: Record<string, boolean | string>;
    ppe: Record<string, boolean>;
    waste: Record<string, boolean>;
  }>({
    wardId: 'Ward 04',
    handHygiene: {
      gelAvailable: true,
      sinkFunctional: true,
      soapAvailable: false,
      staffCompliance: 'medium',
    },
    ppe: {
      glovesAvailable: true,
      masksAvailable: true,
      properDisposal: false,
    },
    waste: {
      colorCodedBins: true,
      sharpDisposal: true,
      noOverflow: false,
    }
  });

  const handleToggle = (category: keyof typeof formData, field: string) => {
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...(prev[category] as any),
        [field]: !(prev[category] as any)[field]
      }
    }));
  };

  const handleSave = () => {
    if (isOffline) {
      setPendingSync(prev => prev + 1);
    }
    setAuditStarted(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      {/* Offline Status Bar */}
      {isOffline && (
        <div className="bg-slate-800 text-white px-4 py-3 rounded-lg flex items-center justify-between text-sm shadow-sm sticky top-4 z-10">
          <div className="flex items-center gap-3">
            <CloudOff size={20} className="text-risk-amber" /> 
            <span className="font-medium">Offline Mode</span>
          </div>
          <span className="bg-slate-700 px-3 py-1 rounded-full text-xs font-bold">
            {pendingSync} pending sync
          </span>
        </div>
      )}

      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Daily Ward Audit</h1>
          <p className="text-slate-500 mt-1">Hygiene & Protocol Checklist</p>
        </div>
        {!auditStarted && (
          <Button onClick={() => setAuditStarted(true)} size="lg" className="hidden sm:flex">
            <Plus size={20} className="mr-2"/> New Audit
          </Button>
        )}
      </header>

      {!auditStarted ? (
        <Card className="border-dashed border-2 border-slate-300 bg-slate-50/50">
          <CardContent className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mb-4">
              <Check size={40} className="text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">Ready to inspect</h3>
            <p className="text-slate-500 mb-8 max-w-md">Begin a new ward audit. Your progress will be saved locally and synced automatically when back online.</p>
            <Button onClick={() => setAuditStarted(true)} size="lg" className="w-full sm:w-auto">
              <Plus size={20} className="mr-2"/> Start New Audit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Ward Selection (Mock) */}
          <Card>
            <CardContent className="p-4 md:p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Select Ward</label>
              <select className="w-full border-slate-300 rounded-lg p-4 text-lg bg-slate-50 min-h-[56px] focus:ring-brand focus:border-brand">
                <option>Ward 04 (General Medicine)</option>
                <option>Ward 05 (Maternity)</option>
                <option>ICU</option>
              </select>
            </CardContent>
          </Card>

          {/* Checklist Sections */}
          <div className="space-y-4">
            <ChecklistSection 
              title="1. Hand Hygiene Facilities" 
              data={formData.handHygiene} 
              category="handHygiene" 
              onToggle={handleToggle} 
            />
            <ChecklistSection 
              title="2. PPE Availability & Usage" 
              data={formData.ppe} 
              category="ppe" 
              onToggle={handleToggle} 
            />
            <ChecklistSection 
              title="3. Waste Segregation" 
              data={formData.waste} 
              category="waste" 
              onToggle={handleToggle} 
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setAuditStarted(false)}>
              Cancel
            </Button>
            <Button size="lg" className="flex-1 bg-risk-green hover:bg-green-700 text-white" onClick={handleSave}>
              <Save size={20} className="mr-2"/> Save Audit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component for checklist sections
const ChecklistSection = ({ title, data, category, onToggle }: any) => (
  <Card className="overflow-hidden border-slate-200">
    <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
      <CardTitle className="text-lg text-slate-800">{title}</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <div className="divide-y divide-slate-100">
        {Object.entries(data).map(([key, value]) => {
          if (typeof value === 'boolean') {
            return (
              <label key={key} className="flex items-center justify-between p-4 md:p-6 cursor-pointer hover:bg-slate-50 transition-colors">
                <span className="text-base md:text-lg text-slate-700 font-medium capitalize select-none">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <div className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={value as boolean}
                    onChange={() => onToggle(category, key)}
                  />
                  <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-risk-green"></div>
                </div>
              </label>
            );
          }
          return null;
        })}
      </div>
    </CardContent>
  </Card>
);