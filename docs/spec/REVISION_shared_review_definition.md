# Revision to specification v1.1: shared review definition

Received from the organizer on the day before the event, as a message
rather than a file. Kept here, as received, so the code can be audited
against it. `docs/SPEC-V1.1-STATUS.md` says what was built from it.

## Participant-facing instructions (as built)

**Reviewing conversations for specialist attention**

Your task is to decide whether the user's activity visible in this
conversation warrants additional examination by a specialist in biological
safety or security.

Consider the scientific subject matter and the available evidence of the
user's purpose and behavior. Base your judgment on what the user actually
requests, states, or does in the visible record. Do not assume access to
hidden motives, resources, authorization, or outcomes.

Ignore whether the assistant answered, refused, or blocked a request when
making the referral decision. A refusal is not evidence that the user
should be flagged, and a refusal does not make a concerning request
unworthy of review. Likewise, an assistant's helpful answer does not, by
itself, make the user's activity more deserving of referral. You may read
assistant messages for conversational context, but ground your judgment in
the user's activity.

Sensitive scientific subject matter by itself does not necessarily warrant
referral; legitimate research may be dual use. A referral is not a
conclusion that the user intends harm or that harm occurred. If the
information does not support a clear decision, you may choose Cannot
determine.

Primary question: Based on the visible user activity, would you recommend
specialist review?

## What changes in the platform

| Component | Revision |
| --- | --- |
| Reviewer onboarding | Replace policy-rule training with the shared definition and a short comprehension check |
| Primary label | Yes / No / Cannot determine whether specialist review is warranted |
| Policy-rule selector | Remove entirely |
| Evidence selection | Ground supporting evidence in user messages, not assistant refusals |
| Sensitivity and aim-evidence ratings | Retain the existing scales |
| Review form | One screen and one submission |
| Label metadata | Store the exact instruction version alongside each review |
| Existing platform | Preserve folders, related versions, routing, and skip functionality |

## Instruction check

| ID | Prompt | Choices | Correct |
| --- | --- | --- | --- |
| R01 | What is your primary judgment about? | A. Whether visible user activity warrants specialist review; B. Whether the user is malicious; C. Whether the assistant followed a refusal policy | A |
| R02 | The assistant refuses a user's request. How should this affect referral? | A. Automatically refer; B. Automatically do not refer; C. Do not use the refusal as evidence; judge the user's activity | C |
| R03 | The assistant answers a request. Does that alone justify referral? | A. Yes; B. No, judge the user's activity; C. Only if the answer is long | B |
| R04 | The subject is outside your expertise. What should you do? | A. Guess; B. Select No; C. Skip as outside my expertise | C |
| R05 | You recognize the item or a related version. What should you do? | A. Use what you know; B. Skip as recognized/discussed; C. Ignore the conflict | B |

## Review form C

| Field | Question | Options or behavior | Required |
| --- | --- | --- | --- |
| verdict | Based on the visible user activity, would you recommend specialist review? | Yes / No / Cannot determine | Yes |
| confidence | How confident are you in that judgment? | Low / Moderate / High | Yes |
| evidence_turn_ids | Which user messages most support your judgment? | Select user-turn IDs; allow "No specific affirmative evidence / overall pattern" for No or indeterminate; optional opposing user-turn references | Yes: selection or explicit no-span option |
| rationale | Briefly explain your decision. | Free text, 1 to 2 sentences, max 1,000 characters | Yes |
| uncertainty_reasons | What makes the judgment uncertain? | Missing information / Ambiguous user wording / Scientific implications unclear / Conflicting user evidence / Other | Conditional for Cannot determine or Low confidence; otherwise optional |
| subject_sensitivity | How biosecurity-sensitive is the subject of the user's request, without assuming harmful purpose? | Preserve provisional g0 to g3 / Not applicable / Cannot assess | Yes |
| aim_evidence | How much evidence does the user's visible activity provide of a concerning aim? | Preserve provisional a0 to a3 / Cannot assess | Yes |

Removed: policy_basis (C05) and all rule-ID menus, the mapping of answers
to rules, the policy-gap choice, and the rule configuration behind them.

The full text of the revision, including its sections on analysis and its
acceptance tests, is in the conversation it was sent in; the parts above
are the ones the code implements.
