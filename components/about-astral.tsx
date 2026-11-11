import {
  ClipboardCheck,
  MessagesSquare,
  ShieldCheck,
  Tag,
  Trophy,
} from "lucide-react";

/**
 * What Astral is, what the day looks like, and how the prizes work.
 *
 * Shown to participants from the sidebar ("How it works"). The front page
 * used to carry it too; it was cut down to the introduction and the way in,
 * so this is now the one place a deadline or a prize rule is written.
 */

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Have a conversation",
    body: "Pick a model and talk to it. Benign questions, dual-use ones, or a deliberate attempt to get something it should refuse. Breadth counts for more than any single dramatic result.",
  },
  {
    icon: Tag,
    title: "Say what you were doing",
    body: "Label the conversation: what kind it was, the role you were playing, what you wanted, and how the model responded. You know your own intent, and nothing else in the dataset does. This is the part that makes a transcript usable.",
  },
  {
    icon: ClipboardCheck,
    title: "Review someone else's",
    body: "Read transcripts from other participants with the author and their labels hidden, and judge them on what you can see. People describe their own intent generously; an independent read is how we find out where that matters.",
  },
  {
    icon: Trophy,
    title: "Put your best work forward",
    body: "Three of the prizes are decided by nomination. Write up what you found, why it matters, and how widely you tested it, then present it.",
  },
];

const PRIZES = [
  {
    track: "Adversarial use cases",
    decided: "Nominate, then present",
    detail:
      "The most interesting, relevant or impactful finding about an adversarial actor.",
    deadline: "15:00",
  },
  {
    track: "Dual-use use cases",
    decided: "Nominate, then present",
    detail:
      "The same, where a legitimate purpose and a harmful one are served by the same answer.",
    deadline: "15:00",
  },
  {
    track: "Linked or collaborative",
    decided: "Nominate, then present",
    detail: "A finding that came out of working with other participants.",
    deadline: "15:00",
  },
  {
    track: "Benign transcripts",
    decided: "Counted by the platform",
    detail:
      "Volume of submitted benign transcripts, checked by the organizers for quality.",
    deadline: "16:00",
  },
  {
    track: "Independent reviewer",
    decided: "Counted by the platform",
    detail:
      "Reviews completed on other people's transcripts, checked the same way.",
    deadline: "16:00",
  },
];

export function AboutAstral() {
  return (
    <div className="space-y-14">
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium tracking-tight">Why we are doing this</h2>
        <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            Tools that screen AI conversations for biological misuse have to be
            built against examples of what misuse actually looks like when
            someone is attempting it. Those examples barely exist in the open.
            The organizations holding real cases do not publish them, for good
            reasons.
          </p>
          <p>
            The obvious shortcut does not work either. Ask a model to produce a
            misuse attempt and it refuses, so what you collect is a pile of
            refusals, which teaches a scanner nothing about the thing it is
            supposed to catch.
          </p>
          <p>
            So the data has to be made deliberately, by people who know the
            science well enough to be convincing and are working in the open,
            on the record, for one day. That is what today is. Everything you
            submit becomes part of a dataset for building and evaluating these
            scanners.
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="font-serif text-2xl font-medium tracking-tight">What you will be doing</h2>
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
        <h2 className="flex items-center gap-2 font-serif text-2xl font-medium tracking-tight">
          <ShieldCheck className="h-5 w-5" />
          The scanners are there to be tested, not trusted
        </h2>
        <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            Alongside each of your conversations you can run two detectors of
            the kind this research is about: an LLM acting as a judge, and
            Llama Guard, a purpose-built safety classifier. They give you their
            verdict on your own transcript.
          </p>
          <p>
            They are both wrong some of the time, in different and fairly
            predictable ways. Finding a conversation where one flags and the
            other does not, or where both miss something a person would catch
            immediately, is not a bug report. It is the finding. Several of the
            prizes are won by exactly that.
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="flex items-center gap-2 font-serif text-2xl font-medium tracking-tight">
          <Trophy className="h-5 w-5" />
          Prizes
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Five tracks, $1,000 each. Three are decided by nomination and a short
          presentation; two are counted by the platform and then checked by the
          organizers, so volume alone will not win them.
        </p>

        <div className="overflow-hidden rounded-[var(--radius)] border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Track</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">
                  How it is decided
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {PRIZES.map((p) => (
                <tr key={p.track} className="border-t border-border">
                  <td className="px-4 py-3 align-top">
                    <span className="font-medium">{p.track}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {p.detail}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground sm:hidden">
                      {p.decided}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 align-top text-muted-foreground sm:table-cell">
                    {p.decided}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {p.deadline}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Nominations close at 15:00 and you can edit an entry freely until
          then. One entry per track, so revise rather than resubmit. The two
          counted tracks stop at 16:00.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium tracking-tight">What happens to what you write</h2>
        <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            Submitted conversations are stored with your labels and the profile
            you filled in at sign-up, so the research team knows the expertise
            behind each one. Your profile is never shown to other participants.
          </p>
          <p>
            Other participants do see your transcripts during review, with your
            name and your own labels hidden. That blindness is the point: it is
            what makes a second opinion worth having.
          </p>
          <p>
            You are role-playing for research. Do not use real material from
            your own work, and do not upload anything — the chat is text only,
            on purpose.
          </p>
        </div>
      </section>
    </div>
  );
}
