import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { getPublicHeatmap } from "../../api/heatmap";
import { listNotices } from "../../api/notices";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import type { HeatmapWard, Notice } from "../../types";

export function NoticePanel() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [wards, setWards] = useState<HeatmapWard[]>([]);

  useEffect(() => {
    listNotices().then(setNotices).catch(() => setNotices([]));
    getPublicHeatmap().then((data) => setWards(data.heatmap || [])).catch(() => setWards([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Hospital Staff Portal</h1>
        <p className="mt-2 text-lg text-slate-600">Read-only ward risk map and common safety notices for hospital staff.</p>
      </div>

      <Card>
        <CardHeader title="Hospital Risk Map" description="Validated ward-level risk status for staff awareness." />
        <CardBody>
          <HeatmapGrid wards={wards} publicMode />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Common Notice Panel" description="Current ward safety standards and hygiene compliance notices." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          {!notices.length ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
              <ShieldCheck size={24} />
              <p className="text-lg font-semibold">No active public notices.</p>
            </div>
          ) : null}
          {notices.map((notice, index) => (
            <article key={notice.notice_id || index} className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950">
              <div className="flex gap-3">
                <AlertTriangle size={26} />
                <div>
                  <h2 className="text-xl font-bold">{notice.title}</h2>
                  <p className="mt-2 text-lg leading-7">{notice.body || notice.message}</p>
                </div>
              </div>
            </article>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
