import { useEffect, useState } from "react";
import { getPublicHeatmap } from "../../api/heatmap";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import type { HeatmapWard } from "../../types";

export function HeatmapView() {
  const [wards, setWards] = useState<HeatmapWard[]>([]);

  useEffect(() => {
    getPublicHeatmap().then((data) => setWards(data.heatmap || [])).catch(() => setWards([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Read-only Ward Heatmap</h1>
        <p className="mt-2 text-lg text-slate-600">Validated ward risk only. No drill-down into individual patients.</p>
      </div>
      <Card>
        <CardHeader title="Hospital Risk Map" />
        <CardBody><HeatmapGrid wards={wards} publicMode /></CardBody>
      </Card>
    </div>
  );
}
