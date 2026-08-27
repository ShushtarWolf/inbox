# Canva export — 2026-08-27

Source: `Downloads/inbox website (2).zip` (77 PNG frames + Persian-named sheets from prior sync).

- `inbox website (2).zip` — original download (gitignored)
- `raw/` — mirror of extracted frames (gitignored)
- `pages/` — shared mirror used by compare script (gitignored)

Frame map: [`../MAP.md`](../MAP.md). Pixel report: [`../comparisons/report-2026-08-27.md`](../comparisons/report-2026-08-27.md).

Re-sync:

```bash
cp "/Users/siamakghodsi/Downloads/inbox website (2).zip" canva-reference/inbox-website-2026-08-27/
unzip -o "canva-reference/inbox-website-2026-08-27/inbox website (2).zip" -d canva-reference/pages/
npm run check:canva
```
