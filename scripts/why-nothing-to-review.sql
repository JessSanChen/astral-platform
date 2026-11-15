-- Why is nothing offered to me for review? One row per submitted piece of work.
-- Put your sign-in email in the first line, then run the whole thing.
WITH me AS (SELECT id FROM "user" WHERE email = 'YOUR-EMAIL-HERE'),
settings AS (SELECT reviews_per_view FROM event_settings WHERE id = 1)
SELECT
  u.name                                   AS author,
  e.title,
  CASE WHEN e.is_folder THEN 'folder' ELSE 'conversation' END AS kind,
  e.status                                 AS work_status,
  e.submitted_at,
  (SELECT count(*) FROM review_view v WHERE v.episode_id = e.id) AS reviewer_views,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM review_view v WHERE v.episode_id = e.id)
      THEN 'NO REVIEWER VIEW: submitted before v1.1, so it can never be handed out'
    WHEN e.source_family_id IN (SELECT m.source_family_id FROM episode m WHERE m.user_id = (SELECT id FROM me))
      THEN 'your own work (or related to it)'
    WHEN e.source_family_id IN (
           SELECT a.family_id FROM review_assignment a
           WHERE a.reviewer_id = (SELECT id FROM me) AND a.state <> 'expired')
      THEN 'already shown to you: ' || (
           SELECT string_agg(a.purpose || ' ' || a.state, ', ')
           FROM review_assignment a
           WHERE a.reviewer_id = (SELECT id FROM me) AND a.family_id = e.source_family_id AND a.state <> 'expired')
    WHEN e.assignment_state <> 'ready'
      THEN 'not available: ' || e.assignment_state
    WHEN NOT EXISTS (
           SELECT 1 FROM review_view v
           WHERE v.episode_id = e.id
             AND (SELECT count(*) FROM review_assignment h
                  WHERE h.view_id = v.id AND h.purpose = 'primary'
                    AND h.state IN ('active', 'completed')) < (SELECT reviews_per_view FROM settings))
      THEN 'already has all its reviews'
    ELSE 'AVAILABLE TO YOU'
  END                                      AS why
FROM episode e
JOIN "user" u ON u.id = e.user_id
WHERE e.status = 'submitted'
   OR EXISTS (SELECT 1 FROM conversation c WHERE c.episode_id = e.id AND c.status = 'submitted')
ORDER BY e.submitted_at DESC NULLS LAST;

-- What a conversation's messages actually hold, when a reply looks blank
-- on screen. Put part of its first message between the % signs.
-- "characters" is the length. "as_bytes" writes anything that is not
-- plain ASCII as byte escapes, so an invisible character shows up:
-- a zero-width space, for one, reads \342\200\213.
SELECT m.seq, m.role, m.model_id, m.finish_reason, m.error,
       length(m.content)                                         AS characters,
       encode(convert_to(left(m.content, 120), 'UTF8'), 'escape') AS as_bytes
FROM message m
JOIN conversation c ON c.id = m.conversation_id
WHERE c.title ILIKE '%TEL effector%'
ORDER BY c.created_at, m.seq;
