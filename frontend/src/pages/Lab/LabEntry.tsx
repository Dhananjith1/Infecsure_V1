import { Card, CardContent } from '../../components/ui/card';
export const LabEntry = () => (
  <div className="p-4 md:p-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-800">Lab Result Entry</h1>
    </header>
    <Card>
      <CardContent className="p-8 text-center pt-8">
        <p className="text-slate-600">Form for entering pathogen results goes here.</p>
      </CardContent>
    </Card>
  </div>
);