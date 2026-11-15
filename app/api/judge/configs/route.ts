import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { listJudgeConfigs } from "@/lib/judges";

export async function GET() {
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Unauthorized" }, { status: 401 });
  // Organizers only. Showing participants what a scanner made of their
  // conversation was dropped with specification v1.1, and leaving the
  // endpoint open would be offering it by another door.
  if (!cu.isAdmin) return Response.json({ message: "Not found." }, { status: 404 });
  const blocked = whyBlocked(cu);
  if (blocked) return Response.json(blocked, { status: 403 });
  const configs = await listJudgeConfigs();
  return Response.json({
    configs: configs.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
  });
}
