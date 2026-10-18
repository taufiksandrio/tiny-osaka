// Pure header logic for media delivery (no filesystem, no server-only) so it is unit-testable.
// Public delivery is cacheable for a bounded window only: an asset can stop being live when a
// product image is replaced or the product is deleted, so the withdrawal window is this value.
// next.config.mjs images.minimumCacheTTL must equal it (AC-31).
export const PUBLIC_MEDIA_MAX_AGE = 3600;

const BASE = Object.freeze({ "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Accept-Ranges": "bytes",
  "Content-Security-Policy": "default-src 'none'; sandbox" });

// Strong validator = file checksum (sha256 hex, immutable per asset id).
export const mediaEtag = asset => `"${asset.checksum}"`;

// RFC 9110 If-None-Match: "*" or a comma list; weak comparison (W/ prefix ignored).
export const etagMatches = (header, etag) => {
  if (typeof header !== "string" || !header.trim()) return false;
  if (header.trim() === "*") return true;
  return header.split(",").some(part => part.trim().replace(/^W\//, "") === etag);
};

export const adminMediaHeaders = asset => ({ ...BASE, "Cache-Control": "private, no-store", "Vary": "Cookie", "Content-Type": asset.mime });
// No Vary: Cookie: the public route never depends on cookies, so shared caches may serve it.
export const publicMediaHeaders = asset => ({ ...BASE, "Cache-Control": `public, max-age=${PUBLIC_MEDIA_MAX_AGE}`,
  "ETag": mediaEtag(asset), "Content-Type": asset.mime });
export const publicNotFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

// 304 without touching the file. Returns null when the request is not a matching conditional GET.
export const publicNotModified = (asset, request) => etagMatches(request.headers.get("if-none-match"), mediaEtag(asset))
  ? new Response(null, { status: 304, headers: { "Cache-Control": `public, max-age=${PUBLIC_MEDIA_MAX_AGE}`, "ETag": mediaEtag(asset),
    "X-Content-Type-Options": "nosniff" } })
  : null;
