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
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    callCount++;
    // Echo back something identifiable so tests can assert on it.
    const lastUser = [...(parsed.messages || [])].reverse().find(m => m.role === 'user');
    const sys = (parsed.messages || []).find(m => m.role === 'system');
    const reply = `Reply ${callCount} to: ${String(lastUser?.content ?? '').slice(0, 40)}`
      + (sys ? ` [scenario seen: ${String(sys.content).slice(0, 30)}]` : '');
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
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, cost: 0.00042,
                   completion_tokens_details: { reasoning_tokens: 3 } },
        });
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }, 15);
  });
}).listen(PORT, () => console.log('mock openrouter on ' + PORT));
