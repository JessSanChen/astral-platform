import { getCurrentUser } from "@/lib/gate";
import { listJudgeConfigs } from "@/lib/judges";

export async function GET() {
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Unauthorized" }, { status: 401 });
  const configs = await listJudgeConfigs();
  return Response.json({
    configs: configs.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
  });
}
