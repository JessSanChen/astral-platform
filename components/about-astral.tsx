import {
  ClipboardCheck,
  Folder,
  GitCompareArrows,
  MessagesSquare,
  PenLine,
  Send,
  Trophy,
} from "lucide-react";
import { MAX_PRIZE_ENTRIES } from "@/lib/episode-options";

/**
 * What Astral is, what the day looks like, and how the prizes work.
 *
 * Shown to participants from the sidebar ("How it works"). The front page
 * used to carry it too; it was cut down to the introduction and the way in,
 * so this is now the one place a rule is written.
 *
 * The wording follows sections 7 and 8 of the specification (docs/spec),
 * adjusted to what the platform does. Prize amounts and deadlines are not
 * here because they have not been decided; they are for the organizers to
 * announce, and this page should not guess.
 */

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Start a conversation",
    body: "Say whether the task is based on real work or made up for today, pick a model, and start chatting. Use one of the suggested activities or bring a task of your own.",
  },
  {
    icon: Folder,
    title: "Or a folder of sessions",
    body: "When the work has several related parts, use a folder. Each session in it is a fresh conversation: the assistant does not see the other sessions.",
  },
  {
    icon: Send,
    title: "Submit it once",
    body: "Submit at a natural stopping point. Submitting is final and closes the conversation or folder. Refusals and unfinished conversations can still be useful.",
  },
  {
    icon: GitCompareArrows,
    title: "Try a related version",
    body: "From submitted work you can create a related version: say what you intend to change, then have a fresh conversation. This is optional.",
  },
  {
    icon: ClipboardCheck,
    title: "Review someone else's",
    body: "You are given one record at a time, with nothing about its author, and decide whether it warrants specialist review under the reference policy.",
  },
  {
    icon: Trophy,
    title: "Enter for a prize",
    body: `Mark up to ${MAX_PRIZE_ENTRIES} pieces of your submitted work on the Prizes page. There is nothing to write.`,
  },
];

const PRIZES = [
  {
    award: "Best live contribution",
    rewarded: "A plausible, useful scientific conversation or a genuine novice one.",
  },
  {
    award: "Best multi-session contribution",
    rewarded:
      "Sessions that relate to each other in a meaningful way, in a task that develops and can be followed.",
  },
  {
    award: "Best controlled comparison",
    rewarded:
      "Related versions on a comparable topic and scope, where the change you intended (or the sameness you intended) can be seen.",
  },
  {
    award: "Best evidence-grounded reviewing",
    rewarded:
      "Careful pointing to the turns that matter, reasoned use of the policy, and honesty about uncertainty.",
  },
];

const prose = "space-y-3 text-[15px] leading-relaxed text-muted-foreground";
const heading = "font-serif text-2xl font-medium tracking-tight";

