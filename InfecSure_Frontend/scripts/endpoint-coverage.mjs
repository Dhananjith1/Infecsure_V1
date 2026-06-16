const API_BASE = process.env.VITE_API_BASE_URL || process.env.INFECSURE_API_BASE_URL || "http://127.0.0.1:8000";

const roles = {
  icno: {
    email: process.env.INFEC_TEST_ICNO_EMAIL || "icno@infecsure.com",
    password: process.env.INFEC_TEST_ICNO_PASSWORD || process.env.SEED_ICNO_PASSWORD || "",
  },
  sister: {
    email: process.env.INFEC_TEST_SISTER_EMAIL || "matron@infecsure.com",
    password: process.env.INFEC_TEST_SISTER_PASSWORD || process.env.SEED_SISTER_PASSWORD || "",
  },
  lab: {
    email: process.env.INFEC_TEST_LAB_EMAIL || "lab@infecsure.com",
    password: process.env.INFEC_TEST_LAB_PASSWORD || process.env.SEED_LAB_PASSWORD || "",
  },
  doctor: {
    email: process.env.INFEC_TEST_DOCTOR_EMAIL || "doctor@infecsure.com",
    password: process.env.INFEC_TEST_DOCTOR_PASSWORD || process.env.SEED_DOCTOR_PASSWORD || "",
  },
  staff: {
    email: process.env.INFEC_TEST_STAFF_EMAIL || "staff@infecsure.com",
    password: process.env.INFEC_TEST_STAFF_PASSWORD || process.env.SEED_STAFF_PASSWORD || "",
  },
};

const allowMutations = process.env.INFEC_TEST_MUTATION === "1";
const tokens = {};
const rows = [];

function push(name, method, path, role, status, verdict, detail = "") {
  rows.push({ name, method, path, role: role || "public", status, verdict, detail });
}

