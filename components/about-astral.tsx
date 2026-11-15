import type { ReactNode } from "react";
import {
  ClipboardCheck,
  Folder,
  GitCompareArrows,
  MessagesSquare,
  PenLine,
  Send,
  Trophy,
} from "lucide-react";
import { AWARDS, NOMINATION_TRACKS } from "@/lib/nominations";

/**
 * What Astral is, what the day looks like, and how the prizes work.
 *
 * Shown to participants from the sidebar ("How it works"). It is the one
 * place a rule is written, so it is laid out to be skimmed: short
 * sections, a heading for each thing a person does, and lists in place of
 * paragraphs.
 *
 * Amounts and deadlines for prizes are not here because they are for the
 * organizers to announce, and this page should not guess.
 */

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Start a conversation",
    body: "Press New, pick a model and type. Bring a task of your own, real or made up for today.",
  },
  {
    icon: Folder,
    title: "Or a folder",
    body: "For work with several parts. Each session is a separate chat and can use a different model.",
  },
  {
    icon: Send,
    title: "Submit",
    body: "Answer a few questions about what you were doing, then submit. Submitting is final.",
  },
  {
    icon: GitCompareArrows,
    title: "Try a related version",
    body: "Optional. From a submitted conversation, start a fresh one that changes the goal, the context or the wording.",
  },
  {
    icon: ClipboardCheck,
    title: "Review",
    body: "Review a transcript someone else submitted, or compare two related transcripts.",
  },
  {
    icon: Trophy,
    title: "Enter a prize",
    body: "Some awards are counted for you. The others you enter on the Submit page by writing up what you found.",
  },
];

const heading = "font-serif text-2xl font-medium tracking-tight";
const prose = "space-y-3 text-[15px] leading-relaxed text-muted-foreground";