export function AboutAstral() {
  return (
    <div className="space-y-14">
      <section className="space-y-4">
        <h2 className={heading}>Why we are doing this</h2>
        <div className={prose}>
          <p>
            Tools that screen AI conversations for biological misuse have to
            decide, from what is visible in a conversation, whether a
            specialist should take a look. To build and test them you need
            realistic conversations and careful human judgments of them, and
            those barely exist in the open.
          </p>
          <p>
            So we are collecting AI conversations to study when their visible
            content warrants specialist review. Ordinary scientific work,
            genuine novice questions, ambiguous cases and related versions of
            the same task are all useful. You do not have to make a model
            fail, and nothing today rewards a dangerous answer.
          </p>
          <p>
            The day has two halves: writing conversations, and reviewing other
            people&apos;s. Both go into a dataset for building and evaluating
            these tools.
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className={heading}>What you will be doing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="rounded-[var(--radius)] border border-border bg-card p-5"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                  {i + 1}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">{title}</h3>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={`flex items-center gap-2 ${heading}`}>
          <PenLine className="h-5 w-5" />
          Writing conversations
        </h2>
        <div className={prose}>
          <p>
            Under <span className="text-foreground">My chats</span>, start a
            conversation or a folder. You are asked one thing first: whether
            the task is based on a real task of yours or created for this
            exercise. Both are wanted, and the answer is only there so the
            record says which it was. Then choose a model and write. The
            suggested activities are places to start, not categories, and
            using your own task is fine.
          </p>
          <p>
            A folder holds related sessions. Each session is a fresh
            conversation without the history of the others. You can start
            exploring without knowing where it is going, and add a goal or
            note whenever one becomes useful. That note is private: it is
            never sent to the assistant and reviewers never see it.
          </p>
          <p>
            A message that has been sent stays sent, and a reply stays the
            reply. Nothing can be edited or regenerated. If you want to
            correct or clarify something, say so in your next message.
          </p>
          <p>
            Submit once, when you reach a natural stopping point. Submitting
            closes the conversation, or the whole folder, for good, and what
            reviewers are shown is fixed at that moment. A conversation that
            ended in a refusal, or that you did not finish, is still worth
            submitting.
          </p>
          <p>
            To compare another version of something you have submitted, use{" "}
            <span className="text-foreground">Create related version</span>.
            Briefly describe what you will change, then start a fresh
            conversation. Keep the scientific topic and the task as
            comparable as you can. You do not need to make reviewers label
            the two differently: a pair that comes out the same is a useful
            result too.
          </p>
          <p>
            Work within your experience, or honestly as a novice. Write your
            own messages, in English. Do not include patient records,
            personal identifiers, confidential work, credentials, or anything
            you do not have permission to share. Do not ask for or supply
            hazardous biological procedures, operational details of misuse,
            or ways around safeguards. If you disclose something by accident,
            or are unsure whether something is in scope, speak to an
            organizer in person.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={`flex items-center gap-2 ${heading}`}>
          <ClipboardCheck className="h-5 w-5" />
          Reviewing
        </h2>
        <div className={prose}>
          <p>
            Under <span className="text-foreground">Review</span>, read the
            reference policy and answer four short questions about how to
            apply it. They check that the instructions are clear, not what
            you know, and you can try as often as you need. After that you
            are given one record at a time. It may be a single session or
            several linked sessions. Judge exactly what is shown.
          </p>
          <p>
            Apply the policy, not a guess about what the author privately
            intended. A sensitive topic, a reassuring stated purpose, or a
            refusal by the assistant does not settle the answer on its own.
            Point to the turns your answer rests on, and say what you are
            unsure about. Deciding that a record warrants specialist review
            is not an allegation against anyone and not a finding of harm.
          </p>
          <p>
            The form is on one screen and you can change your answers until
            you submit it. If a record is outside your expertise, if you
            recognise it or have discussed it, if you would rather not
            review it, or if it does not display properly, skip it and give
            the reason. A skip is the right answer in those cases and is
            never counted against you. A guess is worse than no answer. You
            can pause at any time and come back.
          </p>
          <p>
            Comparing two versions is a separate task, offered on the same
            page. It shows two related versions side by side and asks how
            well they match. It shows different information from a review,
            which is why you are never given both for the same work.
          </p>
          <p>
            Please do not discuss individual records with other participants
            until you have finished reviewing. An independent second opinion
            is the whole value of this half of the day.
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className={`flex items-center gap-2 ${heading}`}>
          <Trophy className="h-5 w-5" />
          Prizes
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Prizes recognise useful live conversations, meaningful
          multi-session work, well-controlled comparisons, and careful
          reviewing. They do not reward dangerousness, harmful outputs,
          getting around safeguards, length, or volume. Novice questions,
          unfinished tasks, and comparisons that receive the same labels can
          all be valuable, and a goal does not have to be defined before you
          start exploring.
        </p>

        <div className="overflow-hidden rounded-[var(--radius)] border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Award</th>
                <th className="px-4 py-2.5 font-medium">What is rewarded</th>
              </tr>
            </thead>
            <tbody>
              {PRIZES.map((p) => (
                <tr key={p.award} className="border-t border-border">
                  <td className="px-4 py-3 align-top font-medium">{p.award}</td>
                  <td className="px-4 py-3 align-top leading-relaxed text-muted-foreground">
                    {p.rewarded}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            To put your own work forward, mark it on the{" "}
            <span className="text-foreground">Prizes</span> page, or in the
            panel beside the work once it is submitted. You can enter up to{" "}
            {MAX_PRIZE_ENTRIES} pieces, where a piece of work and the related
            versions made from it count as one entry. There is no write-up.
            Entering changes nothing about the record or how it is reviewed.
          </p>
          <p>
            The reviewing award needs no entry. It is judged on a small
            random sample of each person&apos;s completed reviews, not on how
            many they did, and not on whether they agreed with other
            reviewers.
          </p>
          <p>
            Prizes are decided by a separate panel. The amounts, the
            deadline for entries, and how ties are settled will be announced
            by the organizers on the day. No award depends on whether you
            gave permission for public release.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={heading}>What happens to what you write</h2>
        <div className={prose}>
          <p>
            Submitted work is stored with the answers you gave when you
            signed up, so the research team knows the background behind each
            record. Those answers are never shown to other participants.
          </p>
          <p>
            Every message is saved as it is sent, so a conversation you never
            get round to submitting is kept as well, marked as not submitted.
            Copying and pasting inside a conversation is recorded too: what
            was pasted in, and what was copied out. A prompt written
            elsewhere and pasted in reads differently from one typed here,
            and the record should say which it was.
          </p>
          <p>
            Other participants see your submitted work only when it is
            assigned to them for review, and then without your name, your
            goal note, or whether you called the task real or invented. That
            blindness is the point: it is what makes a second opinion worth
            having.
          </p>
          <p>
            The chat is text only, on purpose. Nothing can be uploaded.
          </p>
        </div>
      </section>
    </div>
  );
}
