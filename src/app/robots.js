import { getRobotsRules } from "@/server/public/indexing.mjs";

// Read env per request: staging/production share a build and differ only by runtime variables.
export const dynamic = "force-dynamic";

const robots = () => getRobotsRules();

export default robots;
