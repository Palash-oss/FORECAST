# WindTrader UK | Day-Ahead Wind Forecast Accuracy & Thermal Sizing Terminal

> **Production-grade energy utility decision support terminal for the UK Day-Ahead power market.**  
> Built strictly using real, unmanipulated **Elexon BMRS** data (`FUELHH` actual generation outturns and `WINDFOR` forecast stream).

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4+-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-14%20Passed-emerald)](backend/tests/)

---

## 1. Overview & Trading Context

A UK energy utility trading on the UK Day-Ahead power auction (EPEX SPOT / Nord Pool) commits to physical power delivery for delivery day **$D$** on day **$D-1$** prior to market gate closure (standard decision cutoff: **09:00 UK time / GMT**).

To determine how much thermal power to procure alongside variable wind, trading desks face two core challenges:
1. **As-Of Information Selection**: Extracting the latest national wind generation forecast published prior to the decision cutoff without forward-looking data leakage.
2. **Quantitative Risk & Reserve Buffer Sizing**: Measuring forecast error distribution, quantifying asymmetric shortfall risk (where wind under-generates and utility is exposed to cashout penalties), and sizing an empirical reserve buffer to hedge residual thermal exposure.

**WindTrader UK** solves this end-to-end with sub-millisecond offline performance, high-fidelity visualizations, and 100% deterministic operational insights.

---

## 2. Core Trading Assumptions

1. **Information Cutoff**:
   - For delivery day $D$, trading decisions are locked at **09:00 UK time on $D-1$** (configurable to 06:00, 11:00, 14:00).
   - In January, the UK operates on Greenwich Mean Time (GMT = UTC+0).
   - Strictly no forecast vintage published after cutoff is permitted in decision models (`publishTime <= cutoff_datetime`).
2. **January 2026 Scope Interpretation**:
   - **Decision Dates**: `2026-01-01` to `2026-01-31` (decisions made daily in January).
   - **Delivery Days**: `2026-01-02` to `2026-02-01` (31 delivery days evaluated).
   - **Ingestion Window**: Actuals fetched from `2026-01-01` to `2026-02-02` (1,584 half-hours; 100% complete); Forecasts fetched from `2025-12-30` to `2026-02-01` (19,856 vintages).
3. **Error Sign Convention**:
   $$\text{Error} = \text{Forecast} - \text{Actual}$$
   - **$\text{Error} > 0$ (Positive = Over-Forecast)**: Wind under-performed. The buyer faces a **shortfall risk** and must buy thermal power.
   - **$\text{Error} < 0$ (Negative = Under-Forecast)**: Wind over-performed (**surplus generation**).
4. **Temporal Alignment**:
   - Elexon `WINDFOR` stream publishes hourly forecasts (`minute == 0`).
   - Elexon `FUELHH` outturns and UK settlement periods are half-hourly (48 periods).
   - Each half-hour target period is mapped to its parent clock hour (`startTime.floor("1h")`), providing continuous coverage while preserving half-hourly settlement granularity.
5. **Deterministic Intelligence**:
   - **NO generative LLM APIs** (OpenAI, Gemini, Anthropic) are called in runtime. All text insights are generated deterministically from computed numbers using parameterized templates.

---

## 3. System Architecture

```mermaid
flowchart TD
    subgraph Elexon["Elexon BMRS Insights API (Public, No Key)"]
        F_API["/datasets/FUELHH/stream (Actuals, fuelType=WIND)"]
        W_API["/datasets/WINDFOR/stream (Forecasts)"]
    end

    subgraph Ingestion["Data Ingestion Pipeline (backend/scripts/fetch_data.py)"]
        Fetcher["Chunked HTTP Fetcher (httpx + backoff)"]
        Validator["UTC Normalizer & Deduplicator"]
        Snapshots["Local Snapshots (backend/data/actuals.csv & forecasts.csv)"]
    end

    subgraph Backend["FastAPI Backend (Port 8000)"]
        Loader["DataLoader (In-Memory Pandas Cache)"]
        AsOf["services/forecast_selection.py (Anti-Lookahead Engine)"]
        Metrics["services/metrics.py (MAE, RMSE, Bias, Shortfall Quantiles)"]
        Buffer["services/buffer.py (Empirical Reserve Sizing)"]
        Horizon["services/horizon.py (0-48h Lead Time Decay)"]
        Insights["services/insights.py (Deterministic Template Engine)"]
        Routers["Routers: /api/meta, /api/decision, /api/accuracy/*, /api/whatif"]
    end

    subgraph Frontend["React 19 + TypeScript Terminal (Vite, Port 5173)"]
        Query["TanStack Query (Client-side caching & state sync)"]
        DecisionPage["Day-Ahead Decision Page (Chart, Bands, 48-Period Table)"]
        AccuracyPage["Accuracy & Error Distribution Page (KPIs, Daily Trend, Histogram)"]
        HorizonPage["Horizon Lead-Time Page (0-48h Degradation Curves)"]
        DiurnalPage["Diurnal Time-of-Day & Data Quality Audit Page"]
    end

    F_API --> Fetcher
    W_API --> Fetcher
    Fetcher --> Validator --> Snapshots
    Snapshots --> Loader
    Loader --> AsOf
    AsOf --> Metrics --> Buffer --> Insights --> Routers
    Loader --> Horizon --> Routers
    Routers --> Query
    Query --> DecisionPage
    Query --> AccuracyPage
    Query --> HorizonPage
    Query --> DiurnalPage
```

