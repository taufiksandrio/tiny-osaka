import "server-only";
import { cmsFail } from "../cms/request-policy.mjs";
import { GuardError, fetchImage, parseImportUrl } from "./net-guard.mjs";

// media_import_url (docs/specs/mcp-owner-v2.md Q-6, AC-33..AC-41). The download is done by net-guard; the result then goes through the
// same createCmsMedia.upload as the Q-5 upload (JPG/PNG/WebP, 10 MB, 4096 px, storage), so there is no parallel validation or storage.
// The full URL is never logged, stored or put in an error: the audit row (tool_call) records the host only, via hostOf().
// AC-38 forbids guessing share-link patterns. The official Google Drive / Dropbox direct-download formats could NOT be verified
// (no outbound/doc access when this was built), so no conversion is done: share/preview hosts are refused with a clear error and the
// caller must give a direct image URL. To re-enable conversion later, verify the patterns against the official docs first.
const SHARE_HOSTS = Object.freeze(["drive.google.com", "docs.google.com", "dropbox.com", "www.dropbox.com"]);
const SHARE_HINT = "Tautan berbagi Google Drive/Dropbox tidak didukung. Berikan tautan unduhan langsung ke berkas gambar (JPG, PNG, atau WebP).";

// Validates the URL shape and refuses share-link hosts; returns the normalized href otherwise (never rewritten).
export const toDirectUrl = raw => {
  const url = parseImportUrl(raw);
  if (SHARE_HOSTS.includes(url.hostname.toLowerCase().replace(/\.$/, ""))) throw new GuardError("SHARE_LINK_UNSUPPORTED");
  return url.href;
};

// Host only, for the audit row. Never throws and never returns path, query or userinfo.
export const hostOf = raw => { try { return new URL(raw).hostname.slice(0, 200) || null; } catch { return null; } };

// Disabled unless the single server-only variable is exactly "true" (AC-41).
export const importEnabled = (env = process.env) => env.MCP_MEDIA_IMPORT_ENABLED === "true";

export const createImportUrl = ({ enabled = importEnabled, download = fetchImage, downloadOptions = {} } = {}) => {
  // One active import per Owner implies at most MAX_GLOBAL at once; counters are per server process.
  const active = new Set();
  const MAX_GLOBAL = 2;
  const run = async (cms, headers, input, actor) => {
    if (!enabled()) cmsFail("IMPORT_DISABLED", 403);
    if (active.has(actor.subject) || active.size >= MAX_GLOBAL) cmsFail("IMPORT_BUSY", 429);
    active.add(actor.subject);
    try {
      let image;
      try { image = await download(toDirectUrl(input.url), downloadOptions); }
      catch (error) {
        if (error instanceof GuardError) cmsFail(error.code, error.status, error.code === "SHARE_LINK_UNSUPPORTED" ? { hint: SHARE_HINT } : undefined);
        throw new Error("Import failed.");
      }
      return await cms.media.upload(headers, new Blob([image.buffer], { type: image.mime }).stream(), image.mime);
    } finally { active.delete(actor.subject); }
  };
  return Object.freeze({ run });
};
