// popup.js — Handles extension popup interactions and syncing to Nimo

let NIMO_API_BASE = 'http://127.0.0.1:8000';

const serverStatusBadge = document.querySelector('#server-status');
const serverStatusText = document.querySelector('#server-status-text');
const wrongPageView = document.querySelector('#wrong-page-view');
const notebookView = document.querySelector('#notebook-view');
const openNotebookBtn = document.querySelector('#open-notebook-btn');
const bookTitleEl = document.querySelector('#book-title');
const bookAuthorEl = document.querySelector('#book-author');
const bookHighlightsCountEl = document.querySelector('#book-highlights-count');
const syncCurrentBtn = document.querySelector('#sync-current-btn');
const syncAllBtn = document.querySelector('#sync-all-btn');
const syncMessageEl = document.querySelector('#sync-message');

let currentActiveTab = null;
let currentScrapedData = null;

// Helper: Show status message
function showMessage(text, type = 'info') {
  syncMessageEl.className = `sync-message sync-message--${type}`;
  syncMessageEl.textContent = text;
  syncMessageEl.style.display = 'block';
}

function hideMessage() {
  syncMessageEl.style.display = 'none';
}

// 1. Check if Nimo backend is reachable
async function checkNimoHealth() {
  const candidateUrls = ['http://127.0.0.1:8000', 'http://localhost:8000'];
  for (const base of candidateUrls) {
    try {
      const res = await fetch(`${base}/health`, { method: 'GET' });
      if (res.ok) {
        NIMO_API_BASE = base;
        serverStatusBadge.className = 'status-badge status-badge--online';
        serverStatusText.textContent = 'Nimo Online';
        hideMessage();
        return true;
      }
    } catch (e) {
      // try next candidate
    }
  }
  serverStatusBadge.className = 'status-badge status-badge--offline';
  serverStatusText.textContent = 'Nimo Offline';
  showMessage('Nimo server is not running on port 8000. Start it with: uvicorn nimo.main:app', 'error');
  return false;
}

function isNotebookUrl(u) {
  if (!u) return false;
  return (u.includes('lesen.amazon.de') || u.includes('read.amazon.')) && u.includes('notebook');
}

// 2. Inspect active tab or any open Kindle notebook tab
async function initActiveTab() {
  const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
  let candidateTab = activeTabs && activeTabs[0];
  let url = (candidateTab && candidateTab.url) || '';

  let isKindleNotebook = isNotebookUrl(url);

  // If the active tab is not Kindle Notebook, check other open tabs
  if (!isKindleNotebook) {
    const allTabs = await browser.tabs.query({ currentWindow: true });
    const notebookTab = allTabs.find((t) => isNotebookUrl(t.url));
    if (notebookTab) {
      candidateTab = notebookTab;
      url = candidateTab.url;
      isKindleNotebook = true;
    }
  }

  currentActiveTab = candidateTab;

  if (!isKindleNotebook) {
    wrongPageView.style.display = 'block';
    notebookView.style.display = 'none';
    return;
  }

  wrongPageView.style.display = 'none';
  notebookView.style.display = 'block';

  // Inject content script and extract current book details
  try {
    await browser.scripting.executeScript({
      target: { tabId: currentActiveTab.id },
      files: ['content.js'],
    });

    const response = await browser.tabs.sendMessage(currentActiveTab.id, { action: 'scrape_current' });
    if (response) {
      currentScrapedData = response;
      bookTitleEl.textContent = response.title || 'Current Book';
      bookAuthorEl.textContent = response.author ? `by ${response.author}` : '';
      bookHighlightsCountEl.textContent = `${response.count} highlights detected on page`;
      syncCurrentBtn.disabled = false;
      syncAllBtn.disabled = false;
    }
  } catch (err) {
    bookTitleEl.textContent = 'Kindle Notebook';
    bookHighlightsCountEl.textContent = 'Ready to import';
    syncCurrentBtn.disabled = false;
    syncAllBtn.disabled = false;
  }
}

// 3. Send highlights payload to Nimo API
async function sendHighlightsToNimo(highlights) {
  const response = await fetch(`${NIMO_API_BASE}/api/import/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ highlights }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Server error: ${response.status}`);
  }

  return await response.json();
}

