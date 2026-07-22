# InfecSure Backend — README

## AI-Powered Infection Monitoring and Outbreak Response System
**Divisional Hospital, Thalangama, Colombo, Sri Lanka**  
*IIT 372-2 Group Project — IIT 04 | Uva Wellassa University*

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.9+
- pip

### 2. Install Dependencies
```bash
cd "c:\Users\TUF\OneDrive\Desktop\Infecture demo"
pip install -r requirements.txt
```

### 3. Configure Environment
Copy `.env.example` to `.env` and fill in the values (already done with defaults).

### 4. Run the Server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Access Interactive API Docs
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🔑 Default Login Credentials

InfecSure verifies email/password login through Firebase Authentication.
Set `FIREBASE_WEB_API_KEY` in `.env`, and store each user's role in the
Firestore `users` collection.

Optional startup seed accounts use the `SEED_ICNO_PASSWORD`,
`SEED_SISTER_PASSWORD`, `SEED_LAB_PASSWORD`, `SEED_DOCTOR_PASSWORD`, and
`SEED_STAFF_PASSWORD` environment variables. Leave them blank to skip seeding.

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login → returns JWT tokens |
| POST | `/auth/refresh` | Refresh access token |
| GET  | `/auth/me` | Current user profile |

### Ward Management
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/wards/` | All roles |
| POST | `/wards/` | ICNO only |
| GET | `/wards/{id}` | All roles |
| PUT | `/wards/{id}` | ICNO only |
| DELETE | `/wards/{id}` | ICNO only |
| POST | `/wards/{id}/predict` | ICNO only — triggers Random Forest |

### Ward Audits
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/audits/` | ICNO only |
| GET | `/audits/` | All roles |
| GET | `/audits/priority-list` | ICNO only — Heuristic Engine |
| GET | `/audits/{id}` | All roles |

### Laboratory Results
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/lab-results/` | Lab / ICNO — triggers Z-Score |
| GET | `/lab-results/` | All roles (Staff: masked) |
| GET | `/lab-results/{id}` | All roles (Staff: masked) |

### Pathogens
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/pathogens/` | All roles |
| POST | `/pathogens/` | ICNO / Lab |
| GET/PUT/DELETE | `/pathogens/{id}` | ICNO only (write) |
| GET | `/pathogens/{id}/stats` | All roles |

### Alerts (ICNO Validation Gate)
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/alerts/` | ICNO (all), Sister/Doctor (approved) |
| POST | `/alerts/validate/{id}` | ICNO only |
| POST | `/alerts/reject/{id}` | ICNO only |
| POST | `/alerts/dispatch/{id}` | ICNO only — sends MoH email |
| GET | `/alerts/analytics/root-cause` | ICNO only — Apriori |
| GET | `/alerts/analytics/dashboard` | ICNO / Sister |

### OCR Pipeline
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/ocr/scan` | ICNO only |
| GET | `/ocr/queue` | ICNO only |
| POST | `/ocr/confirm` | ICNO only |
| GET | `/ocr/{scan_id}` | ICNO only |

### Reports
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/reports/` | ICNO / Sister |
| POST | `/reports/executive` | ICNO / Sister — PDF/Excel |
| POST | `/reports/dengue` | ICNO / Doctor |
| GET | `/reports/download/{id}` | ICNO / Sister |

### Hospital Heatmap
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/heatmap/` | All roles |
| POST | `/heatmap/refresh` | ICNO only — Re-runs all RF predictions |

### Common Notices
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/notices/` | All roles |
| POST | `/notices/` | ICNO / Sister |
| DELETE | `/notices/{id}` | ICNO only |

---

## 🤖 AI/ML Algorithms

| Algorithm | Trigger | Purpose |
|-----------|---------|---------|
| **Z-Score Anomaly Detection** | Every `POST /lab-results/` | Detects statistical pathogen "trend breaks" |
| **Random Forest Classifier** | `POST /wards/{id}/predict` or heatmap refresh | Ward-level outbreak risk prediction |
| **Risk-Weighted Heuristic** | `GET /audits/priority-list` | ICNO daily task prioritization P=(w1·C)+(w2·V)+(w3·L) |
| **Apriori Algorithm** | `GET /alerts/analytics/root-cause` | Mine audit failure → pathogen associations |

---

## 🗄️ Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `users` | User profiles + role assignments |
| `wards` | Hospital ward registry |
| `audits` | Digital ward inspection records |
| `lab_results` | Microbiology test results |
| `pathogens` | Pathogen catalogue |
| `pathogen_stats` | Z-Score rolling statistics |
| `alerts` | AI-generated alerts + validation state |
| `ocr_queue` | OCR confidence review queue |
| `reports` | Generated report metadata |
| `notices` | Common notice panel entries |

---

## 🔒 Security Features
- JWT with **15-minute** access token expiry
- Refresh token (7-day expiry)
- Role-Based Access Control (RBAC) on every endpoint
- **ICNO Validation Gate** — AI outputs never shared without human approval
- Patient data masking for Staff/Public roles
- HTTPS enforced at deployment (Render)
- Pydantic strict input validation on all request bodies

---

## 🧪 Running Tests
```bash
pytest tests/ -v
```

---

## 🌐 Deployment

### Render (Backend)
1. Set environment variables on Render dashboard
2. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the contents of the service account JSON
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Firebase Hosting (Frontend)
- Frontend (React.js) connects to the Render backend URL via `REACT_APP_API_URL`

---

*InfecSure v1.0 — IIT 04 | Uva Wellassa University of Sri Lanka — 2026*
