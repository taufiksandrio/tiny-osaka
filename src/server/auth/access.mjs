import "server-only";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getAuthService } from "./runtime.mjs";

export const requireAdmin = async (role) => {
  let actor;
  try { actor = await getAuthService().authenticate(await headers()); }
  catch { redirect("/admin/login"); }
  if (!actor) redirect("/admin/login");
  if (role && actor.role !== role) notFound();
  return actor;
};
