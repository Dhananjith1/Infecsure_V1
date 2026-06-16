import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { listNotices } from "../../api/notices";
import { Card, CardBody, CardHeader } from "../../components/Card";
import type { Notice } from "../../types";

export function NoticePanel() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    listNotices().then(setNotices).catch(() => setNotices([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Common Notice Panel</h1>
        <p className="mt-2 text-lg text-slate-600">General staff awareness. No patient names, BHT numbers, or case-level details.</p>
      </div>
      <Card>
        <CardHeader title="Current Notices" />
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
