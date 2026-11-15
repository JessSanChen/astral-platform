-- Checking the numbers on the organizer console's Overview page.
--
-- For the Neon SQL editor. Every query here only reads. Run them one at a
-- time: select a query (from its comment down to its semicolon) and run it.
--
--   1  the dashboard recomputed, one row per number, in the order it appears
--   2  the same totals counted a second way; the two columns should match
--   3  things that should never happen; an empty result is the good answer
--   4  why "sessions submitted" and "views" are different numbers
--   5  how many views have 0, 1, 2, 3 reviews
--   6  the review total broken down by reviewer
--   7  when the accounts were made (to see test accounts from before the day)
--
-- People are using the site while you look, so a number can move by one or
-- two between the dashboard and a query. Reload the dashboard and run again
-- if a pair is off by a little.
--
-- The dashboard leaves out accounts marked as testers and their work, and
-- so do these queries. With no accounts marked, nothing is left out.


-- 1. The dashboard, recomputed. Compare each row with the page.
WITH
tester   AS (SELECT user_id FROM tester_account),
settings AS (SELECT reviews_per_view FROM event_settings WHERE id = 1),
policy   AS (SELECT coalesce(max(version), 0) AS version FROM review_policy),
people   AS (SELECT u.* FROM "user" u WHERE u.id NOT IN (SELECT user_id FROM tester)),
work     AS (SELECT e.* FROM episode e WHERE e.user_id NOT IN (SELECT user_id FROM tester)),
-- A session is a conversation someone typed into.
sessions AS (
  SELECT c.* FROM conversation c
  WHERE c.user_id NOT IN (SELECT user_id FROM tester)
    AND EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id)),
given    AS (
  SELECT a.* FROM review_assignment a
  WHERE a.reviewer_id NOT IN (SELECT user_id FROM tester)),
-- A view is one thing a reviewer is shown: a session, or a whole folder.
views    AS (
  SELECT v.id,
         (SELECT count(*) FROM review_assignment a
           WHERE a.view_id = v.id AND a.purpose = 'primary' AND a.state = 'completed') AS done
  FROM review_view v
  JOIN episode e ON e.id = v.episode_id
  WHERE e.assignment_state <> 'withdrawn'
    AND e.user_id NOT IN (SELECT user_id FROM tester))
