# AGENTS.md — AI Agent Guidelines for Nimo

This file provides context, architectural guidelines, conventions, and common commands for AI agents working in this repository.

---

## 1. Project Overview

**Nimo** is a lightweight FastAPI application for managing Kindle highlights:
- **Import:** Supports batch importing from Kindle `My Clippings.txt` and manual single-highlight creation.
- **Storage:** Persisted in SQLite using SQLAlchemy 2.0 declarative models with deterministic SHA-256 deduplication.
- **Frontend:** Pure HTML5/CSS3 interface served directly by FastAPI via `/static`.
- **Scheduled Digest:** APScheduler triggers daily emails of random highlights via SMTP.

---

## 2. Tech Stack

- **Language:** Python 3.12+
- **Web Framework:** FastAPI (`0.115.6`), Uvicorn (`0.34.0`), Starlette
- **Database & ORM:** SQLite (`sqlite:///./data/nimo.db`), SQLAlchemy 2.0 (`2.0.36`)
- **Data Validation:** Pydantic v2
- **Job Scheduling:** APScheduler (`3.10.4`, `BackgroundScheduler`)
- **Email:** Python standard library (`smtplib`, `email.mime`)
- **Containerization:** Docker, Docker Compose

---

## 3. Project Structure

```
nimo/
├── data/                    # SQLite database directory (default: nimo.db, git-ignored)
├── static/                  # Vanilla frontend assets
│   ├── index.html           # Batch upload page for My Clippings.txt
│   ├── library.html         # Highlights library (browse, search, filter, delete)
│   ├── upload.html          # Manual highlight creation form
│   └── styles.css           # Styling for web pages
├── firefox-extension/       # Firefox extension for syncing read.amazon.com/notebook
│   ├── manifest.json        # Extension manifest (v3)
│   ├── popup.html / popup.js# Sync UI and triggers
│   └── content.js           # Amazon Kindle Cloud Notebook DOM scraper
├── nimo/                    # Core Python application package
│   ├── __init__.py          # Package marker
│   ├── main.py              # FastAPI application, lifespan, endpoints, Kindle parser, deduplication
│   ├── database.py          # Engine, SessionLocal, Declarative Base, and get_db dependency
│   ├── models.py            # SQLAlchemy ORM models (Highlight)
│   ├── schemas.py           # Pydantic schemas for requests and responses
│   └── email.py             # Highlight randomizer, email formatter, and SMTP sender
├── Dockerfile               # Container build (python:3.12-slim)
├── docker-compose.yml       # Docker Compose setup mounting ./data to /app/data
├── requirements.txt         # Production dependencies
├── README.md                # Human-oriented setup instructions
└── AGENTS.md                # This file (AI agent context & developer guide)
```

---

## 4. Development & Running Commands

### Local Environment Setup
```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start development server with reload
uvicorn nimo.main:app --reload

# Start with custom or in-memory database
DATABASE_URL=sqlite:///./data/dev.db uvicorn nimo.main:app --reload
DATABASE_URL=sqlite:///:memory: uvicorn nimo.main:app --reload

# Run email delivery test directly via CLI
python -m nimo.email
```

### Docker Commands
```bash
# Build Docker image
docker build -t nimo .

# Run container with volume persistence
docker run -p 8000:8000 -v "$(pwd)/data:/app/data" nimo

# Run using Docker Compose
docker compose up --build
```

---

## 5. API Endpoints Reference

| Method | Path | Description | Request Body / Parameters | Response Model |
|---|---|---|---|---|
| `GET` | `/` | Serves `static/index.html` (Kindle import page) | None | HTML file |
| `GET` | `/library` | Serves `static/library.html` (highlights library UI) | None | HTML file |
| `GET` | `/upload.html` | Serves `static/upload.html` (manual entry page) | None | HTML file |
| `GET` | `/health` | Health check and DB ping (`SELECT 1`) | None | `{"status": "ok", "database": "connected"}` |
| `GET` | `/api/highlights` | Search and browse highlights with pagination | `q`, `book`, `author`, `limit`, `offset` (query) | `schemas.HighlightsPagination` |
| `GET` | `/api/books` | Distinct books with highlight counts | None | `list[schemas.BookSummary]` |
| `GET` | `/api/stats` | Summary counts of highlights, books, and authors | None | `schemas.LibraryStats` |
| `DELETE` | `/api/highlights/{id}` | Delete a single highlight by ID | `highlight_id: int` (path) | Status 204 No Content |
| `POST` | `/api/import` | Upload Kindle `My Clippings.txt` | `file: UploadFile` (.txt, UTF-8/UTF-8-SIG) | `schemas.ImportRead` |
| `POST` | `/api/import/new` | Manually insert a single highlight | `schemas.ManualHighlightCreate` (JSON) | `schemas.ManualImportRead` |
| `POST` | `/api/import/batch` | Batch insert multiple highlights (used by extension) | `schemas.BatchHighlightCreate` (JSON) | `schemas.BatchImportRead` |
| `GET` | `/docs` | OpenAPI / Swagger interactive documentation | None | HTML |
| `GET` | `/redoc` | ReDoc interactive documentation | None | HTML |

