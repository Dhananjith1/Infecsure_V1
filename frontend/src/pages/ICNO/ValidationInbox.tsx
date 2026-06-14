import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Check, X, Edit2, AlertCircle, ShieldCheck, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useState } from 'react';

const mockQueue = [
  { 
    id: 1, 
    type: 'Risk Score', 
    item: 'Ward 04 Outbreak Risk', 
    summary: 'Critical Outbreak Risk detected in Ward 04.',
    detail: 'Z-Score shows 2.4 std dev above norm for Dengue over the past 48 hours. Correlates with 65% drop in hand hygiene compliance.', 
    aiConfidence: 'High', 
    triggersMoH: true,
    status: 'pending' 
  },
  { 
    id: 2, 
    type: 'OCR Record', 
    item: 'Hand Hygiene Audit - ICU', 
    summary: '14/15 compliances extracted from sheet.',
    detail: 'Extracted 14/15 compliances. Low confidence on signature field and date format (expected YYYY-MM-DD, found MM/DD/YY).', 
    aiConfidence: 'Low', 
    triggersMoH: false,
    status: 'pending' 
  }
];

export const ValidationInbox = () => {
  const [queue, setQueue] = useState(mockQueue);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{id: number, action: string, triggersMoH: boolean} | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  const handleActionClick = (id: number, action: string, triggersMoH: boolean) => {
    setSelectedAction({ id, action, triggersMoH });
    setModalOpen(true);
  };

  const confirmAction = () => {
    if (selectedAction) {
      setQueue(q => q.filter(i => i.id !== selectedAction.id));
    }
    setModalOpen(false);
    setSelectedAction(null);
  };

  const toggleExpand = (id: number) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Validation Gate</h1>
        <p className="text-slate-500 mt-1">Review and approve AI-generated insights and extracted records.</p>
      </header>

      {queue.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <ShieldCheck className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
          <p className="text-slate-500">No items pending validation.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((item) => (
            <Card key={item.id} className="border-l-4 border-l-risk-pending overflow-hidden">
              <div className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
                  <div className="space-y-1 flex-1 w-full">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">{item.type}</span>
                       {item.aiConfidence === 'High' ? (
                         <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-risk-green/10 text-risk-green flex items-center gap-1"><Check size={12} /> High Confidence</span>
                       ) : (
                         <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-risk-red/10 text-risk-red flex items-center gap-1"><AlertCircle size={12} /> Low Confidence</span>
                       )}
                       {item.triggersMoH && (
                         <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-risk-amber/10 text-risk-amber flex items-center gap-1"><ExternalLink size={12} /> MoH Alert Linked</span>
                       )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">{item.item}</h3>
                    <p className="text-slate-700 text-sm">{item.summary}</p>
                    
                    {/* Progressive Disclosure */}
                    <div className="mt-3">
                      <button 
                        onClick={() => toggleExpand(item.id)}
                        className="text-sm font-medium text-brand hover:underline flex items-center gap-1"
                      >
                        {expandedItems[item.id] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                        Why is this flagged?
                      </button>
                      
                      {expandedItems[item.id] && (
                        <div className="mt-2 text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-100 animate-in fade-in slide-in-from-top-2">
                          <span className="font-semibold block mb-1 text-slate-800">AI Reasoning:</span>
                          {item.detail}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <Button variant="outline" className="text-slate-600" onClick={() => handleActionClick(item.id, 'Reject', false)}><X size={16} className="mr-2" /> Reject</Button>
                    <Button variant="outline" className="text-brand" onClick={() => handleActionClick(item.id, 'Edit', false)}><Edit2 size={16} className="mr-2" /> Edit</Button>
                    <Button className="bg-brand hover:bg-brand-light text-white" onClick={() => handleActionClick(item.id, 'Approve', item.triggersMoH)}><Check size={16} className="mr-2" /> Approve</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {modalOpen && selectedAction && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[100] animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-full ${selectedAction.action === 'Approve' ? 'bg-risk-green/10 text-risk-green' : 'bg-risk-amber/10 text-risk-amber'}`}>
                {selectedAction.action === 'Approve' ? <Check size={24} /> : <AlertCircle size={24} />}
              </div>
              <h3 className="text-lg font-bold text-slate-800">Confirm {selectedAction.action}</h3>
            </div>
            
            <div className="space-y-4 mb-6">
              <p className="text-slate-600">
                {selectedAction.action === 'Approve' 
                  ? "Are you sure you want to validate and confirm this AI output?"
                  : "This will remove the item from the queue and permanently discard the AI insight."}
              </p>
              
              {selectedAction.action === 'Approve' && selectedAction.triggersMoH && (
                <div className="bg-risk-amber/10 border-l-4 border-risk-amber p-4 rounded-r-md">
                  <h4 className="text-risk-amber font-bold flex items-center gap-2 mb-1">
                    <AlertCircle size={16} /> External Action Warning
                  </h4>
                  <p className="text-sm text-slate-700">
                    Approving this item will automatically generate and dispatch an Outbreak Notification email to the Ministry of Health (epid@health.gov.lk).
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button variant="outline" size="lg" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button 
                size="lg"
                onClick={confirmAction}
                className={selectedAction.action === 'Approve' ? 'bg-brand hover:bg-brand-light text-white' : 'bg-risk-red hover:bg-red-600 text-white'}
              >
                Confirm {selectedAction.action}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};