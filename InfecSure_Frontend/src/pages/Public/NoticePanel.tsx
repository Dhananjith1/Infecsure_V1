import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { listNotices } from "../../api/notices";
import { Card, CardBody, CardHeader } from "../../components/Card";
import type { Notice } from "../../types";

export function NoticePanel() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "portal";

  useEffect(() => {
    listNotices().then(setNotices).catch(() => setNotices([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Hospital Staff Portal</h1>
        <p className="mt-2 text-lg text-slate-600">Read-only staff awareness with no patient names, BHT numbers, or case-level details.</p>
      </div>

      {activeTab === "portal" ? (
        <Card>
          <CardHeader title="Shared Access Portal" description="General staff use shared read-only credentials for situational awareness." />
          <CardBody className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
              <ShieldCheck size={24} />
              <p className="mt-3 text-lg font-semibold">Read-only access</p>
              <p className="mt-2 text-sm leading-6">Staff users cannot create audits, lab records, notices, reports, or clinical instructions.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-slate-800">
              <p className="text-lg font-semibold">Heatmap and notices only</p>
              <p className="mt-2 text-sm leading-6">The portal focuses on ward-level risk and public hygiene notices.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-slate-800">
              <p className="text-lg font-semibold">No patient identifiers</p>
              <p className="mt-2 text-sm leading-6">Patient names, BHT numbers, and case-level clinical details are not displayed.</p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "notices" ? (
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
      ) : null}

      {activeTab === "anonymization" ? (
        <Card>
          <CardHeader title="Strict Data Anonymization Protocol" description="Public staff views mask sensitive patient information." />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
              <ShieldCheck size={24} />
              <p className="mt-3 text-lg font-semibold">Patient identifiers hidden</p>
              <p className="mt-2 text-sm leading-6">Names, BHT numbers, ward-bed references, lab report identifiers, and clinical case notes are not shown in this portal.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-slate-800">
              <p className="text-lg font-semibold">Ward-level awareness only</p>
              <p className="mt-2 text-sm leading-6">Staff can see environmental risk and general notices without accessing confidential patient data.</p>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
