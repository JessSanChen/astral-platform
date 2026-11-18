# Analysing what the event produced

One command turns an export into tables, a report, a contact log and a
reading list. It reads one file and writes one folder. It does not touch
the database, the live site or the internet.

## Running it

1. On the live site: **Organize → Settings → Download everything**. Keep
   the file somewhere safe; it is the fixed copy the analysis is run on.
2. In the project folder:

   ```bash
   npm run analysis -- ~/Downloads/astral-2026-11-18.jsonl
   ```

3. Open `analysis-out/<time>/report.html`.

Section 1 of the report says who was counted. No account was marked as a
tester before the event, so the first run counts the accounts made
during testing. Its table "When accounts were made" shows them; run
again with the time the event began to leave them out:

```bash
npm run analysis -- ~/Downloads/astral-2026-11-18.jsonl --testers-before 2026-11-15T09:00
```

| Option | What it does |
|---|---|
| `--testers-before 2026-11-15T09:00` | Accounts made before this (Boston time) are treated as test accounts |
| `--exclude a@x.org,b@y.org` | Leave these accounts out |
| `--keep c@z.org` | Keep these whatever else applies (someone real who signed up early) |
| `--keep-organizers` | Count organizers' own work; it is left out otherwise |
| `--reading-list 40` | How many pieces of work the reading list shows |
| `--site https://astralmonitor.org` | Where the links to the console point |

## What it writes

| File | What it is | Who may see it |
|---|---|---|
| `report.html` | Counts and tables: who took part, what they made, how it was reviewed, how far reviewers agree, whether background changes verdicts, matched sets, folders | People are P-numbers and there is no conversation text. Small groups can still point to a person, so organizers, until you decide otherwise |
| `tables/*.csv` | The same data as rows, for a spreadsheet or for R or Python | No names, email addresses or conversation text |
| `identified/contact-log.csv` | Everyone in the analysis, strongest background first, with their background, what they did, and empty columns for your outreach notes | **Organizers only**: names and email addresses |
| `identified/reading-list.html` | The work with the most reasons to be read by an expert, each with its reasons, its reviews and the conversation | **Organizers only**: names and conversations |
| `identified/reading-list.csv` | Every piece of work with its score and reasons, and columns for your notes | **Organizers only** |
| `identified/people.csv` | Which person is which P-number; who was left out and why | **Organizers only** |

The `analysis-out` folder is kept out of git.

## The rules it applies

All of these are named constants in `scripts/analysis/measure.ts`.
Change one and run again; the report prints the ones that matter.

- **Who is left out**: accounts marked as testers, organizers, and
  whatever the options name. Their work, their reviews, and reviews of
  their work go with them.
- **Which reviews are used**: completed ones made with form C-2.x.
  Earlier forms asked different questions and are counted but set
  aside. A changed review counts by its answers as they now stand; the
  agreement table also shows first answers.
- **Background score, 0 to 10**: best self-rated familiarity in a
  life-science area (0 to 3) + longest applied experience in wet-lab,
  clinical or public-health work, or computational research for someone
  who named a life-science area (0 to 4) + career stage (0 to 3).
  Strong is 7 or more, Solid is 4 to under 7. This is a way of sorting
  people invented for this analysis, not a measure from the literature.
- **Fast review**: under 15 seconds on the record, or under 3 seconds
  per user message.
- **Trivial record**: the user wrote fewer than 20 characters in all.
- **Agreement**: every pair of reviews of the same record, and
  Krippendorff's alpha for categories without an order.
- **Reading-list points**: `SHORTLIST_POINTS`. Author's background,
  length (messages, characters, sessions, minutes), what reviewers said
  (a Yes, a majority Yes, disagreement, g2 or g3, a2 or a3), what the
  author said (dual-use or concerning scenario, expected referral),
  being part of a matched set, long replies, failed or empty replies,
  and the author copying text out of replies. Nothing reads the text.

## How it was checked

- Run on a real export made by the application (through the browser
  tests), so the record shapes are the application's own.
- Run on an invented export of about the event's size (90 accounts, 190
  pieces of work, 290 reviews). Agreement and alpha were recomputed
  separately from `tables/reviews.csv` and match the report; the totals
  in the tables match each other.
- No name, email address or conversation text appears in `report.html`
  or `tables/`. Conversation text in the reading list is escaped. A
  name a spreadsheet would run as a formula is written as plain text.
- A file cut short is reported, not analysed as if it were whole.

It has not been run on the event's own export: that file has never left
the organizers.

## What comes next

1. **Light content coding.** A model reads each submitted session and
   assigns a few categories (topic, what the user was trying to get,
   whether the assistant declined). Planned as a second command that
   sends sessions to an open-weight model through OpenRouter, the route
   the conversations already took on the day, and writes
   `tables/content_codes.csv` keyed by session. Needs the list of
   categories deciding first, and a check on a sample of how many
   sessions the model declines to read.
2. **Expert reading** of the reading list, with the notes columns in
   `reading-list.csv` as the record.
3. **Outreach** from the contact log.
