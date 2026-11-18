/**
 * Turns one export file into tables, a descriptive report, a contact log
 * and a reading list.
 *
 *   npm run analysis -- path/to/astral-2026-11-18.jsonl
 *
 * The export is the file from Organize → Settings → "Download everything".
 * Nothing here touches the database or the internet: it reads that one
 * file and writes a folder, analysis-out/<time>/, beside the project:
 *
 *   report.html              counts and tables; people shown as P-numbers
 *   tables/*.csv             the same data as rows, without names or text
 *   identified/contact-log.csv     people, strongest background first,
 *                                  with columns for your outreach notes
 *   identified/reading-list.html   work worth an expert reading, and why
 *   identified/reading-list.csv    every piece of work with its score
 *   identified/people.csv          which person is which P-number
 *
 * The identified folder has names, email addresses and conversations.
 *
 * Options:
 *   --testers-before 2026-11-15T09:00   accounts made before this (Boston
 *                                       time) are treated as test accounts
 *   --exclude a@x.org,b@y.org           leave these accounts out
 *   --keep c@z.org                      keep these whatever else applies
 *   --keep-organizers                   count organizers' own work too
 *   --reading-list 40                   how many pieces of work to show
 *   --site https://astralmonitor.org    where the console links point
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadExport } from "./load";
import { applyRules, buildWork, joinComparisons, joinReviews, type Rules } from "./measure";
import { contactLog, peopleKey, readingList, tables } from "./outputs";
import { report } from "./report";

const USAGE = `
Give the export file:
  npm run analysis -- path/to/astral-2026-11-18.jsonl

Options:
  --testers-before 2026-11-15T09:00   accounts made before this (Boston time) are test accounts
  --exclude a@x.org,b@y.org           leave these accounts out
  --keep c@z.org                      keep these whatever else applies
  --keep-organizers                   count organizers' own work too
  --reading-list 40                   how many pieces of work the reading list shows
  --site https://astralmonitor.org    where the console links point
`;

/** A time written without a zone is Boston time. */
function bostonTime(text: string): Date | null {
  if (/(Z|[+-]\d\d:?\d\d)$/.test(text)) {
    const exact = new Date(text);
    return Number.isNaN(exact.getTime()) ? null : exact;
  }
  const asUtc = new Date(`${text.length <= 10 ? `${text}T00:00` : text}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  // What a Boston clock reads at that instant, read back as if it were
  // UTC: the gap between the two is Boston's offset on that day.
  const wall = new Date(asUtc.toLocaleString("en-US", { timeZone: "America/New_York" }) + " UTC");
  return new Date(asUtc.getTime() + (asUtc.getTime() - wall.getTime()));
}

function fail(message: string): never {
  console.error(`\n  ${message}\n${USAGE}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const emails = (text: string | undefined) =>
    new Set((text ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
  const rules: Rules = { keepOrganizers: false, exclude: new Set(), keep: new Set(), testersBefore: null };
  let file = "";
  let top = 40;
  let site = "https://astralmonitor.org";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = () => args[++i] ?? fail(`${arg} needs a value.`);
    if (arg === "--keep-organizers") rules.keepOrganizers = true;
    else if (arg === "--exclude") rules.exclude = emails(value());
    else if (arg === "--keep") rules.keep = emails(value());
    else if (arg === "--testers-before") {
      const given = value();
      rules.testersBefore = bostonTime(given) ?? fail(`"${given}" is not a time. Write it like 2026-11-15T09:00.`);
    } else if (arg === "--reading-list") {
      top = Number(value());
      if (!Number.isInteger(top) || top < 1) fail("--reading-list needs a whole number, as in --reading-list 40.");
    } else if (arg === "--site") site = value().replace(/\/+$/, "");
    else if (arg.startsWith("--")) fail(`Unknown option ${arg}.`);
    else if (file) fail("Give one export file.");
    else file = arg;
  }
  if (!file) fail("No export file given.");
  if (!existsSync(file)) fail(`There is no file at ${resolve(file)}.`);

  const data = await loadExport(resolve(file));
  if (data.people.size === 0) fail("That file has no accounts in it. Is it the export from Organize → Settings?");
  applyRules(data, rules);
  const { reviews, otherForms } = joinReviews(data);
  const comparisons = joinComparisons(data);
  const works = buildWork(data, reviews);

  const made = new Date();
  const stamp = made.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const folder = join(process.cwd(), "analysis-out", stamp);
  mkdirSync(join(folder, "tables"), { recursive: true });
  mkdirSync(join(folder, "identified"), { recursive: true });

  writeFileSync(join(folder, "report.html"), report({ data, rules, reviews, otherForms, comparisons, works, made }));
  for (const [name, text] of Object.entries(tables(data, reviews, comparisons, works))) {
    writeFileSync(join(folder, "tables", name), text);
  }
  const log = contactLog(data, reviews, comparisons, site);
  writeFileSync(join(folder, "identified", "contact-log.csv"), log.text);
  const list = readingList(works, top, site, made);
  writeFileSync(join(folder, "identified", "reading-list.csv"), list.text);
  writeFileSync(join(folder, "identified", "reading-list.html"), list.html);
  writeFileSync(join(folder, "identified", "people.csv"), peopleKey(data));

  const kept = [...data.people.values()].filter((p) => !p.leftOut).length;
  console.log(`
  Read ${file}${data.complete ? "" : "\n  WARNING: the file has no closing line. The download was cut short; download it again."}
  ${data.people.size} accounts, ${kept} in the analysis (${data.people.size - kept} left out)
  ${works.length} pieces of work, ${reviews.length} transcript reviews, ${comparisons.length} comparisons
  Contact log: ${log.count} people, ${log.strong} with a strong background, ${log.solid} solid

  Written to ${folder}
    report.html                      start here
    tables/                          rows for a spreadsheet, no names or text
    identified/contact-log.csv       names and email addresses
    identified/reading-list.html     names and conversations
    identified/reading-list.csv
    identified/people.csv

  The identified folder is for organizers only.
`);
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
