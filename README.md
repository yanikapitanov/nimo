# Nimo

Nimo is a small FastAPI application backed by SQLite and SQLAlchemy.

## Requirements

- Python 3.12+
- Docker, optional

## Run Locally

Install dependencies:

```sh
pip install -r requirements.txt
```

Start the API:

```sh
uvicorn nimo.main:app --reload
```

The app will be available at:

- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Frontend: http://localhost:8000/
- Library: http://localhost:8000/library
- Health check: http://localhost:8000/health

## SQLite Database

By default, the app uses:

```txt
sqlite:///./data/nimo.db
```

You can override it with `DATABASE_URL`:

```sh
DATABASE_URL=sqlite:///./data/dev.db uvicorn nimo.main:app --reload
```

## Docker

Build the image:

```sh
docker build -t nimo .
```

Run the container:

```sh
docker run -p 8000:8000 nimo
```

Or use Docker Compose:

```sh
docker compose up --build
```

After the container starts, open:

```txt
http://localhost:8000/
```

The `0.0.0.0:8000` address in the Uvicorn log is the container bind address, not the browser URL.

To persist the SQLite database between container runs, mount a local directory:

```sh
docker run -p 8000:8000 -v "$(pwd)/data:/app/data" nimo
```

## Example Endpoints

- `GET /` - Batch upload page for Kindle `My Clippings.txt`
- `GET /library` - Highlights library page with instant search, filtering, and management
- `GET /upload.html` - Manual single-highlight entry form
- `GET /health` - Health check & DB connection ping
- `GET /api/highlights` - Paginated highlights with `q` search, `book`, and `author` filters
- `GET /api/books` - Distinct books with highlight counts
- `GET /api/stats` - Summary counts of highlights, books, and authors
- `DELETE /api/highlights/{id}` - Delete a single highlight
- `POST /api/import` - upload Kindle `My Clippings.txt`, parse book title, author, and highlight text, and save new highlights while skipping duplicate hashes
- `POST /api/import/new` - manually save one book title, author, and highlight while skipping duplicate hashes
