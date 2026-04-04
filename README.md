# AI Codebase Navigator

## What it does

You point it at a GitHub repo. It clones the repo, parses the code with Tree-sitter, stores chunk embeddings in Pinecone, and stores **import relationships** (file → file) plus **functions per file** in Neo4j. Then you ask questions in plain language and get answers with **file paths and line numbers**. The UI shows a file tree, a read-only code editor, and a chat panel with streaming answers.

**Live demo:** _(add your URL after deploy)_

## Architecture

```
[Browser: React + CodeMirror + D3]
        | Bearer auth
        v
   FastAPI (async)
   /    |     \
Postgres  Redis  Neo4j / Pinecone / Claude / OpenAI embeddings
        ^
   Celery worker (sync + threads)  ingest job
```

_(Replace with a diagram export from your favorite tool.)_

## Setup

1. Copy `.env.example` to `.env` and fill in tokens (Anthropic, OpenAI, GitHub PAT, Pinecone index `1536` dim cosine, Neo4j Aura URI, Postgres, Redis, `API_TOKEN`).
2. Create a Pinecone index: **1536 dimensions**, **cosine**; name it to match `PINECONE_INDEX`.
3. **Database:** with Docker, `docker compose up --build` applies [`db/schema.sql`](db/schema.sql) on first Postgres start. Or run that SQL manually.
4. **API:** `docker compose up` starts `app` on port **8000** and `worker`. Or locally: `pip install -r requirements.txt`, then `uvicorn main:app --reload` and `celery -A worker.tasks.celery_app worker -l info` (with Postgres + Redis running).
5. **Frontend:** `cd frontend && npm install && npm run dev` → Vite on **5173**. Copy [`frontend/.env.example`](frontend/.env.example) to `frontend/.env` and set `VITE_API_URL` + `VITE_API_TOKEN` (same value as backend `API_TOKEN`).

All non-health routes expect: `Authorization: Bearer <API_TOKEN>`.

## Example queries

- **Location:** “Where is JWT verification handled?”
- **Impact:** pick a function name your graph indexed (e.g. `verify_token`) — “What breaks if I change `verify_token`?”
- **Explain file:** open a file, then “Explain this file” with `src/...` in the request body.
- **Connection path:** “How does `login` relate to `saveUser`?” (import reachability — not data-flow).

## Tech stack

| Layer        | Technology |
|-------------|------------|
| API         | Python 3.11, FastAPI, SSE |
| Worker      | Celery, Redis |
| DB          | PostgreSQL 16 |
| Vectors     | Pinecone, `text-embedding-3-small` (1536-d) |
| Graph       | Neo4j (imports + CONTAINS functions) |
| LLM         | Claude (structured JSON via `utils/llm.py`) |
| Parse       | Tree-sitter (Py/JS/TS/Java/Go) |
| UI          | React, CodeMirror 6, D3 |

## V1 scope

- Graph edges: **`File`–`IMPORTS`–`File`**, **`File`–`CONTAINS`–`Function`**. No cross-file call graph.
- Embeddings: **OpenAI `text-embedding-3-small` only** via [`utils/embeddings.py`](utils/embeddings.py).
- **Connection path** in the UI = import reachability, not data flow.
- **Async rule:** FastAPI handlers stay async and non-blocking; ingestion runs in a **sync** Celery task using `asyncio.run` plus `asyncio.to_thread` for Git, embeddings, and Pinecone (see [`ingestion/ingester.py`](ingestion/ingester.py)).

## Tests

```bash
pytest tests/
```
