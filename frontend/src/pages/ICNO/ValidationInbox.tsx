import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Check, X, Edit2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

const mockQueue = [
  { id: 1, type: 'Risk Score', item: 'Ward 04 Outbreak Risk', detail: 'Z-Score shows 2.4 std dev above norm for Dengue.', aiConfidence: 'High', status: 'pending' },
  { id: 2, type: 'OCR Record', item: 'Hand Hygiene Audit - ICU', detail: 'Extracted 14/15 compliances. Low confidence on signature field.', aiConfidence: 'Low', status: 'pending' }
];

export const ValidationInbox = () => {
  const [queue, setQueue] = useState(mockQueue);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{id: number, action: string} | null>(null);

  const handleActionClick = (id: number, action: string) => {
    setSelectedAction({ id, action });
    setModalOpen(true);
  };

  const confirmAction = () => {
    if (selectedAction) {
      setQueue(q => q.filter(i => i.id !== selectedAction.id));
    }
    setModalOpen(false);
    setSelectedAction(null);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Validation Gate</h1>
        <p className="text-slate-500">Review and approve AI-generated insights and extracted records.</p>
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
              <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                     <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">{item.type}</span>
                     {item.aiConfidence === 'High' ? (
                       <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-risk-green/10 text-risk-green flex items-center gap-1"><Check size={12} /> High Confidence</span>
                     ) : (
                       <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-risk-red/10 text-risk-red flex items-center gap-1"><AlertCircle size={12} /> Low Confidence</span>
                     )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">{item.item}</h3>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded mt-2 border border-slate-100">
                    <span className="font-semibold block mb-1">AI Output:</span> {item.detail}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <Button variant="outline" className="text-slate-600" onClick={() => handleActionClick(item.id, 'Reject')}><X size={16} className="mr-2" /> Reject</Button>
                  <Button variant="outline" className="text-brand" onClick={() => handleActionClick(item.id, 'Edit')}><Edit2 size={16} className="mr-2" /> Edit</Button>
                  <Button className="bg-brand hover:bg-brand-light text-white" onClick={() => handleActionClick(item.id, 'Approve')}><Check size={16} className="mr-2" /> Approve</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {modalOpen && selectedAction && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-full ${selectedAction.action === 'Approve' ? 'bg-risk-green/10 text-risk-green' : 'bg-risk-amber/10 text-risk-amber'}`}>
                {selectedAction.action === 'Approve' ? <Check size={24} /> : <AlertCircle size={24} />}
              </div>
              <h3 className="text-lg font-bold">Confirm {selectedAction.action}</h3>
            </div>
            <p className="text-slate-600 mb-6">
              {selectedAction.action === 'Approve' 
                ? "This will validate the AI output. If this is a high-risk anomaly, it may automatically dispatch external MoH notifications."
                : "This will remove the item from the queue without saving the AI insight."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button 
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