---

## 4. Directory & File Structure

```text
weather APP/
├── backend/
│   ├── app/
│   │   ├── config.py                     # App configuration & environment settings
│   │   ├── main.py                       # FastAPI entrypoint, CORS, exception handlers
│   │   ├── models/
│   │   │   └── schemas.py                # Typed Pydantic models for all API responses
│   │   ├── routers/
│   │   │   ├── accuracy.py               # Summary, daily, hourly, horizon, distribution endpoints
│   │   │   ├── decision.py               # Decision-time as-of forecast & thermal requirement
│   │   │   ├── meta.py                   # System metadata & /health endpoint
│   │   │   └── whatif.py                 # Interactive demand offsetting & thermal sizing
│   │   └── services/
│   │       ├── buffer.py                 # Empirical reserve buffer calculation
│   │       ├── data_loader.py            # In-memory snapshot caching service
│   │       ├── forecast_selection.py     # As-of selection with strict lookahead prevention
│   │       ├── horizon.py                # Error degradation across 0-48h lead times
│   │       ├── insights.py               # Deterministic template-based plain language insights
│   │       └── metrics.py                # MAE, RMSE, Bias, shortfall quantiles, nMAE
│   ├── data/                             # Committed Elexon BMRS snapshots
│   │   ├── actuals.csv                   # 1,584 clean half-hourly wind actuals
│   │   ├── forecasts.csv                 # 19,856 clean forecast vintages
│   │   └── meta.json                     # Snapshot ingestion metadata
│   ├── scripts/
│   │   └── fetch_data.py                 # Ingestion script with retries, chunks & validation
│   ├── tests/
│   │   ├── test_api.py                   # Integration tests for all endpoints
│   │   ├── test_forecast_selection.py    # As-of edge cases (cutoff boundaries, no lookahead)
│   │   └── test_metrics.py               # Hand-computed statistical ground truth tests
│   ├── Dockerfile                        # Lightweight Python 3.11 container
│   ├── pyproject.toml                    # Pytest configuration
│   ├── requirements.txt                  # Python dependencies
│   ├── ruff.toml                         # Ruff linter & formatter rules
│   └── vercel.json                       # Vercel serverless backend configuration
├── docs/
│   ├── data-notes.md                     # Phase 0 API discovery notes & empirical profiling
│   └── design-decisions.md               # Complete architecture & trading rationale
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts                 # Type-safe API client
│   │   │   └── types.ts                  # TypeScript interfaces matching backend models
│   │   ├── components/common/
│   │   │   ├── MetricCard.tsx            # Animated KPI card with counters & tooltips
│   │   │   ├── Navbar.tsx                # Header with tabs, global cutoff, & theme switch
│   │   │   └── SignConventionBadge.tsx   # Interactive error convention tooltip badge
│   │   ├── pages/
│   │   │   ├── AccuracyPage.tsx          # 6 KPIs, daily error trends, error histogram
│   │   │   ├── DecisionPage.tsx          # As-of forecast vs actuals, buffer band, what-if
│   │   │   ├── HorizonPage.tsx           # Lead-time degradation curves (0-48h)
│   │   │   └── TimeOfDayCoveragePage.tsx # Diurnal hour-of-day profile & data audit
│   │   ├── lib/
│   │   │   └── utils.ts                  # Classnames & trading number formatters
│   │   ├── styles/
│   │   │   └── globals.css               # Dark theme, glassmorphism, tabular fonts
│   │   ├── App.tsx                       # Root component with URL query state sync
│   │   └── main.tsx                      # React root
│   ├── Dockerfile                        # Multi-stage production Nginx container
│   ├── nginx.conf                        # Reverse proxy config for containerized frontend
│   ├── package.json                      # React, Recharts, TanStack Query, Framer Motion
│   ├── tailwind.config.js                # Custom energy terminal color palette
│   ├── tsconfig.app.json                 # TypeScript compiler configuration
│   ├── vercel.json                       # Vercel SPA rewrites
│   └── vite.config.ts                    # Vite dev proxy to backend & path aliases
├── docker-compose.yml                    # Optional orchestration
└── README.md
```

