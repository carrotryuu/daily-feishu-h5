import { jsonError, jsonOk } from "@/lib/api";
import { withApiPerf } from "@/lib/perf";
import { getSelectableProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiPerf("/api/projects", async () => {
    try {
      return jsonOk({ projects: await getSelectableProjects() });
    } catch (error) {
      return jsonError(error);
    }
  });
}
