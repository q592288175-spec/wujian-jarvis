import io
import json
import sys
from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")
raw = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
if len(raw) > 8 * 1024 * 1024:
    raise ValueError("PDF exceeds limit")
reader = PdfReader(io.BytesIO(raw))
pages = []
length = 0
for index, page in enumerate(reader.pages[:20]):
    text = page.extract_text() or ""
    pages.append({"page": index + 1, "text": text[:24000 - length]})
    length += len(pages[-1]["text"])
    if length >= 24000:
        break
print(json.dumps({"pages": pages, "pageCount": len(reader.pages),
                  "truncated": len(reader.pages) > len(pages) or length >= 24000},
                 ensure_ascii=False))
