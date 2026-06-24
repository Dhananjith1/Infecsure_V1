import { useEffect, useState } from "react";
import { AlertTriangle, Check, Mail, Pencil, X } from "lucide-react";
import { approveAlert, dispatchMoh, listAlerts, listPendingAlerts, rejectAlert } from "../../api/alerts";
import { apiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { Card, CardBody, CardHeader } from "../../components/Card";
import { Modal } from "../../components/Modal";
import { RiskBadge } from "../../components/RiskBadge";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../hooks/useToast";
import type { AlertItem } from "../../types";

export function ValidationInbox() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [approvedItems, setApprovedItems] = useState<AlertItem[]>([]);
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | "dispatch" | null>(null);
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("moh-notifications@example.gov.lk");
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  function reload() {
    setLoading(true);
    Promise.all([listPendingAlerts(), listAlerts("approved")])
      .then(([pending, approved]) => {
        setItems(pending);
        setApprovedItems(approved);
      })
      .catch((err) => showToast({ type: "error", title: "Could not load approvals", message: apiErrorMessage(err) }))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  function open(item: AlertItem, nextDecision: "approve" | "reject" | "dispatch") {
    setSelected(item);
    setDecision(nextDecision);
    setNotes(item.icno_notes || "");
  }

  async function submitDecision() {
    if (!selected || !decision) return;
    try {
      if (decision === "approve") await approveAlert(selected.alert_id, notes);
      if (decision === "reject") await rejectAlert(selected.alert_id, notes);
      if (decision === "dispatch") await dispatchMoh(selected.alert_id, email);
      showToast({ type: "success", title: "Validation action saved" });
      setSelected(null);
      setDecision(null);
      reload();
    } catch (err) {
      showToast({ type: "error", title: "Action failed", message: apiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Pending Approvals</h1>
        <p className="mt-1 text-sm text-slate-600">AI-generated alerts and lab-derived signals remain pending until ICNO review.</p>
      </div>

      <Card>
        <CardHeader title="Validation Gate Queue" description="Approval publishes the item to permitted downstream roles. MoH dispatch requires a second confirmation." />
        <CardBody className="space-y-4">
          {loading ? <p className="text-sm text-slate-500">Loading queue...</p> : null}
          {!loading && !items.length ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">No items pending validation.</p> : null}
          {items.map((item) => (
            <article key={item.alert_id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    <RiskBadge level={item.severity} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.alert_type}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">{item.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-semibold text-clinical-700">Why is this flagged?</summary>
                    <pre className="mt-2 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(item.source_data || item, null, 2)}</pre>
                  </details>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button icon={<Check size={18} />} onClick={() => open(item, "approve")}>Approve</Button>
                  <Button variant="secondary" icon={<Pencil size={18} />} onClick={() => open(item, "approve")}>Edit notes</Button>
                  <Button variant="danger" icon={<X size={18} />} onClick={() => open(item, "reject")}>Reject</Button>
                  {item.alert_type === "moh_notification" ? <Button variant="secondary" icon={<Mail size={18} />} onClick={() => open(item, "dispatch")}>Dispatch MoH</Button> : null}
                </div>
              </div>
            </article>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="External Dispatch & Notification Protocol" description="Only ICNO-approved items can be emailed to the Supervising Doctor or external health authorities." />
        <CardBody className="space-y-4">
          {!approvedItems.length ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">No approved alerts ready for dispatch.</p> : null}
          {approvedItems.slice(0, 8).map((item) => (
            <article key={item.alert_id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2"><StatusBadge status={item.status} /><RiskBadge level={item.severity} /></div>
                  <h2 className="mt-3 font-semibold text-slate-950">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-700">{item.description}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">SOMRO/MoH dispatch-ready after ICNO approval</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<Mail size={18} />} onClick={() => open(item, "dispatch")}>Send to MoH</Button>
                  <Button variant="secondary" icon={<Mail size={18} />} onClick={() => { setEmail("doctor@infecsure.com"); open(item, "dispatch"); }}>Send to Doctor</Button>
                </div>
              </div>
            </article>
          ))}
        </CardBody>
      </Card>

      <Modal
        open={Boolean(selected && decision)}
        title={decision === "dispatch" ? "Confirm MoH email dispatch" : decision === "reject" ? "Reject pending item" : "Approve pending item"}
        onClose={() => setSelected(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
            <Button variant={decision === "reject" ? "danger" : "primary"} onClick={submitDecision}>
              Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle size={18} />
              <p>{decision === "dispatch" ? `This will send an authorized MoH notification for "${selected?.title}" to the selected recipient.` : `This will mark "${selected?.title}" as ${decision === "reject" ? "rejected" : "approved"}.`}</p>
            </div>
          </div>
          {decision === "dispatch" ? (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">SOMRO/MoH notification preview</p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="font-semibold text-slate-500">Ward</dt><dd className="text-slate-900">{selected?.ward_id || "Not specified"}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Alert type</dt><dd className="text-slate-900">{selected?.alert_type || "Clinical alert"}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Severity</dt><dd className="text-slate-900">{selected?.severity || "Not specified"}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Status</dt><dd className="text-slate-900">{selected?.status || "approved"}</dd></div>
                </dl>
                <p className="mt-3 text-sm leading-6 text-slate-700">{selected?.description}</p>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Recipient email</span>
                <input className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">ICNO notes</span>
              <textarea className="mt-1 min-h-28 w-full rounded-md border border-slate-300 p-3" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
