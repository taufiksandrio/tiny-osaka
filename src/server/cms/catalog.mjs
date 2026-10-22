import "server-only";
import { and, eq } from "drizzle-orm";
import { roles } from "../db/auth-schema.mjs";
import { parseProductInput, validProductSlug } from "../catalog/product-input.mjs";
import { readCards, createProduct, updateProduct, deleteProduct, lockCatalogWrites } from "../catalog/products.mjs";
import { cmsFail } from "./request-policy.mjs";

// Catalog card CRUD (ADR-037). Owner and Staff may create/update (live immediately);
// only the Owner may hard-delete. Membership is re-read from the DB inside the transaction.
export const createCmsCatalog = ({ db, authenticate }) => {
  const run = async (headers, { owner = false, write = true } = {}, callback) => {
    const actor = await authenticate(headers);
    if (!actor) cmsFail("AUTH_REQUIRED", 401);
    try {
      // Default isolation (read committed): the catalog advisory lock is taken before the
      // live pointer is read, so a repeatable-read snapshot would serve stale state.
      return await db.transaction(async tx => {
        const [member] = await tx.select().from(roles).where(and(eq(roles.userId, actor.subject), eq(roles.enabled, true)));
        if (!member || !["owner", "staff"].includes(member.role)) cmsFail("AUTH_REQUIRED", 401);
        if (owner && member.role !== "owner") cmsFail("FORBIDDEN", 403);
        if (write) await lockCatalogWrites(tx);
        return callback(tx, { subject: actor.subject, role: member.role });
      });
    } catch (error) {
      if (["40001", "40P01"].includes(error?.code ?? error?.cause?.code)) cmsFail("PRODUCT_CONFLICT", 409);
      throw error;
    }
  };
  const slugOf = slug => { if (!validProductSlug(slug)) cmsFail("NOT_FOUND", 404); return slug; };
  return Object.freeze({
    list: headers => run(headers, { write: false }, async (tx, actor) => ({ ...await readCards(tx), role: actor.role })),
    create: (headers, input) => run(headers, {}, async (tx, actor) => ({ product: await createProduct(tx, actor, parseProductInput(input)) })),
    update: (headers, slug, input) => run(headers, {}, async (tx, actor) =>
      ({ product: await updateProduct(tx, actor, slugOf(slug), parseProductInput(input, { update: true })) })),
    // Internal (MCP only, no HTTP route): partial update. Reads the live card and writes under the SAME lock and
    // transaction, so keys absent from `fields` keep their stored value. The version used for the compare-and-set
    // is the card read under the lock; a caller-supplied expectedVersion that differs is a PRODUCT_CONFLICT.
    merge: (headers, slug, fields) => run(headers, {}, async (tx, actor) => {
      const { expectedVersion, ...changes } = fields ?? {};
      if (!Object.keys(changes).length) cmsFail("INVALID_INPUT");
      const card = (await readCards(tx)).products.find(row => row.slug === slugOf(slug));
      if (!card) cmsFail("NOT_FOUND", 404);
      if (expectedVersion !== undefined && expectedVersion !== card.version) cmsFail("PRODUCT_CONFLICT", 409);
      const merged = { name: card.name, description: card.description, price: card.price, ...changes, expectedVersion: card.version };
      // AC-8: a new image without alt gets the merged menu name as alt.
      if (typeof merged.imageAssetId === "string" && (merged.imageAlt === undefined || merged.imageAlt === null)) merged.imageAlt = merged.name;
      return { product: await updateProduct(tx, actor, slug, parseProductInput(merged, { update: true })) };
    }),
    // confirmName (MCP only): compared with the stored name inside the same locked transaction, before anything is deleted.
    remove: (headers, slug, { confirmName } = {}) => run(headers, { owner: true }, async (tx, actor) => {
      if (confirmName !== undefined) {
        const card = (await readCards(tx)).products.find(row => row.slug === slugOf(slug));
        if (!card) cmsFail("NOT_FOUND", 404);
        if (typeof confirmName !== "string" || confirmName !== card.name) cmsFail("CONFIRM_NAME_MISMATCH", 400);
      }
      const result = await deleteProduct(tx, actor, slugOf(slug));
      return { deleted: true, slug: result.slug, name: result.name };
    }),
  });
};
