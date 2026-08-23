#!/usr/bin/env python3
import concurrent.futures
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = sys.argv[1].rstrip("/")
KEY = Path("/tmp/omniroute_gateway_key").read_text().strip()
MODELS = [
    "g4f-pollinations/openai",
    "g4f-pollinations/openai-fast",
    "kilo-auto/free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "minimax/minimax-m2.5:free",
    "arcee-ai/trinity-large-preview:free",
    "pollinations/openai",
    "pollinations/openai-fast",
    "pollinations/openai-large",
    "pollinations/qwen-coder",
    "pollinations/mistral",
    "pollinations/deepseek",
    "pollinations/grok",
    "pollinations/gemini-flash-lite-3.1",
    "pollinations/perplexity-fast",
    "pollinations/perplexity-reasoning",
    "opencode-zen/big-pickle",
    "opencode-zen/deepseek-v4-flash-free",
    "opencode-zen/mimo-v2.5-free",
    "opencode-zen/hy3-free",
    "opencode-zen/nemotron-3-ultra-free",
    "opencode-zen/nemotron-3.5-lightning-free",
    "opencode-zen/laguna-s-2.1-free",
]


def classify(status, body, error):
    if error:
        return "transport_error"
    if status == 200:
        try:
            data = json.loads(body)
            choices = data.get("choices") or []
            if choices and ((choices[0].get("message") or {}).get("content") is not None or (choices[0].get("message") or {}).get("reasoning_content") is not None):
                return "success"
            return "http_200_unexpected_shape"
        except Exception:
            return "http_200_invalid_json"
    if status in (401, 403):
        return "upstream_auth_required_or_rejected"
    if status == 429:
        return "rate_limited"
    if 500 <= status <= 599:
        return "upstream_or_gateway_error"
    return "http_error"


def test_model(model):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "stream": False,
        "max_tokens": 8,
    }
    request = urllib.request.Request(
        f"{BASE}/api/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    started = time.monotonic()
    status = 0
    body = ""
    error = ""
    response_headers = {}
    try:
        with urllib.request.urlopen(request, timeout=50) as response:
            status = response.status
            response_headers = dict(response.headers.items())
            body = response.read(256000).decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        response_headers = dict(exc.headers.items()) if exc.headers else {}
        body = exc.read(256000).decode("utf-8", "replace")
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    elapsed = round(time.monotonic() - started, 3)
    provider = response_headers.get("x-omniroute-provider", "")
    message = ""
    try:
        parsed = json.loads(body)
        err = parsed.get("error") if isinstance(parsed, dict) else None
        if isinstance(err, dict):
            message = str(err.get("message") or err.get("code") or "")[:300]
        elif isinstance(parsed, dict) and parsed.get("choices"):
            message = str(((parsed["choices"][0].get("message") or {}).get("content") or ((parsed["choices"][0].get("message") or {}).get("reasoning_content") or "")))[:160]
    except Exception:
        message = body[:300].replace("\n", " ")
    return {
        "model": model,
        "status": status,
        "classification": classify(status, body, error),
        "provider_header": provider,
        "elapsed_seconds": elapsed,
        "message": message,
        "error": error,
        "body": body[:2000],
    }


started_at = datetime.now(timezone.utc).isoformat()
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(test_model, MODELS))
results.sort(key=lambda x: MODELS.index(x["model"]))
output = {
    "base_url": BASE,
    "started_at": started_at,
    "finished_at": datetime.now(timezone.utc).isoformat(),
    "model_count": len(MODELS),
    "results": results,
}
out_path = Path("/home/ubuntu/OmniRoute-ai-only-deploy/all-model-test-results.json")
out_path.write_text(json.dumps(output, indent=2) + "\n")
for row in results:
    print(f"{row['classification']:38} {row['status']:3} {row['elapsed_seconds']:6.1f}s {row['model']} | {row['message']}")
from collections import Counter
print("SUMMARY", dict(Counter(row["classification"] for row in results)))
print("RESULT_FILE", out_path)
