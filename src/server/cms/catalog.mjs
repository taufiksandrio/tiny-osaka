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
    remove: (headers, slug) => run(headers, { owner: true }, async (tx, actor) => {
      const result = await deleteProduct(tx, actor, slugOf(slug));
      return { deleted: true, slug: result.slug, name: result.name };
    }),
  });
};
