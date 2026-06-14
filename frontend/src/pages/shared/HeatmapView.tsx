import { Card, CardContent } from '../../components/ui/card';
export const HeatmapView = () => (
  <div className="p-4 md:p-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-800">Hospital Heatmap</h1>
    </header>
    <Card>
      <CardContent className="p-8 text-center pt-8">
        <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300">
          <p className="text-slate-500">Interactive SVG map goes here.</p>
        </div>
      </CardContent>
    </Card>
  </div>
);