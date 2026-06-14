import { Card, CardContent } from '../../components/ui/card';
export const SisterDashboard = () => (
  <div className="p-4 md:p-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-800">Executive Dashboard</h1>
    </header>
    <Card>
      <CardContent className="p-8 text-center">
        <p className="text-slate-600">Validated reports and KPI summaries appear here.</p>
      </CardContent>
    </Card>
  </div>
);