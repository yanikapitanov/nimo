from pydantic import BaseModel, ConfigDict


class HighlightBase(BaseModel):
    book_name: str
    author: str
    highlight: str


class HighlightRead(HighlightBase):
    id: int
    hash: str

    model_config = ConfigDict(from_attributes=True)


class ParsedHighlight(HighlightBase):
    hash: str


class ImportRead(BaseModel):
    filename: str
    content_type: str | None
    size: int
    count: int
    imported_count: int
    skipped_count: int
    highlights: list[HighlightRead]
