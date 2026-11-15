import { z } from "zod";
import { createEpisode } from "@/lib/episodes";
import {
  ACTIVITY_TEMPLATE_IDS,
  LIMITS,
  PROVENANCE_VALUES,
} from "@/lib/episode-options";
import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { assertModelAllowed, getEventSettings, ChatError } from "@/lib/openrouter";

const createSchema = z.object({
  modelId: z.string().min(1),
  // Nothing is asked before starting. Whether the task is real or invented
  // is answered in the side panel, and has to be by the time it is
  // submitted. It may still be sent here.
  provenance: z.enum(PROVENANCE_VALUES).nullish(),
  template: z.enum(ACTIVITY_TEMPLATE_IDS).nullish(),
  goal: z.string().trim().max(LIMITS.goal).nullish(),
  folder: z.boolean().optional(),
});

/** Starts a conversation, or a folder with its first session. */
export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Unauthorized" }, { status: 401 });
  const blocked = whyBlocked(cu);
  if (blocked) return Response.json({ message: blocked.message }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const settings = await getEventSettings();
  try {
    assertModelAllowed(parsed.data.modelId, settings.enabledModels);
  } catch (e) {
    if (e instanceof ChatError)
      return Response.json({ message: e.message }, { status: 400 });
    throw e;
  }

  const { episode, session } = await createEpisode({
    userId: cu.user.id,
    modelId: parsed.data.modelId,
    provenance: parsed.data.provenance,
    template: parsed.data.template,
    goal: parsed.data.goal,
    folder: parsed.data.folder,
  });
  return Response.json({
    id: session.id,
    episodeId: episode.id,
    episodeTitle: episode.title,
    isFolder: episode.isFolder,
  });
}
