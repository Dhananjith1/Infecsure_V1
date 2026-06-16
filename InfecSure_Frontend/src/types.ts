import type { LucideIcon } from "lucide-react";

export type UserRole = "icno" | "sister" | "lab" | "doctor" | "staff";

export type UserProfile = {
  uid: string;
  email: string;
  full_name?: string;
  role: UserRole;
  is_active?: boolean;
};

export type HeatmapWard = {
  ward_id: string;
  ward_name: string;
  ward_type?: string;
  floor?: string | number;
  risk_level: "low" | "medium" | "high" | "critical" | string;
  risk_score: number;
  compliance_score?: number;
  anomaly_count?: number;
  last_audit_date?: string | null;
  validated_alert_count?: number;
  status?: string;
};

export type AlertItem = {
  alert_id: string;
  alert_type?: string;
  ward_id?: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  status: "pending" | "approved" | "rejected" | "dispatched" | string;
  target_roles?: string[];
  source_data?: Record<string, unknown>;
  icno_notes?: string;
  created_at?: string;
};

export type LabResult = {
  result_id?: string;
  ward_id: string;
  pathogen_id?: string;
  pathogen_name: string;
  specimen_type: string;
  result_date: string;
  status?: "pending" | "approved";
  anomaly?: {
    is_anomaly: boolean;
    z_score: number;
    message?: string;
    severity?: string;
  };
  created_at?: string;
};

export type Notice = {
  notice_id?: string;
  title: string;
  body?: string;
  message?: string;
  severity?: string;
  ward_id?: string;
  created_at?: string;
};

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: UserRole[];
};

export type ToastMessage = {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
};