SELECT card, number_shown, value
FROM (VALUES
  ( 1, 'Participants', 'Participants (the big number)',
       (SELECT count(*) FROM people)::numeric),
  ( 2, 'Participants', 'finished the intake form',
       (SELECT count(*) FROM people WHERE profile_completed_at IS NOT NULL)),

  ( 3, 'Conversations and folders submitted', 'the big number',
       (SELECT count(*) FROM work WHERE status = 'submitted')),
  ( 4, 'Conversations and folders submitted', 'conversations',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND NOT is_folder)),
  ( 5, 'Conversations and folders submitted', 'folders',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND is_folder)),
  ( 6, 'Conversations and folders submitted', 'sessions submitted in all',
       (SELECT count(*) FROM sessions WHERE status = 'submitted')),
  ( 7, 'Conversations and folders submitted', 'drafts not submitted',
       (SELECT count(*) FROM work WHERE status = 'draft')),

  ( 8, 'Transcript reviews completed', 'the big number',
       (SELECT count(*) FROM given WHERE purpose = 'primary' AND state = 'completed')),
  ( 9, 'Transcript reviews completed', 'views that have all their reviews',
       (SELECT count(*) FROM views WHERE done >= (SELECT reviews_per_view FROM settings))),
  (10, 'Transcript reviews completed', 'views (the total)',
       (SELECT count(*) FROM views)),
  (11, 'Transcript reviews completed', 'reviews each view aims for',
       (SELECT reviews_per_view FROM settings)),
  (12, 'Transcript reviews completed', 'views with at least one',
       (SELECT count(*) FROM views WHERE done > 0)),

  -- Everyone's use in the last 24 hours, not since midnight, and testers
  -- included: it is what was spent, whoever spent it.
  (13, 'Spend today', 'dollars, last 24 hours',
       (SELECT round(coalesce(sum(cost_usd), 0)::numeric, 2) FROM usage_event
         WHERE created_at >= (now() AT TIME ZONE 'utc') - interval '24 hours')),
  (14, 'Spend today', 'tokens, last 24 hours',
       (SELECT coalesce(sum(prompt_tokens + completion_tokens), 0) FROM usage_event
         WHERE created_at >= (now() AT TIME ZONE 'utc') - interval '24 hours')),

  (15, 'Passed the instruction check', 'the big number',
       (SELECT count(*) FROM people
         WHERE policy_ready_version = (SELECT version FROM policy)
           AND (SELECT version FROM policy) > 0)),
  (16, 'Passed the instruction check', 'review instructions version',
       (SELECT version FROM policy)),

  (17, 'In progress now', 'the big number',
       (SELECT count(*) FROM given WHERE state = 'active')),
  (18, 'In progress now', 'transcript reviews',
       (SELECT count(*) FROM given WHERE state = 'active' AND purpose = 'primary')),
  (19, 'In progress now', 'comparisons',
       (SELECT count(*) FROM given WHERE state = 'active' AND purpose = 'pair_audit')),
  (20, 'In progress now', 'skipped: transcripts',
       (SELECT count(*) FROM given WHERE state = 'skipped' AND purpose <> 'pair_audit')),
  (21, 'In progress now', 'skipped: comparisons',
       (SELECT count(*) FROM given WHERE state = 'skipped' AND purpose = 'pair_audit')),
  (22, 'In progress now', 'ran out of time',
       (SELECT count(*) FROM given WHERE state = 'expired')),

  (23, 'Comparisons completed', 'the big number',
       (SELECT count(*) FROM pair_audit p
         WHERE p.reviewer_id NOT IN (SELECT user_id FROM tester))),
  (24, 'Comparisons completed', 'related versions submitted',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND creation_method = 'related_live')),

  (25, 'Submitted work, by review state', 'Pending',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND assignment_state = 'pending')),
  (26, 'Submitted work, by review state', 'Ready',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND assignment_state = 'ready')),
  (27, 'Submitted work, by review state', 'Held',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND assignment_state = 'held')),
  (28, 'Submitted work, by review state', 'Withdrawn',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND assignment_state = 'withdrawn')),

  (29, 'What was submitted', 'Folders (several sessions)',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND is_folder)),
  (30, 'What was submitted', 'Related versions',
       (SELECT count(*) FROM work WHERE status = 'submitted' AND creation_method = 'related_live'))
) AS t(position, card, number_shown, value)
ORDER BY position;


-- 2. The same totals, counted a second way. Each row is two counts that
--    come from different tables or different conditions; "matches" should
--    be true on every row.
WITH
tester AS (SELECT user_id FROM tester_account),
given  AS (
  SELECT a.* FROM review_assignment a
  WHERE a.reviewer_id NOT IN (SELECT user_id FROM tester)),
