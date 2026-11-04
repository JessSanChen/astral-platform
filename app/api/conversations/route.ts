import { z } from "zod";
import { createConversation } from "@/lib/conversations";
import { getCurrentUser } from "@/lib/gate";
import { assertModelAllowed, getEventSettings, ChatError } from "@/lib/openrouter";

const createSchema = z.object({
  modelId: z.string().min(1),
  scenario: z.string().max(8000).optional(),
});

export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (cu.user.banned)
    return Response.json({ message: "Account paused" }, { status: 403 });
  if (cu.needsProfile || cu.needsTerms)
    return Response.json({ message: "Finish onboarding first" }, { status: 403 });

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
    scenario: parsed.data.scenario,
  });
  return Response.json({ id: convo.id });
}
