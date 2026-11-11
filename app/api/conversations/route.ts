import { z } from "zod";
import { createConversation } from "@/lib/conversations";
import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { assertModelAllowed, getEventSettings, ChatError } from "@/lib/openrouter";

const createSchema = z.object({
  modelId: z.string().min(1),
});

export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Unauthorized" }, { status: 401 });
  const blocked = whyBlocked(cu);
  if (blocked) return Response.json({ message: blocked.message }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return Response.json({ message: "Invalid request" }, { status: 400 });

  const settings = await getEventSettings();
  try {
    assertModelAllowed(parsed.data.modelId, settings.enabledModels);
  } catch (e) {
    if (e instanceof ChatError)
      return Response.json({ message: e.message }, { status: 400 });
    throw e;
  }

  const convo = await createConversation({
    userId: cu.user.id,
    modelId: parsed.data.modelId,
  });
  return Response.json({ id: convo.id });
}
