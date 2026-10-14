---
"agent-core": minor
---

Adopt MarkItDown-derived document-projection capabilities into Agent Core's existing read_file facade: native bounded converter negotiation and sanitized fallback evidence; automatic semantic Markdown for PPTX, EPUB, IPYNB, Outlook MSG and safe recursive ZIP archives; opt-in semantic Markdown views for HTML/RSS/Atom/CSV with legacy charset decoding plus DOCX/XLS/XLSX/XLSM/PDF; and fail-closed archive traversal, encryption, symlink, compression, size, entry-count and recursion limits without adding a second MCP server, Python plugin runtime, hidden model call, or replacement for existing editable document owners.