// 4. Sync Current Book
syncCurrentBtn.addEventListener('click', async () => {
  hideMessage();
  syncCurrentBtn.disabled = true;
  syncCurrentBtn.textContent = 'Extracting...';

  try {
    // Re-scrape to get latest rendered highlights
    const data = await browser.tabs.sendMessage(currentActiveTab.id, { action: 'scrape_current' });
    if (!data || data.highlights.length === 0) {
      showMessage('No highlights found for this book on the page.', 'error');
      syncCurrentBtn.disabled = false;
      syncCurrentBtn.textContent = '📥 Import Current Book Highlights';
      return;
    }

    syncCurrentBtn.textContent = `Sending ${data.highlights.length}...`;
    const result = await sendHighlightsToNimo(data.highlights);

    showMessage(
      `✓ Synced "${data.title}": ${result.imported_count} new highlights saved (${result.skipped_count} duplicates skipped).`,
      'success'
    );
  } catch (err) {
    showMessage(`Sync failed: ${err.message}`, 'error');
  } finally {
    syncCurrentBtn.disabled = false;
    syncCurrentBtn.textContent = '📥 Import Current Book Highlights';
  }
});

// 5. Sync All Books (iterates through sidebar books)
syncAllBtn.addEventListener('click', async () => {
  hideMessage();
  syncAllBtn.disabled = true;
  syncCurrentBtn.disabled = true;
  syncAllBtn.textContent = 'Syncing all...';

  try {
    // Execute automated cycle in tab
    const [result] = await browser.scripting.executeScript({
      target: { tabId: currentActiveTab.id },
      func: async () => {
        const bookRows = Array.from(
          document.querySelectorAll('.kp-notebook-library-each-book, .kp-notebook-selectable-book')
        );

        if (bookRows.length === 0) {
          // If sidebar not present, return single book highlights
          return { error: 'No book list found in sidebar' };
        }

        const allHighlights = [];
        const processedBooks = [];

        for (let i = 0; i < bookRows.length; i++) {
          const row = bookRows[i];
          row.click();
          // Wait for Amazon to update annotations
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Extract title & author
          let title = '';
          const titleEl = document.querySelector('#kp-notebook-head-title, .kp-notebook-metadata h3, h3.kp-notebook-metadata, h2.kp-notebook-metadata');
          if (titleEl) title = titleEl.textContent.trim();

          let author = '';
          const authorEl = document.querySelector('#kp-notebook-head-author, p.kp-notebook-metadata.a-color-secondary, .kp-notebook-metadata p');
          if (authorEl) author = authorEl.textContent.replace(/^(by\s*|von\s*|author:\s*)/i, '').trim();

          // Extract highlights
          const highlightEls = document.querySelectorAll(
            '#kp-notebook-annotations #highlight, #kp-notebook-annotations .kp-notebook-highlight, #highlight'
          );

          highlightEls.forEach((el) => {
            const text = el.textContent.trim();
            if (text && text.length > 1) {
              allHighlights.push({
                book_name: title || `Book ${i + 1}`,
                author: author || 'Unknown Author',
                highlight: text,
              });
            }
          });

          processedBooks.push(title || `Book ${i + 1}`);
        }

        return {
          booksCount: processedBooks.length,
          highlights: allHighlights,
        };
      },
    });

    if (!result || !result.result || !result.result.highlights) {
      throw new Error(result?.result?.error || 'Failed to extract books from page');
    }

    const { booksCount, highlights } = result.result;
    if (highlights.length === 0) {
      showMessage('No highlights found across books.', 'info');
      return;
    }

    syncAllBtn.textContent = `Saving ${highlights.length}...`;
    const apiRes = await sendHighlightsToNimo(highlights);

    showMessage(
      `✓ Finished! Synced ${apiRes.imported_count} new highlights across ${booksCount} books (${apiRes.skipped_count} skipped).`,
      'success'
    );
  } catch (err) {
    showMessage(`Sync all failed: ${err.message}`, 'error');
  } finally {
    syncAllBtn.disabled = false;
    syncCurrentBtn.disabled = false;
    syncAllBtn.textContent = '📚 Import All Books Highlights';
  }
});

// "Open Notebook" button
openNotebookBtn.addEventListener('click', () => {
  browser.tabs.create({ url: 'https://lesen.amazon.de/notebook' });
});

// Initialize
checkNimoHealth();
initActiveTab();
