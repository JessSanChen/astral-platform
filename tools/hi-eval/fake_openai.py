"""Tiny OpenAI-compatible chat server for synthetic runs. Deterministic replies, streaming + non-streaming."""
import json, time, uuid, asyncio
from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

app = FastAPI()
LOG = []

def reply_for(messages):
    last = next((m for m in reversed(messages) if m.get("role") == "user"), {})
    content = last.get("content", "")
    if isinstance(content, list):
        content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
    sys_msg = next((m for m in messages if m.get("role") == "system"), None)
    tag_note = " [saw system suffix]" if sys_msg else ""
    return f"SYNTHETIC-REPLY to turn {sum(1 for m in messages if m.get('role')=='user')}: you said '{content[:60]}'.{tag_note}"

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/v1/models")
async def models():
    return {"object": "list", "data": [{"id": "fake-synth-1", "object": "model"}]}

@app.post("/v1/chat/completions")
async def chat(req: Request, authorization: str | None = Header(default=None)):
    body = await req.json()
    LOG.append({"t": time.time(), "auth": authorization, "model": body.get("model"),
                "n_msgs": len(body.get("messages", [])), "roles": [m.get("role") for m in body.get("messages", [])],
                "params": {k: v for k, v in body.items() if k not in ("messages",)}})
    text = reply_for(body.get("messages", []))
    rid = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    usage = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
    if body.get("stream"):
        async def gen():
            words = text.split(" ")
            for i, w in enumerate(words):
                chunk = {"id": rid, "object": "chat.completion.chunk", "created": int(time.time()), "model": body.get("model"),
                         "choices": [{"index": 0, "delta": {"role": "assistant", "content": (w if i == 0 else " " + w)}, "finish_reason": None}]}
                yield f"data: {json.dumps(chunk)}\n\n"
                await asyncio.sleep(0.01)
            fin = {"id": rid, "object": "chat.completion.chunk", "created": int(time.time()), "model": body.get("model"),
                   "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
            yield f"data: {json.dumps(fin)}\n\n"
            if (body.get("stream_options") or {}).get("include_usage"):
                yield f"data: {json.dumps({'id': rid, 'object': 'chat.completion.chunk', 'created': int(time.time()), 'model': body.get('model'), 'choices': [], 'usage': usage})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream")
    return {"id": rid, "object": "chat.completion", "created": int(time.time()), "model": body.get("model"),
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}], "usage": usage}

@app.get("/_log")
async def log():
    return LOG

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8081, log_level="warning")
