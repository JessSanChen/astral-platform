/**
 * A stand-in for OpenRouter, for local testing without an API key or spend.
 *
 * It speaks the same streaming protocol as the real service and reports token
 * counts and cost, so the whole path can be exercised: streaming, regenerate,
 * persistence and usage accounting.
 *
 * Run it, then point the app at it:
 *   node scripts/mock-openrouter.mjs 4010
 *   OPENROUTER_BASE_URL=http://127.0.0.1:4010/api/v1 npm run dev
 *
 * Replies are obviously fake. Use a real key to see real model behaviour.
 */
import { createServer } from 'node:http';
const PORT = Number(process.argv[2] || 4010);
let callCount = 0;

createServer((req, res) => {
  if (!req.url.includes('/chat/completions')) { res.writeHead(404).end(); return; }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', async () => {
    const parsed = JSON.parse(body || '{}');
    callCount++;
    // Test hooks: a model id containing 'fail' returns an API error, and one
    // containing 'slow' waits before answering, so the loading and error
    // states can be exercised.
    if (String(parsed.model).includes('fail')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'No endpoints found for ' + parsed.model, code: 404 } }));
      return;
    }
    const preDelay = String(parsed.model).includes('slow') ? 2500 : 0;
    // A model id containing 'silent' answers with reasoning only and no
    // visible text, like a reasoning model on a small reply budget.
    // 'refuse' answers with nothing and a content-filter finish reason, the
    // way a provider reports a blocked completion.
    const refusing = String(parsed.model).includes('refuse');
    const silent = String(parsed.model).includes('silent') || refusing;

    // Judge stand-ins, so the scanner panel can be exercised without a key.
    // Llama Guard answers with a safety verdict; the rubric judge answers
    // with JSON. Both look at the transcript for an obviously risky word so
    // the two outcomes can be tested.
    const modelId = String(parsed.model);
    // Look only at the transcript, never at the rubric wrapped around it:
    // the rubric names example categories such as 'bioweapon acquisition',
    // which would otherwise make every transcript look risky.
    const whole = JSON.stringify(parsed.messages ?? '');
    const marker = whole.lastIndexOf('Transcript:');
    const convo = marker === -1 ? whole : whole.slice(marker + 'Transcript:'.length);
    const risky = /toxin|weapon|anthrax|pathogen|enhance/i.test(convo);
    let judgeReply = null;
    // Two ways a real judge misbehaves, so the fallbacks can be tested:
    // 'prose' answers in sentences instead of JSON, and 'mute' returns
    // nothing at all on the first (structured) attempt.
    const lastRole = (parsed.messages||[]).length
      ? parsed.messages[parsed.messages.length-1].role : 'user';
    if (modelId.includes('prose')) {
      judgeReply = risky
        ? 'This conversation looks dangerous to me. I would rate it about 8 out of 10.'
        : '{"risk_category": "benign", "severity_0_to_10": 1, "rationale": "Routine question."}';
    } else if (modelId.includes('mute')) {
      judgeReply = '';
    } else if (modelId.includes('guard')) {
      // Like the real classifier: it judges only the final turn. A refusal
      // as the last turn is safe even when the request was not.
      const refusedLast = lastRole === 'assistant';
      judgeReply = (risky && !refusedLast) ? 'unsafe\nS9' : 'safe';
    } else if (modelId.includes('judge')) {
      judgeReply = JSON.stringify({
        user_intent: risky ? 'adversarial' : 'benign',
        assistant_behaviour: risky ? 'refused' : 'complied',
        uplift_0_to_10: 0,
        rationale: risky
          ? 'The person pressed for operational detail about hazardous material; the assistant refused each time.'
          : 'A routine question answered normally.',
      });
    }
    // Echo back something identifiable so tests can assert on it.
    const lastUser = [...(parsed.messages || [])].reverse().find(m => m.role === 'user');
    const sys = (parsed.messages || []).find(m => m.role === 'system');
    const reply = judgeReply !== null
      ? judgeReply
      : silent ? '' : `Reply ${callCount} to: ${String(lastUser?.content ?? '').slice(0, 40)}`
        + (sys ? ` [scenario seen: ${String(sys.content).slice(0, 30)}]` : '');
    if (preDelay) { await new Promise(r => setTimeout(r, preDelay)); }

    const usage = {
      prompt_tokens: 11,
      completion_tokens: silent ? 0 : 7,
      total_tokens: silent ? 11 : 18,
      cost: 0.00042,
      completion_tokens_details: { reasoning_tokens: silent ? 512 : 3 },
    };

    // Non-streaming requests (used by the model checker) get an ordinary
    // JSON completion rather than an event stream.
    if (parsed.stream === false || parsed.stream === undefined) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'gen-mock-' + callCount,
        model: parsed.model,
        provider: 'MockProvider',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        choices: [{
          index: 0,
          message: { role: 'assistant', content: reply },
          finish_reason: refusing ? 'content_filter' : silent ? 'length' : 'stop',
        }],
        usage,
      }));
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const id = 'gen-mock-' + callCount;
    const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
    send({ id, model: parsed.model, choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] });
    let i = 0;
    const words = reply.split(' ');
    const timer = setInterval(() => {
      if (i < words.length) {
        send({ id, model: parsed.model, choices: [{ index: 0, delta: { content: (i ? ' ' : '') + words[i] } }] });
        i++;
      } else {
        clearInterval(timer);
        send({
          id, model: parsed.model, provider: 'MockProvider',
          choices: [{ index: 0, delta: {}, finish_reason: refusing ? 'content_filter' : silent ? 'length' : 'stop' }],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, cost: 0.00042,
                   completion_tokens_details: { reasoning_tokens: silent ? 512 : 3 } },
        });
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }, 15);
  });
}).listen(PORT, () => console.log('mock openrouter on ' + PORT));
