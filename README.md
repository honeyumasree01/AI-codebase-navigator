# AI Codebase Navigator

Connect any GitHub repo and ask questions about the code in plain English. Get answers with exact file names and line numbers. Review files for bugs, get improvement suggestions, and generate fixes - all from a chat interface.

Live demo: [ai-codebase-navigator-khaki.vercel.app](https://ai-codebase-navigator-khaki.vercel.app)  
Backend: [ai-codebase-navigator-production.up.railway.app](https://ai-codebase-navigator-production.up.railway.app)

## What it does

Most code search tools find exact text matches. This tool understands meaning. You connect a GitHub repo, and it indexes the entire codebase - parsing every file's structure, extracting functions and classes, storing embeddings in Pinecone, and mapping import relationships in Neo4j. Then you ask questions:

- "Where does authentication happen?" -> `utils/auth.py` line 11, in `verify_token`
- "What breaks if I change this function?" -> Shows all files that import it
- "Explain what `orchestrator.py` does" -> Plain English summary
- "Review `utils/auth.py` for bugs" -> Severity-tagged list of real issues with line numbers
- "Fix the LabelEncoder reuse bug" -> Before/after code diff with explanation

This is not a code completion tool. It is a codebase intelligence tool - designed for the moment you inherit a large unfamiliar codebase and need to understand it fast. Something Cursor and Copilot are not built for.

## Architecture

```text
GitHub URL
    ↓
Celery worker
    ↓
Tree-sitter AST parsing (Python, JS, TS, Java, Go)
    ↓
Pinecone (semantic vector search, 1536-d cosine)
Neo4j (File→IMPORTS→File, File→CONTAINS→Function)
    ↓
Query engine → Claude → Answer with file:line references
    ↓
FastAPI SSE stream → React frontend
```

### Why dual retrieval?

Pinecone finds semantically similar code. Neo4j traverses relationships. Together they handle both "what does X mean" and "what depends on X" - two questions that need fundamentally different approaches.

### Why Tree-sitter?

Regex-based parsing breaks on edge cases. Tree-sitter builds a real AST, giving accurate function boundaries, class hierarchies, and import statements across all supported languages.

## Tech stack

| Layer | Technology |
| --- | --- |
| API | Python 3.11, FastAPI, SSE |
| Worker | Celery, Redis |
| Database | PostgreSQL 16 |
| Vectors | Pinecone, `text-embedding-3-small` (1536-d) |
| Graph | Neo4j Aura |
| LLM | Claude (structured JSON via `utils/llm.py`) |
| Parser | Tree-sitter (Python, JS, TS, Java, Go) |
| Frontend | React, CodeMirror 6 |
| Deploy | Railway (backend + worker), Vercel (frontend) |

## Query types

| Type | Example | What it does |
| --- | --- | --- |
| `location` | "Where is JWT verified?" | Semantic search -> file + line |
| `impact` | "What uses `verify_token`?" | Graph traversal -> dependent files |
| `explain` | "Explain `orchestrator.py`" | Full file -> plain English summary |
| `flow` | "How does login connect to saveUser?" | Import reachability path |
| `review` | Click file -> Review | Full file -> bugs, security issues, warnings |
| `improve` | Click file -> Improve | Full file -> up to 5 improvement suggestions |
| `fix` | Click file -> Fix issue | Full file + issue -> before/after diff |

## Key design decisions

- Pinecone over FAISS - managed cloud vector infra with zero ops overhead. FAISS is fine locally but adds operational complexity in production.
- SSE over WebSockets - this workload is server-to-client, event-stream oriented, and mostly one-way. SSE is lighter and sufficient.
- Full file context for review/fix - early versions sent chunked code to Claude which caused hallucinated "before" code in fixes. Sending the complete file eliminated this entirely.
- Separate Celery worker - ingestion is slow (clone, parse, embed, upsert). Running it in a background worker keeps the API responsive. The frontend polls `/status` until ingestion completes.
- CORS note - the current config uses `allow_origins=["*"]` for simplicity. In production, whitelist your frontend domain explicitly.

## Project structure

```text
AI-codebase-navigator/
├── db/
│   ├── queries.py
│   └── schema.sql
├── graph/
│   └── neo4j_client.py
├── ingestion/
│   └── ingester.py
├── query/
│   └── engine.py
├── utils/
│   ├── embeddings.py
│   ├── llm.py
│   └── config.py
├── worker/
│   └── tasks.py
├── frontend/
│   └── src/
├── main.py
├── app_routes.py
├── Dockerfile
├── Dockerfile.worker
└── docker-compose.yml
```

## Local setup

1. Copy `.env.example` to `.env` and fill in:

```bash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GITHUB_TOKEN=
PINECONE_API_KEY=
PINECONE_INDEX=          # 1536 dimensions, cosine metric
NEO4J_URI=               # neo4j+s://xxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=
DATABASE_URL=            # postgresql+asyncpg://...
REDIS_URL=               # redis://...
API_TOKEN=               # any secret string for Bearer auth
```

2. Create a Pinecone index: 1536 dimensions, cosine metric.
3. Start the backend:

```bash
docker compose up --build
```

This starts the FastAPI app on port 8000 and the Celery worker.

4. Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Vite starts on port 5173. All API calls proxy to `localhost:8000` automatically.

## Cloud deployment

### Backend (Railway)

- Deploy AI-codebase-navigator repo as a web service (Docker runtime)
- Add a second service from the same repo as the worker - set start command to:

```bash
celery -A worker.tasks.celery_app worker -l info --concurrency=1
```

- Add PostgreSQL and Redis databases in Railway
- Set all environment variables from `.env`

### Frontend (Vercel)

- Set root directory to `frontend`
- Add environment variable: `VITE_API_URL=https://your-railway-url.up.railway.app`

## API examples

Index a repo:

```bash
curl -X POST https://ai-codebase-navigator-production.up.railway.app/repos \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/your/repo"}'
```

Query the codebase:

```bash
curl -X POST https://ai-codebase-navigator-production.up.railway.app/repos/REPO_ID/query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query_type": "location", "question": "Where does authentication happen?"}'
```

Review a file:

```bash
curl -X POST https://ai-codebase-navigator-production.up.railway.app/repos/REPO_ID/query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query_type": "review", "question": "utils/auth.py"}'
```

All non-health routes require: `Authorization: Bearer <API_TOKEN>`.

## V1 scope

- Graph edges: File→IMPORTS→File, File→CONTAINS→Function. No cross-file call graph.
- Embeddings: OpenAI `text-embedding-3-small` only.
- Review/improve/fix: sends full file to Claude, returns complete JSON (no token streaming).
- Location/impact/explain/flow: streams tokens word by word via SSE.
- Connection path = import reachability, not data flow.

## Tests

```bash
pytest tests/
```

## Contact

Honey Umasree Pentakota · honeyumasre01@gmail.com · [github.com/honeyumasree01](https://github.com/honeyumasree01)
