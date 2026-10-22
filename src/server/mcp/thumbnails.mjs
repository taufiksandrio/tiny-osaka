import "server-only";
import sharp from "sharp";

// Q-7 (AC-43/44/45): read-only thumbnails for MCP media tools. Built on demand from the bytes the CMS media service already
// serves server-side; never stored, never written back, and the original bytes / storage key never leave this module.
export const THUMB_MAX_SIDE = 512;
export const THUMB_TARGET_BYTES = 60 * 1024;
export const LIST_THUMBNAIL_LIMIT = 12; // Q-9: within the approved 10-20 range.
const CONCURRENCY = 3;
// Progressively smaller attempts until the target size is met (the last one is returned regardless).
const ATTEMPTS = Object.freeze([[THUMB_MAX_SIDE, 72], [THUMB_MAX_SIDE, 55], [400, 45], [320, 40]]);

export const buildThumbnail = async bytes => {
  let out = null;
  for (const [side, quality] of ATTEMPTS) {
    out = await sharp(bytes, { failOn: "error", limitInputPixels: 4096 * 4096 }).rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
    if (out.length <= THUMB_TARGET_BYTES) break;
  }
  return { mimeType: "image/webp", data: out.toString("base64") };
};

const limiter = max => {
  let active = 0; const waiting = [];
  const release = () => { active--; waiting.shift()?.(); };
  return async task => {
    if (active >= max) await new Promise(resolve => waiting.push(resolve));
    active++;
    try { return await task(); } finally { release(); }
  };
};

export const createThumbnails = ({ concurrency = CONCURRENCY, build = buildThumbnail, readBytes = null } = {}) => {
  const gate = limiter(concurrency);
  // Returns { mimeType, data } or null. Never throws: a failed thumbnail must not fail the metadata (AC-44).
  const forAsset = (cms, headers, asset) => {
    if (asset?.kind !== "image") return Promise.resolve(null);
    return gate(async () => {
      try {
        const bytes = readBytes ? await readBytes(cms, headers, asset) : (await cms.media.file(headers, asset.id)).bytes;
        return await build(bytes);
      } catch { console.error("MCP thumbnail omitted."); return null; } // no id, path or driver detail
    });
  };
  // Thumbnails for the first `limit` image assets, in list order; returns [{ id, mimeType, data }].
  const forList = async (cms, headers, rows, limit = LIST_THUMBNAIL_LIMIT) => {
    const picked = rows.filter(row => row.kind === "image").slice(0, limit);
    const made = await Promise.all(picked.map(async row => ({ id: row.id, thumb: await forAsset(cms, headers, row) })));
    return made.filter(item => item.thumb).map(item => ({ id: item.id, ...item.thumb }));
  };
  return Object.freeze({ forAsset, forList });
};
