-- The rule-based reference policy is replaced by one short, shared review
-- definition (revision to specification v1.1). This publishes it as the
-- next version of the review instructions, so that it is what reviewers
-- read and are checked on from now on. Reviews already made keep the
-- version they were made under, and are told apart by it.
--
-- Skipped where the latest version is already this text.
INSERT INTO "review_policy" ("version", "body", "rules")
SELECT COALESCE((SELECT MAX("version") FROM "review_policy"), 0) + 1, '# Reviewing conversations for specialist attention

Your task is to decide whether the user''s activity visible in this conversation warrants additional examination by a specialist in biological safety or security.

Consider the scientific subject matter and the available evidence of the user''s purpose and behavior. Base your judgment on what the user actually requests, states, or does in the visible record. Do not assume access to hidden motives, resources, authorization, or outcomes.

Ignore whether the assistant answered, refused, or blocked a request when making the referral decision. A refusal is not evidence that the user should be flagged, and a refusal does not make a concerning request unworthy of review. Likewise, an assistant''s helpful answer does not, by itself, make the user''s activity more deserving of referral. You may read assistant messages for conversational context, but ground your judgment in the user''s activity.

Sensitive scientific subject matter by itself does not necessarily warrant referral; legitimate research may be dual use. A referral is not a conclusion that the user intends harm or that harm occurred. If the information does not support a clear decision, you may choose Cannot determine.

**Primary question:** Based on the visible user activity, would you recommend specialist review?', '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM "review_policy" p
  WHERE p."version" = (SELECT MAX("version") FROM "review_policy")
    AND p."body" = '# Reviewing conversations for specialist attention

Your task is to decide whether the user''s activity visible in this conversation warrants additional examination by a specialist in biological safety or security.

Consider the scientific subject matter and the available evidence of the user''s purpose and behavior. Base your judgment on what the user actually requests, states, or does in the visible record. Do not assume access to hidden motives, resources, authorization, or outcomes.

Ignore whether the assistant answered, refused, or blocked a request when making the referral decision. A refusal is not evidence that the user should be flagged, and a refusal does not make a concerning request unworthy of review. Likewise, an assistant''s helpful answer does not, by itself, make the user''s activity more deserving of referral. You may read assistant messages for conversational context, but ground your judgment in the user''s activity.

Sensitive scientific subject matter by itself does not necessarily warrant referral; legitimate research may be dual use. A referral is not a conclusion that the user intends harm or that harm occurred. If the information does not support a clear decision, you may choose Cannot determine.

**Primary question:** Based on the visible user activity, would you recommend specialist review?'
);