---

## 6. Core Mechanics & Architecture Details

### Deduplication & Hashing
- Highlights are uniquely identified using a SHA-256 hash computed over normalized fields:
  ```python
  def normalize_for_hash(value: str) -> str:
      return re.sub(r"\s+", " ", value.strip().casefold())
  ```
- The hash input is `f"{norm_book}\n{norm_author}\n{norm_highlight}"`.
- The database enforces uniqueness on `models.Highlight.hash` via `UniqueConstraint("hash", name="uq_highlights_hash")`.
- When saving (`save_highlights` in `nimo/main.py`), existing hashes are queried in batch:
  ```python
  existing_highlights = db.scalars(select(models.Highlight).where(models.Highlight.hash.in_(hashes))).all()
  ```
  Existing entries are skipped gracefully without error, and only newly created records increment `imported_count`.

### Kindle Clippings Parsing (`nimo/main.py:parse_kindle_clippings`)
- Kindle entries in `My Clippings.txt` are delimited by `==========`.
- Each valid entry must contain at least 3 non-empty lines:
  - **Line 0:** Title and Author, formatted as `Book Title (Author Name)`
  - **Line 1:** Metadata (e.g. `- Your Highlight on Location 123 | Added on ...`) — ignored by parser
  - **Line 2+:** Highlight body text
- Handles UTF-8 BOM (`\ufeff`) automatically.

### Database Session Lifecycle
- Route handlers inject the session using FastAPI's dependency injection: `db: Session = Depends(get_db)`.
- Background tasks and CLI functions must manually instantiate and close `SessionLocal`:
  ```python
  db = SessionLocal()
  try:
      # do work
  finally:
      db.close()
  ```
- Tables are created automatically on startup via `Base.metadata.create_all(bind=engine)` in `nimo/main.py`.

### Email Scheduling & APScheduler
- Background scheduler is managed in the FastAPI `lifespan` context manager in `nimo/main.py`.
- Scheduled job `scheduled_send_highlights` runs daily at 9:00 AM (`CronTrigger(hour=9, minute=0)`).
- Picks up to 5 random highlights using `random.sample()` and sends a plain-text email via `smtplib.SMTP`.
- Gracefully handles missing SMTP credentials or empty databases with console error logging without crashing.

---

## 7. Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | String | `sqlite:///./data/nimo.db` | SQLAlchemy connection URI |
| `SMTP_SERVER` | String | *(None)* | Hostname of the SMTP server |
| `SMTP_PORT` | Integer | `587` | SMTP port (e.g. 587 for TLS, 465 for SSL) |
| `SMTP_USERNAME` | String | *(None)* | SMTP authentication username |
| `SMTP_PASSWORD` | String | *(None)* | SMTP authentication password or app token |
| `EMAIL_FROM` | String | *(None)* | Sender email address |
| `EMAIL_TO` | String | *(None)* | Recipient email address |
| `SMTP_USE_TLS` | Boolean | `true` | Use STARTTLS for SMTP connection |

---

## 8. Conventions for AI Agents

When editing or extending code in this repository:

1. **Typing & Modern Python:**
   - Use Python 3.12+ type annotation syntax (e.g. `list[str]`, `str | None`, `tuple[...]`, `Generator[...]`).
   - Annotate all function parameters and return types explicitly.

2. **Schema & Model Consistency:**
   - Pydantic models live in [nimo/schemas.py](file:///home/yanikapitanov/dev/nimo/nimo/schemas.py).
   - SQLAlchemy ORM models live in [nimo/models.py](file:///home/yanikapitanov/dev/nimo/nimo/models.py).
   - If adding fields to `Highlight`, ensure:
     1. The ORM column is added in `models.py`.
     2. Pydantic request/response schemas in `schemas.py` are updated.
     3. The hashing algorithm in `main.py` is evaluated if the field affects uniqueness.

3. **Error Handling:**
   - Prefer FastAPI `HTTPException` with explicit status codes (`status.HTTP_400_BAD_REQUEST`, etc.).
   - Return clean JSON error responses consistent with FastAPI standards.

4. **Frontend Simplicity:**
   - Keep the frontend in `static/` pure vanilla HTML/CSS/JavaScript.
   - Do not introduce heavy frontend toolchains or Node/NPM dependencies unless explicitly instructed.

5. **Testing & Verification:**
   - When writing tests, use `pytest` and `httpx.AsyncClient` or `starlette.testclient.TestClient`.
   - Always run tests against an in-memory database (`DATABASE_URL=sqlite:///:memory:`) so local files in `data/` remain untouched.
   - Ensure APScheduler does not hang test processes (lifespan shutdown or mock the scheduler during tests).
