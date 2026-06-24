import hashlib
import re

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, engine, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Nimo", version="0.1.0")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
def upload_page() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/upload.html", include_in_schema=False)
def manual_upload_page() -> FileResponse:
    return FileResponse("static/upload.html")


def normalize_for_hash(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().casefold())


def make_highlight_hash(book_name: str, author: str, highlight: str) -> str:
    hash_input = "\n".join(
        [
            normalize_for_hash(book_name),
            normalize_for_hash(author),
            normalize_for_hash(highlight),
        ]
    )
    return hashlib.sha256(hash_input.encode("utf-8")).hexdigest()


def parsed_highlight_from_parts(book_name: str, author: str, highlight: str) -> schemas.ParsedHighlight:
    return schemas.ParsedHighlight(
        book_name=book_name,
        author=author,
        highlight=highlight,
        hash=make_highlight_hash(book_name, author, highlight),
    )


def parse_kindle_clippings(content: str) -> list[schemas.ParsedHighlight]:
    highlights: list[schemas.ParsedHighlight] = []

    for entry in content.split("=========="):
        lines = [line.strip().lstrip("\ufeff") for line in entry.strip().splitlines()]
        lines = [line for line in lines if line]
        if len(lines) < 3:
            continue

        title_line = lines[0]
        author = ""
        book_name = title_line
        if title_line.endswith(")") and "(" in title_line:
            book_name, author = title_line.rsplit("(", 1)
            book_name = book_name.strip()
            author = author[:-1].strip()

        highlight = "\n".join(lines[2:]).strip()
        highlights.append(parsed_highlight_from_parts(book_name, author, highlight))

    return highlights


def save_highlights(db: Session, highlights: list[schemas.ParsedHighlight]) -> tuple[list[schemas.HighlightRead], int]:
    hashes = [highlight.hash for highlight in highlights]
    existing_highlights = db.scalars(select(models.Highlight).where(models.Highlight.hash.in_(hashes))).all() if hashes else []
    persisted_by_hash = {highlight.hash: highlight for highlight in existing_highlights}
    imported_count = 0

    for highlight in highlights:
        if highlight.hash in persisted_by_hash:
            continue

        db_highlight = models.Highlight(
            book_name=highlight.book_name,
            author=highlight.author,
            highlight=highlight.highlight,
            hash=highlight.hash,
        )
        db.add(db_highlight)
        db.flush()
        persisted_by_hash[highlight.hash] = db_highlight
        imported_count += 1

    db.commit()

    saved_highlights: list[schemas.HighlightRead] = []
    seen_hashes: set[str] = set()
    for highlight in highlights:
        if highlight.hash in seen_hashes:
            continue
        seen_hashes.add(highlight.hash)
        saved_highlights.append(schemas.HighlightRead.model_validate(persisted_by_hash[highlight.hash]))

    return saved_highlights, imported_count


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


@app.post("/api/import/new", response_model=schemas.ManualImportRead, status_code=status.HTTP_201_CREATED)
def import_manual_highlight(
    entry: schemas.ManualHighlightCreate,
    response: Response,
    db: Session = Depends(get_db),
) -> schemas.ManualImportRead:
    book_name = entry.book_name.strip()
    author = entry.author.strip()
    highlight = entry.highlight.strip()
    if not book_name or not author or not highlight:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Book title, author, and highlight are required",
        )

    parsed_highlight = parsed_highlight_from_parts(book_name, author, highlight)
    saved_highlights, imported_count = save_highlights(db, [parsed_highlight])
    if imported_count == 0:
        response.status_code = status.HTTP_200_OK

    return schemas.ManualImportRead(imported=imported_count == 1, highlight=saved_highlights[0])


@app.post("/api/import", response_model=schemas.ImportRead)
async def import_text_file(file: UploadFile = File(...), db: Session = Depends(get_db)) -> schemas.ImportRead:
    if file.content_type is not None and not file.content_type.startswith("text/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a text file")
    if file.filename is not None and not file.filename.lower().endswith(".txt"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must have a .txt extension")

    contents = await file.read()
    try:
        text_content = contents.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be UTF-8 encoded text") from exc

    parsed_highlights = parse_kindle_clippings(text_content)
    if not parsed_highlights:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No Kindle highlights found in file")

    saved_highlights, imported_count = save_highlights(db, parsed_highlights)

    return schemas.ImportRead(
        filename=file.filename or "",
        content_type=file.content_type,
        size=len(contents),
        count=len(parsed_highlights),
        imported_count=imported_count,
        skipped_count=len(parsed_highlights) - imported_count,
        highlights=saved_highlights,
    )
