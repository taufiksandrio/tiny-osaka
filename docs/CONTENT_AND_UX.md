# Content & UX Design Contract

Positioning: expressive Osaka-inspired Japanese street-food. Primary CTA converts to verified GoFood/GrabFood product link, fallback store; sticky mobile CTA when appropriate. Onsite checkout excluded. Authentic Tiny Osaka logo and user photographs are authoritative. Other Japanese brands are moodboard inspiration, never designs/images to copy.

Public templates proposed: Home (hero, top menu, promo, about, CTA); About (story, proof, delivery-only); Food Guide (hero, educational narrative, image/video, product cross-link); Category/Menu (filter/list, prices, primary CTA); Product detail (photo/video, Indonesian copy, modifier explanation, platform buttons); Promotion (terms, start/end dates, CTA); Location (single Bandung site, address only after verified, delivery-only disclaimer).

CMS field schema should have Indonesian title, optional teaser, body, automatically defaulted SEO title/description, OG image, slug; owner approval per revision; fixed templates and rich-text areas, not page builder; media embed manual. Do not make up ingredient, health, authenticity, branch, discount, citywide delivery, price, rating, promotional validity or opening-hour claims.

Food photo retouch outside CMS: preserve genuine portion, ingredients, product presentation, toppings and perceived size; lighting, background, color grade and surrounding props may be adjusted but must not misrepresent served food.

Accessibility: keyboard nav, meaningful alt, contrast, semantic headings, focus indicators, avoid autoplay audio and motion effects that interfere with UX. Content is Indonesian only (ADR-034). No language selector or English authoring. Forms show required fields and advanced optional details; one bottom Save all action persists the whole draft atomically.

Measurement: identify CTA placements and events consistent with `docs/DATA_CONTRACTS.md`. User arriving from ChatGPT Ads should immediately see relevant offering and merchant CTA; don't imply advertiser benefits guarantee organic AI recommendation.

ADR-036 page editing overrides earlier review steps: table columns are page name,
last change (WIB), Edit; each Edit link opens /admin/pages/[pageKey]. Owner and
Staff use the same editor with optional preview and a single bottom Simpan.
Required fields are validated before immediate publication, errors retain inputs,
and no draft/revision/approval/schedule controls appear. Catalog approval remains
Owner-only; scheduling UI is removed for both domains.
