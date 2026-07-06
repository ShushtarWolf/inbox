# inbox — brand assets

Fresh project seeded from **shushzerv** with logos, photos, icons, and the color palette preserved. Application code is intentionally omitted — ready for a new build.

## Contents

| Path | Description |
|------|-------------|
| `public/brand/` | Logo marks, inbox icon set (SVG + PNG), sketch sources |
| `public/icons/` | App icon, sport icons (SVG), review PNGs, basketball previews |
| `public/demo/` | Demo photos — clubs, coaches, news |
| `public/videos/` | Commercial video assets |
| `public/favicon.svg` | Favicon |
| `brand/palette.ts` | TypeScript color tokens (primary, cream, gold, grays, schedule) |
| `brand/tokens.css` | CSS custom properties for the same palette |

## Brand colors

| Token | Hex | Use |
|-------|-----|-----|
| Primary (coach red) | `#C41E1E` | CTAs, accents |
| Primary dark | `#4A1420` | Headers, depth |
| Primary light | `#DE0202` | Hover states |
| Cream | `#F4EFE9` | Page background |
| Gold accent | `#B68A3B` | Highlights, badges |
| Gray 900 | `#2C2C2A` | Body text |

Import palette in code:

```ts
import { palette, BRAND_PRIMARY, BRAND_ACCENT } from './brand/palette'
```

Or in CSS:

```css
@import './brand/tokens.css';
```

## Origin

Copied from `../shushzerv` on 2026-07-06. Tell the agent what to build next.
