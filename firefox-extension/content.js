// content.js — Scrapes highlights from read.amazon.com/notebook

function scrapeCurrentBook() {
  // Title extraction with fallbacks
  let title = '';
  const titleSelectors = [
    '#kp-notebook-head-title',
    '.kp-notebook-metadata h3',
    'h3.kp-notebook-metadata',
    'h2.kp-notebook-metadata',
    '.kp-notebook-library-each-book.a-row-selected h2',
    '.kp-notebook-selectable-book.a-row-selected h2',
    '.kp-notebook-library-each-book.a-row-selected',
  ];
  for (const sel of titleSelectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      title = el.textContent.trim();
      break;
    }
  }

  // Author extraction with fallbacks
  let author = '';
  const authorSelectors = [
    '#kp-notebook-head-author',
    'p.kp-notebook-metadata.a-color-secondary',
    '.kp-notebook-metadata p',
    '.kp-notebook-library-each-book.a-row-selected p',
    '.kp-notebook-selectable-book.a-row-selected p',
  ];
  for (const sel of authorSelectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      author = el.textContent.trim().replace(/^(by\s*|von\s*|author:\s*)/i, '').trim();
      break;
    }
  }

  // Highlight extraction
  const highlightElements = document.querySelectorAll(
    '#kp-notebook-annotations #highlight, ' +
    '#kp-notebook-annotations .kp-notebook-highlight, ' +
    '#highlight, ' +
    '.kp-notebook-highlight, ' +
    '[id^="kp-notebook-highlight"]'
  );

  const highlights = [];
  const seenTexts = new Set();

  highlightElements.forEach((el) => {
    const text = el.textContent.trim();
    if (text && text.length > 1 && !seenTexts.has(text)) {
      seenTexts.add(text);
      highlights.push({
        book_name: title || 'Kindle Highlights',
        author: author || 'Unknown Author',
        highlight: text,
      });
    }
  });

  return {
    title: title || 'Kindle Book',
    author: author || 'Unknown Author',
    count: highlights.length,
    highlights: highlights,
  };
}

// Listen for messages from popup
if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape_current') {
      const result = scrapeCurrentBook();
      sendResponse(result);
      return false;
    }

    if (request.action === 'get_books_count') {
      const bookItems = document.querySelectorAll('.kp-notebook-library-each-book, .kp-notebook-selectable-book');
      sendResponse({ count: bookItems.length });
      return false;
    }
  });
}
