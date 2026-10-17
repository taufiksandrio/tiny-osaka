import { Badge } from "@/components/ui/badge";

const labels = { draft: "Draft", review: "Menunggu review", approved: "Disetujui",
  rejected: "Ditolak", published: "Terbit", archived: "Diarsipkan" };
const RevisionStatus = ({ status }) => <Badge data-status={status} variant={status === "published" ? "default" :
  status === "rejected" ? "destructive" : status === "archived" ? "outline" : "secondary"}>
  {labels[status] ?? status}
</Badge>;
export default RevisionStatus;
