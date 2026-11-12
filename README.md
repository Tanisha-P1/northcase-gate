# Northgate Chase

Northgate Chase is a local, synthetic-data case-tracking workspace for corporate KYC document follow-up. It provides the Chase Queue, Case Detail, Reminder Composer, Stage Analytics, and Analyst Handoff screens.

The supplied source documents and clickable HTML/image prototypes remain in the workspace root and `stitch_virtusa_ui_design_system/`. The JTBD file ends partway through its reminder-email requirements; implementation follows the complete architecture document and explicit workspace task requirements without inventing regulated decision logic.

## Safety boundaries

- All seeded companies, contacts, employees, case histories, and email addresses are synthetic. Client contacts use the reserved `.example` domain.
- No SMTP client, mail gateway, or external send integration exists. “Simulate email” only records an in-app event; it never transmits a message.
- Gemini receives only the minimum matching synthetic case and outstanding-document facts. Contact names and addresses, event narratives, and any credit-memo content are not included in assistant context. Request/answer text and API keys are not written to server logs.
- The AI service is bound to `127.0.0.1` and accepts only calls carrying the shared `AI_SERVICE_TOKEN`. The Node API validates each demo role and proxies authorized requests; Gemini never sees client-supplied identity headers.
- Gemini assistance can summarize retrieved records or suggest reminder wording; source retrieval, authorization, deadlines, and all regulated workflow decisions remain deterministic application logic.
- A reminder cannot be scheduled or simulated as sent until the assigned RM explicitly approves it.
- KYC, UBO, sanctions, and credit decisions are not automated or displayed. Credit memo content is not modeled or served.
- Waivers require a human-entered reason. Material workflow actions are recorded in an append-only case event log.

## Requirements and design references

- [Architecture](./architecture.md)
- [Jobs to Be Done](./jtbd.md)
- [Desktop and mobile prototypes](./stitch_virtusa_ui_design_system/)
- [Northgate Builder agent](./.github/agents/northgate-builder.agent.md)

The overdue/follow-up interval is configurable and defaults to **7 calendar days** (`NG_OVERDUE_DAYS=7`) because the architecture lists the final threshold as an Ops decision.

## Prerequisites