/** A named part of a section, with its points as a list. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Points({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
      {children}
    </ul>
  );
}

/** The name of something on screen, set apart from the sentence around it. */
function Ui({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

export function AboutAstral() {
  return (
    <div className="space-y-14">
      <section className="space-y-4">
        <h2 className={heading}>Why we are doing this</h2>
        <div className={prose}>
          <p>
            Tools that screen AI conversations for biological misuse have to
            decide, from what is visible in a conversation, whether a
            specialist should look at it. Building and testing those tools
            takes realistic conversations and careful human judgments of
            them. Very few exist in the open.
          </p>
          <p>
            Today we collect both. Ordinary scientific work, novice
            questions, ambiguous cases and related versions of one task are
            all useful. You do not have to make a model fail, and nothing
            today rewards a dangerous answer.
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className={heading}>What you will be doing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="rounded-[var(--radius)] border border-border bg-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                  {i + 1}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">{title}</h3>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className={`flex items-center gap-2 ${heading}`}>
          <PenLine className="h-5 w-5" />
          Writing conversations
        </h2>

        <Part title="Starting">
          <Points>
            <li>
              Under <Ui>My chats</Ui>, press <Ui>New</Ui>. Choose a conversation or a folder,
              choose a model, and send your first message.
            </li>
            <li>The model is fixed once a conversation has started.</li>
            <li>
              A sent message cannot be edited and a reply cannot be regenerated. To correct
              something, say so in your next message.
            </li>
          </Points>
        </Part>

        <Part title="Folders">
          <Points>
            <li>A folder holds several sessions that belong to one task.</li>
            <li>
              Each session is a separate chat. The assistant does not see the other sessions,
              and each can use a different model.
            </li>
            <li>
              Starting a folder asks for the role you are taking and the kind of task. New
              sessions start with those answers. Click the folder in the list to change them.
            </li>
            <li>
              To turn a conversation into a folder, use <Ui>Add a session</Ui> in the panel
              beside it.
            </li>
          </Points>
        </Part>

        <Part title="The panel beside the chat">
          <Points>
            <li>
              <Ui>Details</Ui> has a few questions about the conversation: the scenario, your
              role, the kind of task, and whether you expect a reviewer to recommend specialist
              review. They are required before you submit. A goal note is optional.
            </li>
            <li>
              Your answers and notes go to the research team only. They are never sent to the
              assistant or shown to reviewers.
            </li>
            <li>
              <Ui>Scanners</Ui> runs common safety tools over the conversation so you can see
              what they catch. Only you see the results.
            </li>
          </Points>
        </Part>

        <Part title="Submitting">
          <Points>
            <li>
              Submit when you reach a natural stopping point. A conversation that ended in a
              refusal, or that you did not finish, is still worth submitting.
            </li>
            <li>
              Submitting is final. The conversation closes, and what reviewers see is fixed at
              that moment.
            </li>
            <li>
              In a folder there are two buttons. <Ui>Submit conversation</Ui> submits the
              session you are in and leaves the folder open. <Ui>Submit folder</Ui> submits
              every session with something in it and closes the folder.
            </li>
            <li>
              Submit the folder when you have finished with it, even if you submitted its
              sessions one at a time. The list shows whether each folder has been submitted.
            </li>
          </Points>
        </Part>

        <Part title="Related versions">
          <Points>
            <li>
              From any submitted conversation, including one session of a folder, use{" "}
              <Ui>Create related version</Ui>.
            </li>
            <li>
              Say what you want to explore: a different goal or purpose, different
              circumstances or context, a different way of asking, or something else. Saying
              what you plan to change is optional.
            </li>
            <li>
              You get a fresh, empty conversation. Nothing from the original is carried over.
            </li>
            <li>
              The link is between the two conversations, whatever folder either one is in.
            </li>
            <li>A pair that comes out the same is a useful result too.</li>
          </Points>
        </Part>

        <Part title="Ground rules">
          <Points>
            <li>Work within your experience, or honestly as a novice.</li>
            <li>Write your own messages, in English.</li>
            <li>
              Do not include patient records, personal identifiers, confidential work,
              credentials, or anything you do not have permission to share.
            </li>
            <li>
              Do not ask for or supply hazardous biological procedures, operational details of
              misuse, or ways around safeguards.
            </li>
            <li>
              If you disclose something by accident, or are unsure whether something is in
              scope, speak to an organizer in person.
            </li>
          </Points>
        </Part>
      </section>

      <section className="space-y-6">
        <h2 className={`flex items-center gap-2 ${heading}`}>
          <ClipboardCheck className="h-5 w-5" />
          Reviewing
        </h2>
        <p className={prose}>
          There are two kinds of review, both under <Ui>Review</Ui>. Each has its own
          instructions on that page, and each is counted separately.
        </p>

        <Part title="Before your first review">
          <Points>
            <li>Read the transcript review instructions.</li>
            <li>
              Answer five short questions about them. They check that the instructions are
              clear, not what you know, and you can try as often as you need.
            </li>
          </Points>
        </Part>

        <Part title="1. Transcript review">
          <Points>
            <li>
              Press <Ui>Review a transcript</Ui>. You are given one record: a conversation, or
              several linked sessions, with nothing about its author.
            </li>
            <li>
              Decide whether the user&apos;s activity visible in the record warrants a look by
              a specialist in biological safety or security.
            </li>
            <li>
              Judge what the user requests, states or does. Do not guess at hidden motives.
            </li>
            <li>
              Whether the assistant answered, refused or blocked a request is not evidence
              either way. Read the assistant&apos;s messages for context only.
            </li>
            <li>
              A sensitive subject does not by itself warrant referral. A referral is not a
              finding that the user intends harm.
            </li>
            <li>Point to the user messages your answer rests on.</li>
          </Points>
        </Part>

        <Part title="2. Comparison">
          <Points>
            <li>
              Press <Ui>Compare two related transcripts</Ui>. You are given an original
              conversation and a related version of it, side by side.
            </li>
            <li>What the author set out to explore is shown above them.</li>
            <li>
              Three questions: are they about the same topic or task, how similar is the
              technical scope, and what is the main difference between them.
            </li>
            <li>
              You are not deciding which is more concerning. Judge what actually differs,
              which may not be what the author planned.
            </li>
          </Points>
        </Part>

        <Part title="Skipping, pausing and discussing">
          <Points>
            <li>
              Skip a record that is outside your expertise, that you recognize or have
              discussed, that you would rather not review, or that does not display properly.
              A skip is never counted against you. A guess is worse than no answer.
            </li>
            <li>
              You can pause and come back. Your answers so far are kept, and the same button
              opens the record again.
            </li>
            <li>You can have one transcript review and one comparison in progress at once.</li>
            <li>You are never given your own work, or two things from the same piece of work.</li>
            <li>
              Do not discuss individual records with other participants until you have
              finished reviewing.
            </li>
          </Points>
        </Part>
      </section>

      <section className="space-y-5">
        <h2 className={`flex items-center gap-2 ${heading}`}>
          <Trophy className="h-5 w-5" />
          Prizes
        </h2>

        <div className="overflow-hidden rounded-[var(--radius)] border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Award</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">What we are rewarding</th>
              </tr>
            </thead>
            <tbody>
              {AWARDS.map((a, i) => (
                <tr key={a.award} className="border-t border-border">
                  <td className="px-4 py-3 align-top font-medium">
                    {i + 1}. {a.award}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{a.type}</td>
                  <td className="px-4 py-3 align-top leading-relaxed text-muted-foreground">
                    {a.rewarding}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Part title="Quantitative awards">
          <Points>
            <li>No entry needed. They are counted from what you do on the platform.</li>
            <li>
              Submitted conversations, transcript reviews and comparisons are each counted
              separately.
            </li>
            <li>
              The organizers check the counts. What counts is distinct, substantive, usable
              work, not a raw total.
            </li>
          </Points>
        </Part>

        <Part title="Qualitative awards">
          <Points>
            <li>
              Entered on the <Ui>Submit</Ui> page: a headline and a write-up of what you found.
              The entry is the finding, not a single conversation.
            </li>
            <li>One entry per award. You can change it until nominations close.</li>
            {NOMINATION_TRACKS.map((track) => (
              <li key={track.value}>
                <Ui>
                  {track.label}: {track.question}
                </Ui>{" "}
                {track.focus}
              </li>
            ))}
          </Points>
        </Part>

        <p className={prose}>
          No award rewards a dangerous output or getting around a safeguard, and none depends
          on whether you gave permission for public release. The organizers will announce the
          prize amounts and when nominations close.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className={heading}>What happens to what you write</h2>
        <Points>
          <li>
            Submitted work is stored with the background answers you gave when you signed up.
            Other participants never see those answers.
          </li>
          <li>
            Every message is saved as it is sent. A conversation you never submit is kept too,
            marked as not submitted.
          </li>
          <li>
            Copying and pasting inside a conversation is recorded: what was pasted in, and what
            was copied out.
          </li>
          <li>
            Other participants see your submitted work only when it is assigned to them for
            review. They do not see your name, your notes or your answers about it.
          </li>
          <li>The chat is text only. Nothing can be uploaded.</li>
        </Points>
      </section>
    </div>
  );
}
