import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/access.mjs";

const SecurityPage = async () => {
  await requireAdmin();
  redirect("/admin/account");
};
export default SecurityPage;
