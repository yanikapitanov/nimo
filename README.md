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

To persist the SQLite database between container runs, mount a local directory:

```sh
docker run -p 8000:8000 -v "$(pwd)/data:/app/data" nimo
```

## Example Endpoints

- `GET /`
- `GET /health`
- `POST /api/import` - upload Kindle `My Clippings.txt`, parse book title, author, and highlight text, and save new highlights while skipping duplicate hashes
