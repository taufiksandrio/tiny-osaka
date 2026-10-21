import "server-only";
import { revalidatePath } from "next/cache";
import { getAuthService } from "../auth/runtime.mjs";
import { createCmsServicesFor } from "../cms/runtime.mjs";
import { buildMcp } from "./compose.mjs";

let instance;
export const getMcp = () => {
  if (!instance) {
    const auth = getAuthService();
    instance = buildMcp({ pool: auth.pool, consume: auth.consume, baseURL: auth.baseURL, authenticateSession: headers => auth.authenticate(headers),
      cmsFor: actor => createCmsServicesFor(async () => ({ subject: actor.subject, role: actor.role })),
      // Same invalidation as the HTTP page/catalog routes.
      refreshPublic: () => revalidatePath("/", "layout") });
  }
  return instance;
};
