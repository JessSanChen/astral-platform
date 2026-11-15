-- Checking one reviewer's transcript reviews. For the Neon SQL editor.
-- Every query only reads. Put the reviewer's sign-in email in place of
-- REVIEWER-EMAIL in each query you run (find it with the first query).

-- 0. Find the person.
SELECT id, name, email, created_at FROM "user" WHERE name ILIKE '%sophie%';


-- 1. Time on each record against how much there was to read, fastest first.
--    seconds_on_record runs from when the record was handed out to when the
--    review was submitted, so a break shows as a long time: only the short
--    ones mean anything. A careful reader manages about 25 characters a
--    second and a skimmer perhaps 60 to 100. Well above that, the record
--    was not read.
WITH who AS (SELECT id FROM "user" WHERE email = 'REVIEWER-EMAIL'),
reviewed AS (
  SELECT a.id, a.reserved_at, a.finished_at,
         extract(epoch FROM (a.finished_at - a.reserved_at)) AS seconds,
         jsonb_array_length(v.content->'turns') AS turns,
         (SELECT coalesce(sum(length(t->>'content')), 0)
            FROM jsonb_array_elements(v.content->'turns') t) AS characters,
         v.kind,
         left(v.content->'turns'->0->>'content', 70) AS first_message,
         r.verdict, r.confidence, r.evidence_turns, r.subject_sensitivity, r.aim_evidence,
         r.revision_count
  FROM review_assignment a
  JOIN review_response r ON r.assignment_id = a.id
  JOIN review_view v ON v.id = a.view_id
  WHERE a.reviewer_id = (SELECT id FROM who)
    AND a.purpose = 'primary' AND a.state = 'completed'
)
SELECT to_char(finished_at, 'HH24:MI:SS') AS finished_utc,
       round(seconds)::int                 AS seconds_on_record,
       turns, characters,
       round(characters / nullif(seconds, 0))::int AS characters_per_second,
       verdict, confidence, evidence_turns, subject_sensitivity, aim_evidence,
       revision_count, kind, first_message
FROM reviewed
ORDER BY seconds;


-- 2. The same thing in one line: how many reviews, over how long, and how
--    many were faster than a person can read.
WITH who AS (SELECT id FROM "user" WHERE email = 'REVIEWER-EMAIL'),
reviewed AS (
  SELECT extract(epoch FROM (a.finished_at - a.reserved_at)) AS seconds,
         (SELECT coalesce(sum(length(t->>'content')), 0)
            FROM jsonb_array_elements(v.content->'turns') t) AS characters,
         a.reserved_at, a.finished_at
  FROM review_assignment a
  JOIN review_view v ON v.id = a.view_id
  WHERE a.reviewer_id = (SELECT id FROM who)
    AND a.purpose = 'primary' AND a.state = 'completed'
)
SELECT count(*)                                              AS reviews,
       to_char(min(reserved_at), 'HH24:MI')                  AS first_started_utc,
       to_char(max(finished_at), 'HH24:MI')                  AS last_finished_utc,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds))::int AS median_seconds,
       round(min(seconds))::int                              AS fastest_seconds,
       count(*) FILTER (WHERE seconds < 20)                  AS under_20_seconds,
       count(*) FILTER (WHERE characters / nullif(seconds, 0) > 100) AS faster_than_100_chars_a_second
FROM reviewed;


-- 3. Everyone, for comparison: is this reviewer's pace unusual?
SELECT u.name,
       count(*) AS reviews,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM (a.finished_at - a.reserved_at))))::int AS median_seconds,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY (SELECT coalesce(sum(length(t->>'content')), 0)
                     FROM jsonb_array_elements(v.content->'turns') t)
                  / nullif(extract(epoch FROM (a.finished_at - a.reserved_at)), 0)))::int
         AS median_characters_per_second,
       count(*) FILTER (WHERE r.verdict = 'yes')            AS yes,
       count(*) FILTER (WHERE r.verdict = 'no')             AS no,
       count(*) FILTER (WHERE r.verdict = 'indeterminate')  AS cannot_determine
