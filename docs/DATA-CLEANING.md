# Cleaning the event data: what to do, in order

A checklist for turning what the event collected into the corpus the
proposal describes. Each step says what to do, what decision it needs,
and where the result is recorded. Tick a box when it is done.

Nothing here changes the live database except steps 1 and 2. Everything
else is a choice applied when the analysis is run, so it can be changed
and run again.

Decisions are marked **Decide**. Record each one in the table at the
end, with who decided and when, so the paper's methods section can be
written from it.

---

## 1. Freeze

- [ ] Organize → Settings: pause chat. Organize → Nominations: lock.
- [ ] Organize → Settings → **Download everything**. Keep the file
      unchanged, somewhere backed up and private. This is the fixed
      copy; every later step reads it.
- [ ] Note the file's name, the time it was downloaded, and that it
      ends with a line saying `"record":"end"` (the analysis checks
      this and warns if not).
- [ ] In Neon: take a backup or a branch of the database as it is now,
      before any plan change.

## 2. Mark the test accounts (the one change to the live data)

No account was marked as a tester before the event, so test accounts
are counted with participants everywhere.

- [ ] Run `npm run analysis -- <file>` once and open section 1 of the
      report: "When accounts were made".
- [ ] **Decide** the moment the event began (Boston time). Accounts
      made before it are test accounts unless named otherwise.
- [ ] List anyone real who signed up early (to keep) and any test
      account made on the day (to leave out).
- [ ] Either mark those accounts as testers on Organize → Participants
      and download the export again, or leave the database alone and
      pass `--testers-before`, `--keep` and `--exclude` to the
      analysis. The second is easier to undo. Do not use "Mark everyone
      so far as a tester": it would mark the participants too.
- [ ] **Decide** whether organizers' own work and reviews count. The
      analysis leaves them out unless told `--keep-organizers`.

## 3. Check the export against the site

- [ ] Run the seven queries in `scripts/verify-overview.sql` in Neon.
      Query 2 should say `matches` on every row; query 3 should return
      nothing.
- [ ] Compare the report's totals (accounts, work, reviews) with the
      console's Overview, allowing for who was left out in step 2.
- [ ] Query 4: how many submitted sessions have no reviewer view. They
      were submitted before reviewer views existed and are expected to
      be test data. Confirm each is, or list the ones that are not.

## 4. Decide which conversations are in the corpus

- [ ] **Decide** what happens to records that are not an attempt at
      anything ("test", "hello"; the analysis marks any where the user
      wrote under 20 characters). Read them: there are few.
- [ ] **Decide** whether drafts never submitted are in the corpus. The
      author did not label them and nobody reviewed them, but the
      messages exist. Suggested: out of the benchmark, kept as
      unlabelled ordinary traffic if the terms allow.
- [ ] Sessions with failed or empty replies: keep, but check the count
      per model in section 3 of the report. A model that failed often
      is a different condition.
- [ ] Remove nothing from the export. Exclusions are a list of ids with
      a reason each.

## 5. Group conversations that should have been folders

Some people pursued one goal across several separate conversations
without making a folder, and the platform had no way to move an
existing conversation into one. The proposal's "decomposed goals" and
linked sessions depend on this grouping.

- [ ] Find the candidates: the same author, several conversations close
      in time, on one subject. `tables/sessions.csv` sorted by author
      and time is the place to start; ask the authors where unsure.
- [ ] Record each grouping in a file, `folders-added.csv`: one row per
      session, with the id of the group it belongs to, its order, who
      decided, and why. Do not edit the database: the original
      submission stays as its author made it.
- [ ] **Build work (not done):** teach the analysis to read that file
      and treat each group as a folder. Listed in `docs/TODO.md`.
- [ ] Be clear about what this does not give you. Reviewers judged
      those sessions one at a time and never saw them together, so a
      group made afterwards has no "read whole" verdict. **Decide**
      whether to get those reviewed now (step 7) or to report them as
      grouped by the organizers, unreviewed as a whole.
- [ ] Keep the two kinds apart in every table: folders made by their
      authors on the day, and groups made afterwards.

## 6. Decide which reviews count

The proposal's label is the vote of two experts, a third on
disagreement, with reviewers who are life scientists. What was
collected differs, and each difference needs a decision.

- [ ] **Who counts as an expert.** Anyone who passed the instruction
      check could review anything. **Decide** the rule for a review to
      enter the ground truth (for example: self-rated F2 or F3 in a
      life-science area). Section 6 of the report shows how much data
      each rule leaves.
