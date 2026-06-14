import { Card, CardContent } from '../../components/ui/card';
import { WifiOff, Plus } from 'lucide-react';
export const WardAudit = () => (
  <div className="p-4 md:p-8 space-y-6">
    <div className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm max-w-fit">
      <WifiOff size={16} /> <span>Offline Mode Available - 3 audits pending sync</span>
    </div>
    <header>
      <h1 className="text-2xl font-bold text-slate-800">Daily Ward Audit</h1>
    </header>
    <Card>
      <CardContent className="p-8 text-center">
        <p className="text-slate-600 mb-4">Select a ward to begin the checklist</p>
        <button className="bg-brand text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 mx-auto">
          <Plus size={20}/> New Audit
        </button>
      </CardContent>
    </Card>
  </div>
);