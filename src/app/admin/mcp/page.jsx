import { requireAdmin } from "@/server/auth/access.mjs";
import { getMcp } from "@/server/mcp/runtime.mjs";
import McpClientsBoard from "@/features/cms/mcp/McpClientsBoard";
const McpPage = async () => {
  await requireAdmin("owner");
  const clients = await getMcp().clients.list();
  return <main id="main-content" tabIndex={-1}><McpClientsBoard initial={clients} /></main>;
};
export default McpPage;