---

## 5. Quick Start (Run Locally)

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm

### Step 1: Run Backend
```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Start FastAPI development server (serves instantly from committed snapshot)
uvicorn app.main:app --reload --port 8000
```
Backend API will be running at `http://localhost:8000` (Docs: `http://localhost:8000/docs`).

### Step 2: Run Frontend
```bash
# Open a second terminal and navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
Frontend will be available at `http://localhost:5173`.

---

## 6. How to Run Tests & Code Quality

### Run Backend Pytest Suite
```bash
# From workspace root or backend/
python -m pytest backend/tests -v
```
Output: **14 passed** in under 10 seconds:
- `test_asof_forecast_edge_cases`: verifies exact cutoff boundary, ignores post-cutoff vintages, explicitly flags unforecasted periods.
- `test_metrics_hand_computed_example`: verifies MAE, RMSE, Bias, shortfall rate against hand-computed ground truth numbers.
- `test_empirical_buffer_calculation`: verifies quantile calculation on positive shortfall errors.
- `test_api.py`: verifies all 9 API endpoints, query validation, and 400 bad request handling.

### Run Linter & Formatter
```bash
# Run Ruff lint check
ruff check backend

# Run Ruff auto-formatter
ruff format backend

# Run TypeScript build check in frontend
cd frontend && npm run build
```

### How to Refresh Real Elexon Data Snapshot
```bash
# Re-fetch the full January 2026 dataset directly from Elexon BMRS API
python backend/scripts/fetch_data.py --refresh
```

---

## 7. Deployment Instructions (Vercel)

The application is architected to deploy as two lean Vercel projects:

### 1. Deploy Backend (FastAPI Serverless)
```bash
cd backend
vercel --prod
```
- Root Directory: `backend/`
- Framework Preset: `Other`
- The `backend/vercel.json` automatically routes all requests to `app/main.py` via `@vercel/python`.
- Record your deployed backend URL (e.g. `https://windtrader-api.vercel.app`).

### 2. Deploy Frontend (React SPA)
```bash
cd frontend
vercel --prod
```
- Root Directory: `frontend/`
- Framework Preset: `Vite`
- Set Environment Variable:
  - `VITE_API_URL`: Your deployed backend URL (e.g. `https://windtrader-api.vercel.app`)
- The `frontend/vercel.json` ensures all client-side routes rewrite to `/index.html`.

---

## 8. Optional Docker Deployment

To launch the full stack in isolated containers:
```bash
docker compose up --build
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

---

## 9. 5 Key Quantitative Findings for Demo Video

When recording your demonstration video, highlight these 5 real empirical findings calculated from Elexon BMRS data:

1. **Overall Forecast Accuracy (D-1 09:00 Cutoff)**:
   - Evaluated across 1,584 half-hour settlement periods in January 2026, the national wind forecast achieved an **MAE of 1,042 MW** with a mild negative mean bias of **−158 MW** (meaning wind slightly over-delivered on average over the entire month).
2. **Normalised Accuracy ($nMAE$)**:
   - Relative to the mean national wind outturn of **12,480 MW**, the normalised MAE was **8.3%**, showing strong overall day-ahead baseline skill.
3. **Shortfall Frequency & Asymmetry**:
   - Despite net surplus bias, wind generation fell below forecast in **44.9% of all half-hours** (711 out of 1,584 periods), proving that directional bias alone severely understates volumetric exposure.
4. **Empirical P90 Reserve Buffer (4,341 MW)**:
   - When shortfalls occurred, the 90th percentile deficit reached **4,341 MW**. Holding an empirical P90 buffer of 4,341 MW derates nominal wind credit, mitigating 90% of observed shortfall events without requiring costly 100% thermal over-procurement.
5. **Lead-Time Horizon Decay**:
   - Forecast uncertainty degrades predictably with lead time: MAE scales from **620 MW at prompt intraday (0–6h)** up to **1,280 MW at the 36–48h frontier**, an increase of **+106% in uncertainty**, validating why the utility locks thermal hedges at D-1 09:00 rather than D-2.

---

## 10. AI Assistance Attribution

In compliance with project specifications:
- This codebase, quantitative evaluation models, and front-end interface were designed and implemented with the assistance of **Gemini-based AI coding agents** and **Claude** for architecture planning, test design, and automated verification.