async function request({ name, method = "GET", path, role, body, headers = {}, expect = [200], mutation = false, formData }) {
  if (mutation && !allowMutations) {
    push(name, method, path, role, "SKIP", "SKIP_MUTATION", "Set INFEC_TEST_MUTATION=1 to run write/delete action.");
    return null;
  }
  if (role && !tokens[role]) {
    push(name, method, path, role, "BLOCKED", "NO_AUTH_TOKEN", `Set INFEC_TEST_${role.toUpperCase()}_PASSWORD.`);
    return null;
  }

  const requestHeaders = { ...headers };
  if (role) requestHeaders.Authorization = `Bearer ${tokens[role]}`;
  if (body && !formData) requestHeaders["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: requestHeaders,
      body: formData || (body ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    const ok = expect.includes(response.status);
    push(name, method, path, role, response.status, ok ? "PASS" : "FAIL", ok ? "" : text.slice(0, 180));
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  } catch (error) {
    push(name, method, path, role, "ERR", "NETWORK_ERROR", error.message);
    return null;
  }
}

async function login(role, email, password) {
  if (!password) {
    push("login", "POST", "/auth/login", role, "BLOCKED", "NO_PASSWORD", `Set INFEC_TEST_${role.toUpperCase()}_PASSWORD.`);
    return;
  }
  const data = await request({
    name: "login",
    method: "POST",
    path: "/auth/login",
    body: { email, password },
    expect: [200],
  });
  if (data?.access_token) tokens[role] = data.access_token;
}

async function main() {
  await request({ name: "root health", path: "/", expect: [200] });
  await request({ name: "detailed health", path: "/health", expect: [200] });
  await request({ name: "public heatmap", path: "/public/heatmap", expect: [200] });
  await request({ name: "invalid login guard", method: "POST", path: "/auth/login", body: { email: "invalid@example.com", password: "invalid" }, expect: [401, 503] });
  await request({ name: "invalid refresh guard", method: "POST", path: "/auth/refresh", body: { refresh_token: "invalid" }, expect: [401] });

  for (const [role, credentials] of Object.entries(roles)) {
    await login(role, credentials.email, credentials.password);
  }

  await request({ name: "me", path: "/auth/me", role: "icno", expect: [200] });
  await request({ name: "users list", path: "/users/", role: "icno", expect: [200] });
  await request({ name: "user detail missing", path: "/users/missing-user", role: "icno", expect: [404] });
  await request({ name: "user create", method: "POST", path: "/users/", role: "icno", mutation: true, expect: [201, 400], body: { email: "smoke-user@example.com", password: "temporary-password", full_name: "Smoke User", role: "staff" } });
  await request({ name: "user update missing", method: "PUT", path: "/users/missing-user", role: "icno", mutation: true, expect: [404], body: { full_name: "Smoke User", role: "staff" } });
  await request({ name: "user deactivate missing", method: "DELETE", path: "/users/missing-user", role: "icno", mutation: true, expect: [404] });

  await request({ name: "wards list", path: "/wards/", role: "staff", expect: [200] });
  await request({ name: "ward detail", path: "/wards/etu", role: "icno", expect: [200, 404] });
  await request({ name: "ward create", method: "POST", path: "/wards/", role: "icno", mutation: true, expect: [201, 400], body: { name: "ETU", bed_count: 10, floor: "Ground" } });
  await request({ name: "ward update", method: "PUT", path: "/wards/etu", role: "icno", mutation: true, expect: [200, 404], body: { name: "ETU", bed_count: 10, floor: "Ground" } });
  await request({ name: "ward delete missing", method: "DELETE", path: "/wards/missing-ward", role: "icno", mutation: true, expect: [404] });
  await request({ name: "ward audits", path: "/wards/etu/audits", role: "icno", expect: [200] });
  await request({ name: "ward lab results", path: "/wards/etu/lab-results", role: "icno", expect: [200] });
  await request({ name: "ward predict", method: "POST", path: "/wards/etu/predict", role: "icno", expect: [200, 404, 500] });

  await request({ name: "audits list", path: "/audits/", role: "icno", expect: [200] });
  await request({ name: "audit detail missing", path: "/audits/missing-audit", role: "icno", expect: [404] });
  await request({ name: "priority list", path: "/audits/priority-list", role: "icno", expect: [200] });
  await request({ name: "audit create", method: "POST", path: "/audits/", role: "icno", mutation: true, expect: [201, 400, 404], body: {
    ward_id: "etu",
    hand_hygiene_score: 90,
    hand_hygiene_items: [{ item_name: "Hand hygiene stations stocked", compliant: true }],
    ppe_score: 90,
    ppe_items: [{ item_name: "PPE compliance", compliant: true }],
    waste_segregation_score: 90,
    waste_segregation_items: [{ item_name: "Garbage removed", compliant: true }],
    environmental_score: 90,
    environmental_items: [{ item_name: "Toilet hygiene", compliant: true }],
  } });
  await request({ name: "audit sync", method: "POST", path: "/audits/sync", role: "icno", mutation: true, expect: [201, 400, 404], body: { records: [] } });

  await request({ name: "lab results list", path: "/lab-results/", role: "lab", expect: [200] });
  await request({ name: "lab result detail missing", path: "/lab-results/missing-result", role: "lab", expect: [404] });
  await request({ name: "lab result create", method: "POST", path: "/lab-results/", role: "lab", mutation: true, expect: [201, 400, 404], body: { ward_id: "etu", pathogen_id: "dengue", pathogen_name: "Dengue", specimen_type: "blood", result_date: new Date().toISOString() } });
  await request({ name: "lab pathogen create", method: "POST", path: "/lab/pathogens", role: "lab", mutation: true, expect: [201, 400], body: { name: "Smoke Pathogen", category: "virus", risk_level: "low" } });
  await request({ name: "lab 48h volume", path: "/lab/volume/48h?ward_id=etu&pathogen_id=dengue", role: "lab", expect: [200, 404] });

  await request({ name: "pathogens list", path: "/pathogens/", role: "staff", expect: [200] });
  await request({ name: "pathogen detail missing", path: "/pathogens/missing-pathogen", role: "staff", expect: [404] });
  await request({ name: "pathogen stats missing", path: "/pathogens/missing-pathogen/stats", role: "staff", expect: [404] });
  await request({ name: "pathogen create", method: "POST", path: "/pathogens/", role: "icno", mutation: true, expect: [201, 400], body: { name: "Smoke Pathogen", category: "virus", risk_level: "low" } });
  await request({ name: "pathogen update missing", method: "PUT", path: "/pathogens/missing-pathogen", role: "icno", mutation: true, expect: [404], body: { name: "Smoke Pathogen", category: "virus", risk_level: "low" } });
  await request({ name: "pathogen delete missing", method: "DELETE", path: "/pathogens/missing-pathogen", role: "icno", mutation: true, expect: [404] });

  await request({ name: "alerts list", path: "/alerts/", role: "icno", expect: [200] });
  await request({ name: "pending alerts", path: "/alerts/pending", role: "icno", expect: [200] });
  await request({ name: "alert detail missing", path: "/alerts/missing-alert", role: "icno", expect: [404] });
  await request({ name: "alert validate missing", method: "POST", path: "/alerts/validate/missing-alert", role: "icno", mutation: true, expect: [404], body: { icno_notes: "smoke" } });
  await request({ name: "alert reject missing", method: "POST", path: "/alerts/reject/missing-alert", role: "icno", mutation: true, expect: [404], body: { icno_notes: "smoke" } });
  await request({ name: "alert dispatch missing", method: "POST", path: "/alerts/dispatch/missing-alert?to_email=smoke@example.com", role: "icno", mutation: true, expect: [404] });
  await request({ name: "dashboard analytics", path: "/alerts/analytics/dashboard", role: "icno", expect: [200] });
  await request({ name: "root cause analytics", path: "/alerts/analytics/root-cause", role: "icno", expect: [200] });
  await request({ name: "management instructions", path: "/alerts/management-instructions", role: "doctor", expect: [200] });
  for (const suffix of ["instructions", "doctor-acknowledge", "acknowledge"]) {
    await request({ name: `doctor ${suffix} missing`, method: "POST", path: `/alerts/missing-alert/${suffix}`, role: "doctor", mutation: true, expect: [404], body: { acknowledgement_notes: "smoke", management_instructions: "smoke", follow_up_required: false } });
  }

  await request({ name: "gate pending", path: "/gate/pending", role: "icno", expect: [200] });
  await request({ name: "gate validate missing", method: "POST", path: "/gate/validate", role: "icno", mutation: true, expect: [404], body: { alert_id: "missing-alert", decision: "approve", icno_notes: "smoke" } });

  await request({ name: "heatmap", path: "/heatmap/", role: "staff", expect: [200] });
  await request({ name: "heatmap refresh", method: "POST", path: "/heatmap/refresh", role: "icno", mutation: true, expect: [200, 500] });

  await request({ name: "notices list", path: "/notices/", role: "staff", expect: [200] });
  await request({ name: "notice create", method: "POST", path: "/notices/", role: "sister", mutation: true, expect: [201], body: { title: "Smoke notice", body: "Smoke notice", is_pinned: false } });
  await request({ name: "notice delete missing", method: "DELETE", path: "/notices/missing-notice", role: "icno", mutation: true, expect: [200, 404] });

  await request({ name: "ocr queue", path: "/ocr/queue", role: "icno", expect: [200] });
  await request({ name: "ocr pending", path: "/ocr/pending", role: "icno", expect: [200] });
  await request({ name: "ocr detail missing", path: "/ocr/missing-scan", role: "icno", expect: [404] });
  await request({ name: "ocr scan invalid image", method: "POST", path: "/ocr/scan", role: "icno", mutation: true, expect: [201, 400, 500], body: { image_base64: "AA==", form_type: "general" } });
  await request({ name: "ocr process invalid image", method: "POST", path: "/ocr/process", role: "icno", mutation: true, expect: [201, 400, 500], body: { image_base64: "AA==", form_type: "general" } });
  await request({ name: "ocr confirm missing", method: "POST", path: "/ocr/confirm", role: "icno", mutation: true, expect: [404], body: { scan_id: "missing-scan", corrected_fields: {} } });
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  const formData = new FormData();
  formData.append("file", png, "smoke.png");
  formData.append("form_type", "general");
  await request({ name: "ocr upload invalid image", method: "POST", path: "/ocr/upload", role: "icno", mutation: true, expect: [201, 400, 500], formData });

  await request({ name: "reports list", path: "/reports/", role: "sister", expect: [200] });
  await request({ name: "executive report", method: "POST", path: "/reports/executive", role: "sister", mutation: true, expect: [201, 500], body: { report_type: "executive_summary", format: "pdf" } });
  await request({ name: "dengue report missing", method: "POST", path: "/reports/dengue?alert_id=missing-alert", role: "doctor", mutation: true, expect: [404] });
  await request({ name: "report download missing", path: "/reports/download/missing-report", role: "sister", expect: [404] });

  const fail = rows.filter((row) => row.verdict === "FAIL" || row.verdict === "NETWORK_ERROR");
  const blocked = rows.filter((row) => row.verdict === "NO_PASSWORD" || row.verdict === "NO_AUTH_TOKEN");
  const skipped = rows.filter((row) => row.verdict === "SKIP_MUTATION");

  console.table(rows);
  console.log(`SUMMARY pass=${rows.filter((row) => row.verdict === "PASS").length} blocked=${blocked.length} skipped=${skipped.length} fail=${fail.length}`);
  if (blocked.length) console.log("BLOCKED: provide INFEC_TEST_*_PASSWORD values for full protected endpoint testing.");
  if (skipped.length) console.log("SKIPPED MUTATIONS: set INFEC_TEST_MUTATION=1 to run write/delete/upload actions.");
  if (fail.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
