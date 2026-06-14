import { Card, CardContent } from '../../components/ui/card';
import { Camera } from 'lucide-react';

export const OCRScan = () => (
  <div className="p-4 md:p-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-800">OCR Scan-to-Verify</h1>
      <p className="text-slate-500">Scan handwritten Ward Audits or MoH forms</p>
    </header>
    <Card className="max-w-2xl mx-auto">
      <CardContent className="p-8 text-center space-y-4 pt-8">
        <div className="mx-auto w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center">
          <Camera size={40} className="text-slate-400" />
        </div>
        <p className="text-slate-600">Camera preview placeholder</p>
        <button className="bg-brand text-white px-6 py-3 rounded-lg font-medium">Start Camera</button>
      </CardContent>
    </Card>
  </div>
);