- [ ] **Reviewer quality.** One person did 83 of the 276 reviews, at a
      median of 43 seconds. Use `npm run prod:review-audit -- --all`
      for the side-by-side table, spot-check the heaviest and fastest
      reviewers, and **decide** per person: keep, keep with a flag, or
      leave out. No seeded items with a known answer and no repeated
      items were used, so reading is the only check there is.
- [ ] **Fast reviews.** **Decide** a floor (the analysis marks under 15
      seconds on a record, or under 3 seconds per user message) and
      whether such reviews are dropped or flagged.
- [ ] **Changed reviews.** **Decide** first answer or last. Both are in
      the export. First answers are the independent ones.
- [ ] **Earlier forms.** Reviews made with a form before C-2 asked
      different questions and are set aside by the analysis. Confirm
      the count is small and all from testing.
- [ ] **Records with one review, or none.** On the day 19 records had
      three reviews, about 130 had one or two, and 22 had none. A
      record with one review has no agreement to measure and no
      majority. **Decide**: collect more reviews (step 7), or restrict
      the labelled set to records with two or more.

## 7. Fill the gaps the day left (new data, optional)

- [ ] **Decide** whether to run a second round of reviewing, by
      invited life scientists, to bring every record in the corpus to
      two reviews and a third on disagreement. The platform can do
      this as it stands. Reviews from a second round must be marked as
      such: different day, different reviewers.
- [ ] If so, include the groups from step 5 so that they get a
      "read whole" review.
- [ ] Matched sets: 6 related conversations were made and 5 compared.
      That is too few for the within-set analysis (E2). **Decide**
      whether to commission more, from the same authors or new ones.

## 8. Check the labels make sense before using them

- [ ] Agreement (section 5 of the report), overall and under each
      choice from step 6. If it moves a lot between choices, the
      choice matters and must be reported.
- [ ] Verdict against sensitivity and aim (section 4): Yes should rise
      with both. If it does not, the scales were not understood.
- [ ] Verdict against what authors expected (section 7).
- [ ] Read every record where reviewers disagree. Mark each as a
      genuine gray-zone case or as a careless review.

## 9. Information hazards and consent

- [ ] Read what participants agreed to (the terms as published on the
      day, not the draft) for: research use, sharing with a model
      provider for coding, release tiers, and being contacted
      afterwards.
- [ ] An information-hazard read of every record a reviewer rated g2
      or g3, and of the reading list, before any text leaves the
      organizers. Assign each record a release tier from the proposal:
      public without text, on request, or not released.
- [ ] Remove or mask anything personal that people typed into
      conversations (names, institutions, unpublished work).
- [ ] The files in `analysis-out/*/identified/` and the spot-check
      pages stay with the organizers.

## 10. Write down what was done

- [ ] Fill in the table below.
- [ ] Keep the exact command used for the final run of the analysis.
- [ ] Keep the exclusion list and `folders-added.csv` beside the
      export.

| Decision | Chosen | By | Date |
|---|---|---|---|
| Event start time; who is a tester | | | |
| Organizers' work counted? | | | |
| Trivial records | | | |
| Drafts | | | |
| Conversations grouped as folders afterwards | | | |
| Who counts as an expert reviewer | | | |
| Reviewers left out or flagged | | | |
| Fast reviews | | | |
| First or last answer | | | |
| Minimum reviews per record | | | |
| Second round of reviewing | | | |
| More matched sets | | | |
| Release tier per record | | | |

---

## Where the data differs from the proposal

Worth knowing before promising any experiment.

| The proposal says | What was collected |
|---|---|
| Two reviewers per item, a third on disagreement | Up to three, handed out at random; most records have one or two |
| Labels on life-science items from life scientists only | Any participant who passed the instruction check |
| A yes/no vote and a priority on an ordered scale | Yes / No / Cannot determine, and confidence. No priority scale |
| Sensitivity `g`, evidence `a`, and observed behaviors `b` | `g` and `a` (four levels each). No list of behaviors; reviewers point to user messages instead |
| Seeded items of known label and repeated items | Neither |
| Matched sets on a vetted list of topics | Authors chose freely; 6 related conversations |
| Reviewers blind to how a conversation was produced | Yes: they saw the messages only |
| One author writes every variant in a set | Yes |
| Author-side records kept apart from the text | Yes: scenario, role, task, expected verdict, goal |