work   AS (SELECT e.* FROM episode e WHERE e.user_id NOT IN (SELECT user_id FROM tester))
SELECT what, first_count, second_count, first_count = second_count AS matches
FROM (VALUES
  ('Transcript reviews: finished assignments, against answers on record',
     (SELECT count(*) FROM given WHERE purpose = 'primary' AND state = 'completed'),
     (SELECT count(*) FROM review_response r
       WHERE r.reviewer_id NOT IN (SELECT user_id FROM tester))),
  ('Transcript reviews: the total, against one reviewer-and-view pair each',
     (SELECT count(*) FROM given WHERE purpose = 'primary' AND state = 'completed'),
     (SELECT count(DISTINCT (reviewer_id, view_id)) FROM given
       WHERE purpose = 'primary' AND state = 'completed')),
  ('Comparisons: finished assignments, against answers on record',
     (SELECT count(*) FROM given WHERE purpose = 'pair_audit' AND state = 'completed'),
     (SELECT count(*) FROM pair_audit p
       WHERE p.reviewer_id NOT IN (SELECT user_id FROM tester))),
  ('Submitted work: the total, against the four review states added up',
     (SELECT count(*) FROM work WHERE status = 'submitted'),
     (SELECT count(*) FROM work WHERE status = 'submitted'
        AND assignment_state IN ('pending', 'ready', 'held', 'withdrawn'))),
  ('Everything ever handed out, against finished + in progress + skipped + ran out',
     (SELECT count(*) FROM given),
     (SELECT count(*) FROM given WHERE state IN ('completed', 'active', 'skipped', 'expired'))),
  ('Submitted conversations (not folders), against their one session each',
     (SELECT count(*) FROM work WHERE status = 'submitted' AND NOT is_folder),
     (SELECT count(*) FROM work w WHERE w.status = 'submitted' AND NOT w.is_folder
        AND (SELECT count(*) FROM conversation c
              WHERE c.episode_id = w.id AND c.status = 'submitted') = 1))
) AS t(what, first_count, second_count);


-- 3. Things that should never happen. No rows is the good answer.
WITH settings AS (SELECT reviews_per_view FROM event_settings WHERE id = 1)
SELECT 'finished assignment with no answer on record' AS problem,
       a.id::text AS id, u.name AS who
FROM review_assignment a
JOIN "user" u ON u.id = a.reviewer_id
WHERE a.state = 'completed'
  AND NOT EXISTS (SELECT 1 FROM review_response r WHERE r.assignment_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM pair_audit p WHERE p.assignment_id = a.id)
UNION ALL
SELECT 'answer on record for an assignment that is not finished',
       r.id::text, u.name
FROM review_response r
JOIN review_assignment a ON a.id = r.assignment_id
JOIN "user" u ON u.id = r.reviewer_id
WHERE a.state <> 'completed'
UNION ALL
SELECT 'someone reviewed their own work',
       a.id::text, u.name
FROM review_assignment a
JOIN review_view v ON v.id = a.view_id
JOIN episode e ON e.id = v.episode_id
JOIN "user" u ON u.id = a.reviewer_id
WHERE a.state = 'completed' AND e.user_id = a.reviewer_id
UNION ALL
SELECT 'the same person reviewed the same view twice',
       a.view_id::text, u.name
FROM review_assignment a
JOIN "user" u ON u.id = a.reviewer_id
WHERE a.purpose = 'primary' AND a.state = 'completed'
GROUP BY a.view_id, a.reviewer_id, u.name
HAVING count(*) > 1
UNION ALL
SELECT 'a view has more reviews than each view aims for',
       a.view_id::text, count(*)::text || ' reviews'
FROM review_assignment a
WHERE a.purpose = 'primary' AND a.state = 'completed'
GROUP BY a.view_id
HAVING count(*) > (SELECT reviews_per_view FROM settings);


-- 4. Why "sessions submitted" and "views" are different numbers.
--    A view is written when a session is submitted, one per session, plus
--    one more for a folder submitted as a whole (the folder read together).
--    A session submitted before reviewer views existed has none and can
--    never be handed out.
WITH tester AS (SELECT user_id FROM tester_account)
SELECT
  CASE
    WHEN NOT e.is_folder             THEN '1 a conversation by itself'
    WHEN e.status = 'submitted'      THEN '2 a session of a submitted folder'
    ELSE '3 a session submitted by itself, from a folder not yet submitted'
  END                                                        AS what,
  count(*)                                                   AS sessions_submitted,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM review_view v
    WHERE v.conversation_id = c.id AND v.kind = 'session'))  AS reviewer_views,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM review_view v
    WHERE v.conversation_id = c.id AND v.kind = 'session'))  AS sessions_with_no_view
FROM conversation c
JOIN episode e ON e.id = c.episode_id
WHERE c.status = 'submitted'
  AND c.user_id NOT IN (SELECT user_id FROM tester)
  AND EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id)
