# Nimo — Firefox Kindle Highlights Sync Extension

A lightweight, secure Firefox extension that syncs highlights directly from your Amazon Kindle Cloud Notebook ([read.amazon.de/notebook](https://read.amazon.de/notebook) or [read.amazon.com/notebook](https://read.amazon.com/notebook)) into your local Nimo library.

---

## 🔒 Security & Privacy

- **Zero Credential Access:** The extension never handles, accesses, or asks for your Amazon password, cookies, or credentials.
- **Local-Only Communication:** Highlights travel directly from your Firefox browser to your own local Nimo backend (`http://localhost:8000/api/import/batch`). No external cloud servers or analytics.
- **Fully Open:** Pure vanilla JavaScript with no external dependencies or obfuscated code.

---

## 🚀 How to Install in Firefox (Takes 10 Seconds)

1. Open Firefox and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```
2. Click the **"Load Temporary Add-on..."** button.
3. Browse to this folder (`firefox-extension/`) and select **`manifest.json`**.
4. The Nimo book icon 📖 will now appear in your Firefox toolbar!

---

## 📖 How to Use

1. Ensure Nimo is running locally:
   ```bash
   source .venv/bin/activate
   uvicorn nimo.main:app --reload
   ```
2. Log into Amazon and go to your Kindle Notebook:
   [https://read.amazon.de/notebook](https://read.amazon.de/notebook) (or [read.amazon.com/notebook](https://read.amazon.com/notebook))
3. Click the **Nimo Sync** icon in your Firefox toolbar:
   - **Sync Current Book:** Instantly saves all highlights for the currently selected book.
   - **Sync All Books:** Automatically clicks through your library in the sidebar and imports highlights for every book.
4. Open [http://localhost:8000/library](http://localhost:8000/library) to see and search your highlights.