- Node.js 22.5+ (the API uses Node's built-in `node:sqlite`; Node 26 is supported)
- npm
- Python 3.10+

## Run locally

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ai_service\requirements-dev.txt
# Copy .env.example to .env and supply your own Gemini API key and a private shared AI_SERVICE_TOKEN.
.\.venv\Scripts\Activate.ps1
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`). The Node API runs on `http://127.0.0.1:3001`, the private Python AI service on `http://127.0.0.1:8000`, and Vite proxies `/api` requests to Node. The browser never calls Gemini or sees either server secret.

The first API start applies the SQLite migration and seeds 12 synthetic cases. The database is stored at `./northgate.sqlite` by default. Set `NG_DATABASE_PATH` to use another location.

To run a built deployment, first build the frontend with `npm run build`, then run `npm start` for the Node API/web server and `python -m uvicorn ai_service.main:app --host 127.0.0.1 --port 8000` as a separate backend process. Load the same trusted environment configuration in both services.

On a non-Windows development machine, activate `.venv` using that platform’s standard virtual-environment activation command before `npm run dev`.

## Docker

Build and run the complete application (frontend, Node API, and private Python AI service) in one container:

```powershell
docker build -t northgate-chase .
docker run --rm -p 8080:8080 `
  -e AI_SERVICE_TOKEN=replace-with-a-private-random-value `
  -e GEMINI_API_KEY=replace-with-your-gemini-api-key `
  northgate-chase
```

Open `http://localhost:8080`. The Node API listens on the container interface on port `8080`; the AI service remains private to the container on loopback. Do not put actual API keys in the Dockerfile, image, or command history. Supply them through a local secret manager or your deployment platform's secret integration instead. The container uses `/tmp/northgate.sqlite` by default, which is **ephemeral**: changes can be lost when a container restarts or is replaced. Do not use this configuration for durable data. Before a durable Cloud Run deployment, migrate both the Node workflow API and Python assistant from SQLite to Cloud SQL for PostgreSQL.

The GitHub Actions workflow at `.github/workflows/container-ci.yml` runs the Node and Python test suites, frontend build and lint, and a Docker image build on pushes to `main` and pull requests. After the Google Cloud and GitHub configuration in [GCP deployment](./docs/gcp-deployment.md) is complete, successful pushes to `main` also publish to Artifact Registry and deploy a **public synthetic-data preview** to Cloud Run. This preview uses temporary SQLite storage and is not for real or durable case data. Migrate both the Node workflow API and Python assistant to Cloud SQL for PostgreSQL before using persistent data.

## Demo roles

Use the role selector in the top bar to switch among the demo RM, Ops Coordinator, KYC Analyst, and COO views. RMs can see and approve reminders only for their assigned cases. Ops can see the full queue and prepare drafts. Analysts can review linked handoffs. COO analytics are aggregate-only. This role selector demonstrates workflow scoping; it is not production authentication.

## Gemini assistant

The application uses Google’s official **Google GenAI Python SDK** (`google-genai`) in a separate FastAPI service. The model defaults to **`gemini-3.6-flash`**, which Google lists as a stable Flash model that remains available for production use; it offers a practical speed/capability balance for short grounded answers. Override it with `GEMINI_MODEL` if your API project supports another Gemini model. Model access and pricing depend on your Google AI Studio project and current API availability.

1. Copy `.env.example` to `.env`.
2. Set `GEMINI_API_KEY` to your own Gemini API key. Keep it on the backend, never in frontend variables or source control.
3. Replace `AI_SERVICE_TOKEN` with a private random value shared only between the local Node and Python backend processes.
4. Optionally select `GEMINI_MODEL` and configure `NG_DATABASE_PATH`, `NG_OVERDUE_DAYS`, and `AI_SERVICE_TIMEOUT_SECONDS`.
5. Install Python requirements and start the application with `npm run dev`.

The Python service first uses read-only SQL and role-scoped application rules to retrieve the exact relevant records, then forwards a fixed, application-selected task plus only those facts to Gemini. The original natural-language question is used for backend retrieval and is **not** forwarded to Gemini. The service is loopback-only, protected from direct browser calls by the shared internal token, and rate-limited per demo identity. COO questions receive aggregate stage metrics only. The assistant shows links to the records used for its answer; it cannot search other portfolios or make KYC, UBO, sanctions, or credit decisions.

AI-generated reminder wording is only a suggestion: an explicitly initiated, case-linked draft enters the existing Reminder Composer and remains unapproved. Only the assigned RM can explicitly approve it, and any scheduled or immediate “delivery” only records a simulation—the application does not send actual email.

Assistant questions and model answers are not persisted. Operational logs contain a short hash of the question, role, number of sources, request outcome, and duration; they do not contain prompt/answer text, case descriptions, or API keys. Requests are limited to 8 per minute per role/identity and 30 seconds per Gemini call.

## Commands

```powershell
npm test       # API, workflow, and SQLite tests
npm run test:ai # Mocked-Gemini Python authorization, retrieval, and API tests (activate .venv)
npm run build  # Type-check and production-build the frontend
npm run lint   # Frontend lint
npm start      # Serve the production frontend and API on PORT (default 3001)
```

## Configuration

Copy `.env.example` as a reference and set environment variables in the process environment:

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `3001` | API and production web-server port |
| `NG_DATABASE_PATH` | `./northgate.sqlite` | SQLite database path |
| `NG_OVERDUE_DAYS` | `7` | Calendar-day follow-up threshold |
| `AI_SERVICE_URL` | `http://127.0.0.1:8000` | Internal FastAPI base URL (Node only) |
| `AI_SERVICE_TIMEOUT_SECONDS` | `35` | Node-to-Python assistant timeout |
| `GEMINI_API_KEY` | — | Google Gemini API key (Python backend only) |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Configurable Gemini model ID |
| `AI_SERVICE_TOKEN` | — | Private shared secret for Node → Python requests |

This is a local demo with synthetic records, not a production banking deployment. Production use requires bank identity/access controls, privacy review, approved integrations, and confirmation of Ops-owned thresholds and templates.
