import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Camera, ScanLine, Check, AlertTriangle, FileText, Loader2, UploadCloud } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const OCRScan = () => {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'processing' | 'review'>('idle');
  const [extractedData, setExtractedData] = useState<any>({});
  const [scanId, setScanId] = useState<string | null>(null);
  const { user } = useAuth();

  const handleStartScan = async () => {
    setScanState('processing');
    try {
      const token = localStorage.getItem('token');
      // Using dummy image base64, normally would capture from camera
      const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      
      const response = await fetch('http://localhost:8000/ocr/process', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          image_base64: dummyBase64,
          form_type: 'hand_hygiene_audit'
        })
      });

      if (!response.ok) throw new Error("Failed to process OCR");

      const data = await response.json();
      
      // Map extracted fields
      const mappedData: any = {};
      Object.entries(data.extracted_fields || {}).forEach(([k, v]: [string, any]) => {
        mappedData[k] = {
          value: v.value,
          confidence: v.confidence > 0.8 ? 'high' : 'low'
        };
      });

      setExtractedData(mappedData);
      setScanId(data.scan_id);
      setScanState('review');
    } catch (err) {
      console.error(err);
      setScanState('idle');
      alert("Failed to connect to OCR service. Is the backend running?");
    }
  };

  const handleChange = (field: string, newValue: string) => {
    setExtractedData((prev: any) => ({
      ...prev,
      [field]: { ...prev[field], value: newValue, confidence: 'high' }
    }));
  };

  const handleSubmit = async () => {
    if (!scanId) return;
    setScanState('processing');
    
    try {
      const token = localStorage.getItem('token');
      const correctedFields: any = {};
      Object.entries(extractedData).forEach(([k, v]: [string, any]) => {
        correctedFields[k] = v.value;
      });

      const response = await fetch('http://localhost:8000/ocr/confirm', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          scan_id: scanId,
          corrected_fields: correctedFields
        })
      });

      if (!response.ok) throw new Error("Failed to confirm OCR record");

      setScanState('idle');
      alert("Success! Data confirmed and sent to validation queue.");
    } catch (err) {
      console.error(err);
      alert("Failed to confirm OCR record.");
      setScanState('review');
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">OCR Scan-to-Verify</h1>
        <p className="text-slate-500">Digitize legacy MoH notification forms and handwritten sheets</p>
      </header>

      {scanState === 'idle' && (
        <Card className="max-w-2xl mx-auto border-dashed border-2 border-slate-300">
          <CardContent className="p-12 text-center space-y-6 pt-12 flex flex-col items-center">
            <div className="w-24 h-24 bg-brand/10 rounded-full flex items-center justify-center">
              <Camera size={48} className="text-brand" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Ready to Scan</h3>
              <p className="text-slate-600 max-w-sm mx-auto">Place the document on a flat, well-lit surface and align it within the camera frame.</p>
            </div>
            <Button size="lg" className="px-8" onClick={() => setScanState('scanning')}>
              <ScanLine className="mr-2" /> Start Camera
            </Button>
          </CardContent>
        </Card>
      )}

      {scanState === 'scanning' && (
        <Card className="max-w-2xl mx-auto bg-slate-900 border-none overflow-hidden relative min-h-[500px]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[80%] h-[70%] border-2 border-brand relative flex items-center justify-center">
               <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand -mt-1 -ml-1"></div>
               <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand -mt-1 -mr-1"></div>
               <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand -mb-1 -ml-1"></div>
               <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand -mb-1 -mr-1"></div>
               <p className="text-white/50">Align document within frame</p>
            </div>
          </div>
          <div className="absolute bottom-6 w-full flex justify-center">
             <Button size="lg" className="px-8 bg-brand text-white hover:bg-brand-light" onClick={handleStartScan}>
               Capture Document
             </Button>
          </div>
        </Card>
      )}

      {scanState === 'processing' && (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-16 text-center flex flex-col items-center justify-center">
             <Loader2 size={48} className="text-brand animate-spin mb-6" />
             <h3 className="text-xl font-bold text-slate-800 mb-2">Processing Document...</h3>
             <p className="text-slate-500">Running AI text extraction and validation pipeline</p>
          </CardContent>
        </Card>
      )}

      {scanState === 'review' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card className="sticky top-4">
            <CardHeader className="bg-slate-50 border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera size={20} className="text-slate-500"/> Original Capture
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 bg-slate-200 min-h-[400px] flex items-center justify-center">
              <div className="w-3/4 h-64 bg-white shadow-md flex items-center justify-center text-slate-400 rotate-1">
                <FileText size={48} className="opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row justify-between items-center">
              <CardTitle className="text-lg">Extracted Data</CardTitle>
              <span className="bg-risk-amber/10 text-risk-amber text-xs font-bold px-3 py-1 rounded-full border border-risk-amber/20">
                Needs Review
              </span>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <p className="text-sm text-slate-600 mb-4">Please review fields with low confidence (highlighted in red) and correct them before submission.</p>
              
              <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
                {Object.entries(extractedData).map(([key, data]: [string, any]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 capitalize">{key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={data.value || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className={`w-full p-3 pr-10 rounded-lg border focus:outline-none transition-colors ${
                          data.confidence === 'high' 
                            ? 'border-risk-green/50 bg-risk-green/5 focus:border-risk-green focus:ring-1 focus:ring-risk-green' 
                            : 'border-risk-red text-risk-red font-semibold bg-risk-red/5 focus:border-risk-red focus:ring-1 focus:ring-risk-red'
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {data.confidence === 'high' 
                          ? <Check size={18} className="text-risk-green" />
                          : <AlertTriangle size={18} className="text-risk-red" />
                        }
                      </div>
                    </div>
                  </div>
                ))}
                {Object.keys(extractedData).length === 0 && (
                   <div className="text-slate-500 italic p-4 text-center border rounded">No fields could be automatically extracted.</div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setScanState('idle')}>Discard</Button>
                <Button className="flex-1 bg-brand text-white hover:bg-brand-light flex items-center justify-center gap-2" onClick={handleSubmit}>
                  <UploadCloud size={18} /> Submit to Validate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};