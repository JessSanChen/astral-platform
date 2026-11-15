import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { requireOnboarded } from "@/lib/gate";
import { INFOHAZARD_GUIDE } from "@/lib/infohazard-guide";

export const metadata = { title: "Infohazard guide" };

/**
 * The infohazard guide: what may and may not leave the room, and what to
 * do when something in a conversation is worrying. For everyone taking
 * part, from the menu, at any time.
 */
export default async function InfohazardGuidePage() {
  await requireOnboarded();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <article className="markdown infohazard-guide text-[15px] leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{INFOHAZARD_GUIDE}</ReactMarkdown>
      </article>
    </div>
  );
}