GROUP BY 1
UNION ALL
SELECT '4 a folder read as a whole (a view, but not a session)',
       NULL,
       count(*),
       NULL
FROM review_view v
JOIN episode e ON e.id = v.episode_id
WHERE v.kind = 'linked'
  AND e.user_id NOT IN (SELECT user_id FROM tester)
ORDER BY 1;
-- "sessions_submitted" added up is the dashboard's "sessions submitted in
-- all". "reviewer_views" added up is its number of views (less any on
-- withdrawn work).


-- 5. How many views have 0, 1, 2, 3 reviews. The rows add up to the
--    dashboard's views; the rows from 1 up, to "at least one"; the row at
--    the number each view aims for (and any above it), to "have all".
WITH tester AS (SELECT user_id FROM tester_account)
SELECT done AS reviews_on_the_view,
       count(*) AS views,
       sum(done) AS reviews_in_this_row
FROM (
  SELECT v.id,
         (SELECT count(*) FROM review_assignment a
           WHERE a.view_id = v.id AND a.purpose = 'primary' AND a.state = 'completed') AS done
  FROM review_view v
  JOIN episode e ON e.id = v.episode_id
  WHERE e.assignment_state <> 'withdrawn'
    AND e.user_id NOT IN (SELECT user_id FROM tester)
) per_view
GROUP BY done
ORDER BY done;
-- "reviews_in_this_row" added up is "Transcript reviews completed". (It
-- can be higher only if a reviewer was marked as a tester after reviewing
-- a participant's work: the view keeps the review, the total drops it.)


-- 6. The review total, by reviewer. The first column added up is
--    "Transcript reviews completed"; the second, "Comparisons completed".
--    These are also the numbers on the Participants page.
WITH tester AS (SELECT user_id FROM tester_account)
SELECT u.name,
       u.email,
       count(*) FILTER (WHERE a.purpose = 'primary'    AND a.state = 'completed') AS transcript_reviews,
       count(*) FILTER (WHERE a.purpose = 'pair_audit' AND a.state = 'completed') AS comparisons,
       count(*) FILTER (WHERE a.state = 'skipped')                                AS skipped,
       count(*) FILTER (WHERE a.state = 'expired')                                AS ran_out_of_time,
       count(*) FILTER (WHERE a.state = 'active')                                 AS in_progress,
       min(a.finished_at) FILTER (WHERE a.state = 'completed')                    AS first_finished_utc,
       max(a.finished_at) FILTER (WHERE a.state = 'completed')                    AS last_finished_utc
FROM review_assignment a
JOIN "user" u ON u.id = a.reviewer_id
WHERE a.reviewer_id NOT IN (SELECT user_id FROM tester)
GROUP BY u.id, u.name, u.email
ORDER BY transcript_reviews DESC, comparisons DESC;


-- 7. When the accounts were made, and what each day's accounts produced.
--    Accounts from before the day of the event are probably test accounts;
--    until they are marked as testers (Participants page), their work is
--    counted in every number above.
WITH account AS (
  SELECT u.id,
         (u.created_at AT TIME ZONE 'utc' AT TIME ZONE 'America/New_York')::date AS made_on,
         EXISTS (SELECT 1 FROM tester_account t WHERE t.user_id = u.id)         AS is_tester,
         (SELECT count(*) FROM episode e
           WHERE e.user_id = u.id AND e.status = 'submitted')                   AS submitted,
         (SELECT count(*) FROM review_assignment a
           WHERE a.reviewer_id = u.id AND a.state = 'completed'
             AND a.purpose = 'primary')                                         AS reviews
  FROM "user" u
)
SELECT made_on                              AS made_on_boston_date,
       count(*)                             AS accounts,
       count(*) FILTER (WHERE is_tester)    AS marked_as_testers,
       sum(submitted)                       AS work_they_submitted,
       sum(reviews)                         AS transcript_reviews_they_did
FROM account
GROUP BY made_on
ORDER BY made_on;
