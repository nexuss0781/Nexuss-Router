#!/usr/bin/env python3
import json, sys, time, urllib.error, urllib.request
from pathlib import Path
BASE = sys.argv[1].rstrip('/')
KEY = Path('/tmp/omniroute_gateway_key').read_text().strip()
MODELS = ['g4f-pollinations/openai', 'pollinations/qwen-coder', 'pollinations/perplexity-reasoning']
for model in MODELS:
    payload = {'model': model, 'messages': [{'role': 'user', 'content': 'Say only ok'}], 'stream': False, 'max_tokens': 16}
    req = urllib.request.Request(BASE + '/api/v1/chat/completions', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}, method='POST')
    start = time.monotonic(); status = 0; body = ''; err = ''
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            status = r.status; body = r.read(100000).decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        status = e.code; body = e.read(100000).decode('utf-8', 'replace')
    except Exception as e:
        err = f'{type(e).__name__}: {e}'
    print(json.dumps({'model': model, 'status': status, 'elapsed_seconds': round(time.monotonic()-start, 2), 'error': err, 'body': body[:2000]}, ensure_ascii=False))