FROM review_assignment a
JOIN review_response r ON r.assignment_id = a.id
JOIN review_view v ON v.id = a.view_id
JOIN "user" u ON u.id = a.reviewer_id
WHERE a.purpose = 'primary' AND a.state = 'completed'
GROUP BY u.name
ORDER BY reviews DESC;


-- 4. Agreement with the other people who reviewed the same records.
--    One row per pairing of her verdict with someone else's.
WITH who AS (SELECT id FROM "user" WHERE email = 'REVIEWER-EMAIL')
SELECT mine.verdict AS her_verdict, theirs.verdict AS other_reviewer, count(*) AS records
FROM review_response mine
JOIN review_response theirs
  ON theirs.view_id = mine.view_id AND theirs.reviewer_id <> mine.reviewer_id
WHERE mine.reviewer_id = (SELECT id FROM who)
GROUP BY 1, 2
ORDER BY 1, 2;


-- 5. Everyone's agreement with their co-reviewers, for comparison. A
--    careless reviewer agrees with others less often than the rest do.
SELECT u.name,
       count(*)                                              AS shared_judgments,
       round(100.0 * avg((mine.verdict = theirs.verdict)::int))::int AS percent_agree
FROM review_response mine
JOIN review_response theirs
  ON theirs.view_id = mine.view_id AND theirs.reviewer_id <> mine.reviewer_id
JOIN "user" u ON u.id = mine.reviewer_id
GROUP BY u.name
ORDER BY shared_judgments DESC;


-- 6. Against what each author said about their own conversation: the
--    scenario they were constructing, and whether they expected a reviewer
--    to recommend specialist review. Not a right answer, but a reviewer who
--    reads the record should track it more often than not.
WITH who AS (SELECT id FROM "user" WHERE email = 'REVIEWER-EMAIL')
SELECT coalesce(c.author_labels->>'scenario', e.author_labels->>'scenario')             AS author_scenario,
       coalesce(c.author_labels->>'expectReferral', e.author_labels->>'expectReferral') AS author_expected_referral,
       r.verdict                                                                        AS her_verdict,
       count(*)                                                                         AS records
FROM review_response r
JOIN review_view v ON v.id = r.view_id
JOIN episode e ON e.id = v.episode_id
LEFT JOIN conversation c ON c.id = v.conversation_id
WHERE r.reviewer_id = (SELECT id FROM who)
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;


-- 7. A reading list for checking by eye: the records where she and another
--    reviewer disagree, and her ten fastest. The id opens the record's
--    author in the console: /admin/participants/<author_id>.
WITH who AS (SELECT id FROM "user" WHERE email = 'REVIEWER-EMAIL'),
hers AS (
  SELECT r.view_id, r.verdict, r.confidence, r.evidence_turns,
         extract(epoch FROM (a.finished_at - a.reserved_at)) AS seconds
  FROM review_response r
  JOIN review_assignment a ON a.id = r.assignment_id
  WHERE r.reviewer_id = (SELECT id FROM who)
)
SELECT CASE WHEN others.verdicts IS NOT NULL AND NOT (hers.verdict = ALL (others.verdicts))
            THEN 'disagrees with another reviewer' ELSE 'among her fastest' END AS why_listed,
       round(hers.seconds)::int AS seconds_on_record,
       hers.verdict AS her_verdict, hers.confidence, hers.evidence_turns,
       others.verdicts AS other_verdicts,
       au.name AS author, e.user_id AS author_id,
       left(v.content->'turns'->0->>'content', 90) AS first_message
FROM hers
JOIN review_view v ON v.id = hers.view_id
JOIN episode e ON e.id = v.episode_id
JOIN "user" au ON au.id = e.user_id
LEFT JOIN LATERAL (
  SELECT array_agg(o.verdict) AS verdicts
  FROM review_response o
  WHERE o.view_id = hers.view_id AND o.reviewer_id <> (SELECT id FROM who)
) others ON true
WHERE (others.verdicts IS NOT NULL AND NOT (hers.verdict = ALL (others.verdicts)))
   OR hers.seconds <= (SELECT seconds FROM hers ORDER BY seconds LIMIT 1 OFFSET 9)
ORDER BY 1, 2;
