import os
import random
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas
from .database import get_db


# Email configuration from environment variables
SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAIL_FROM = os.getenv("EMAIL_FROM")
EMAIL_TO = os.getenv("EMAIL_TO")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"


def get_random_highlights(db: Session, count: int = 5) -> list[schemas.HighlightRead]:
    """Fetch a random selection of highlights from the database."""
    highlights = db.scalars(select(models.Highlight)).all()
    if not highlights:
        return []
    
    # Get random sample (or all if fewer than count)
    selected = random.sample(highlights, min(count, len(highlights)))
    return [schemas.HighlightRead.model_validate(h) for h in selected]


def format_highlights_for_email(highlights: list[schemas.HighlightRead]) -> str:
    """Format highlights into a nicely formatted email body."""
    lines = ["Here are your random highlights:", "", "-" * 60]
    
    for i, highlight in enumerate(highlights, 1):
        lines.append(f"\n{i}. {highlight.book_name}")
        lines.append(f"   by {highlight.author}")
        lines.append("")
        lines.append(f"   \"{highlight.highlight}\"")
        lines.append("")
        lines.append("-" * 60)
    
    lines.append("")
    lines.append(f"Total highlights sent: {len(highlights)}")
    
    return "\n".join(lines)


def send_email(
    subject: str,
    body: str,
    to_email: Optional[str] = None,
    from_email: Optional[str] = None,
) -> bool:
    """Send an email using SMTP."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    # Use provided values or fall back to environment variables
    recipient = to_email or EMAIL_TO
    sender = from_email or EMAIL_FROM
    
    if not recipient or not sender:
        print("Error: No recipient or sender email configured")
        return False
    
    if not SMTP_SERVER:
        print("Error: SMTP server not configured")
        return False
    
    # Create message
    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    
    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            if SMTP_USE_TLS:
                server.starttls()
            
            if SMTP_USERNAME and SMTP_PASSWORD:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            
            server.sendmail(sender, recipient, msg.as_string())
        
        print(f"Email sent successfully to {recipient}")
        return True
        
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def send_random_highlights_email(
    db: Session,
    count: int = 5,
    to_email: Optional[str] = None,
) -> bool:
    """Fetch random highlights and send them via email."""
    highlights = get_random_highlights(db, count)
    
    if not highlights:
        print("No highlights found in database")
        return False
    
    subject = f"Your {len(highlights)} Random Highlights"
    body = format_highlights_for_email(highlights)
    
    return send_email(subject, body, to_email)


def main() -> None:
    """Command-line entry point to send random highlights."""
    db = next(get_db())
    try:
        send_random_highlights_email(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
