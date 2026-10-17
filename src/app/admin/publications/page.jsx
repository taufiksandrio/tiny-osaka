import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";
const RemovedPublicationsPage = async () => {
  await requireAdmin();
  redirect("/admin/pages");
};
export default RemovedPublicationsPage;
