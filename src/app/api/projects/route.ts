import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { withApiPerf } from "@/lib/perf";
import { getSelectableProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiPerf("/api/projects", async () => {
    try {
      const user = await getCurrentUser();
      return jsonOk({ projects: await getSelectableProjects(user) });
    } catch (error) {
      return jsonError(error);
    }
  });
}
