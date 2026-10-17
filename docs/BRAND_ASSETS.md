# Home illustration and brand mark

Approved by user on 2026-10-17 for the home-content/brand update. The repository
had no authentic food photos, original logo, catalog products or media assets;
existing local home revisions were empty drafts. The only editorial facts used
are Tiny Osaka, Japanese street food, delivery-only, Bandung, Indonesia.

- `public/images/osaka-editorial.png`: original editorial artwork generated with
  the built-in imagegen tool,1536x1024,3192980 bytes. Prompt: a cream/vermilion/
  charcoal Osaka-inspired paper-print collage with lantern, bridge and skyline;
  no readable signs, people, real products, restaurant premises or food portions.
  SHA256: c89c07dbd45bfa9c20224523beb0a618ec56f4332843af20560c47aae78c9319.
  This is an illustration, not documentary photography. Both public and CMS
  previews visibly label it, with localized alt text. The source is retained
  unchanged; next/image creates responsive optimized delivery derivatives.
- `public/brand/tiny-osaka-mark.svg`: original code-drawn lantern mark, cream on
  red with charcoal details. It replaces the TO placeholder in header/footer/CMS.
  The matching favicon is `src/app/icon.svg`. SVG keeps the mark readable at
  small sizes; it does not claim an existing official restaurant logo was found.

No third-party restaurant image/logo was copied. These are proposed brand assets
approved for this implementation; they are not real photos of Tiny Osaka dishes
or premises. Replace the editorial illustration with verified user photography
when available, with a new reviewed asset and updated caption/alt text.

## Original Home photograph — 2026-10-17

The user supplied original Tiny Osaka assets and approved replacing the Home
illustration with `foto-menu/02a - Takoyaki Shio Negi.jpeg`. The public copy is
`public/images/02a - Takoyaki Shio Negi.jpeg`, 1600x1200, 112848 bytes.
SHA256: af2ddf15e0779ffdc73100f44170e573402953b986c2b48f972a6ac1ca652e34.

The copy is byte-identical to the supplied original, including metadata. No
retouch, compression, format conversion or metadata stripping was performed.
Home and CMS preview display the complete 4:3 photograph with localized alt
text and the caption “Takoyaki Shio Negi · Tiny Osaka”. `next/image` uses
`unoptimized` to deliver the original JPEG without generating derivatives.
The previous illustration remains in the repository for rollback, but Home no
longer displays it. Logo/favicon and CMS publication permissions are unchanged.

Home wording is in `src/features/public-site/home-draft.mjs`. It is an editorial
preset, not a public-reader fallback or seed. Authenticated editors load it into
blank fields, preserve existing text, save both languages and follow the normal
review/Owner publication flow. This task does not publish local restaurant data.

## Original brand logo — Phase 3.4

The user selected and approved `01b - Logo Transparan.png` for the public
header/footer, CMS, favicon and Apple icon. The original 3000x3000 transparent
PNG is copied byte-for-byte to `public/brand/01b - Logo Transparan.png`.
SHA256: a004ccdf64fd2394c7aeb6f0164dc4fdd347b7dabe1bd411a5e849440f001de3.
The supplied `Tiny_Osaka_Assets_Original` folder is never modified.

Separately approved display derivatives retain the complete logo and proportions:
`public/brand/tiny-osaka-logo.png` (256x256), `src/app/icon.png` (48x48), and
`src/app/apple-icon.png` (180x180). These are smaller PNG copies, not the original
files. No AI generation, retouch, recoloring, redrawing or mascot-only crop is
used. Regenerate with `node scripts/build-brand-assets.mjs` (Sharp 0.35.5).
The previous generated lantern SVG remains available for application rollback;
the active SVG favicon is replaced by the original-brand PNG icon.
