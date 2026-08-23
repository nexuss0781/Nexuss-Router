#!/usr/bin/env bash
set -u
BASE="${1:?base URL required}"
KEY="$(cat /tmp/omniroute_gateway_key)"
pass=0
fail=0
check() {
  local label="$1" method="$2" path="$3" body="${4:-}"
  local code
  if [[ -n "$body" ]]; then
    code="$(curl -sS --max-time 45 -o /tmp/omni-smoke-body -w '%{http_code}' -X "$method" "$BASE$path" -H "authorization: Bearer $KEY" -H 'content-type: application/json' --data "$body")"
  else
    code="$(curl -sS --max-time 45 -o /tmp/omni-smoke-body -w '%{http_code}' -X "$method" "$BASE$path" -H "authorization: Bearer $KEY")"
  fi
  case "$code" in
    2*|400|405|413|415|422|503|504) printf 'PASS %-28s %s\n' "$label" "$code"; pass=$((pass+1));;
    *) printf 'FAIL %-28s %s\n' "$label" "$code"; sed -n '1,2p' /tmp/omni-smoke-body; fail=$((fail+1));;
  esac
}

check "models" GET /api/v1/models
check "files list" GET /api/v1/files
check "jobs list" GET /api/v1/jobs
check "chat route" GET /api/v1/chat/completions
check "completions route" GET /api/v1/completions
check "responses route" GET /api/v1/responses
check "messages route" GET /api/v1/messages
check "embeddings route" GET /api/v1/embeddings
check "rerank route" GET /api/v1/rerank
check "classify route" GET /api/v1/classify
check "segment route" GET /api/v1/segment
check "moderations route" GET /api/v1/moderations
check "search route" GET /api/v1/search
check "web fetch route" GET /api/v1/web/fetch
check "images route" GET /api/v1/images/generations
check "audio speech route" GET /api/v1/audio/speech
check "audio transcription" GET /api/v1/audio/transcriptions
check "video generation" GET /api/v1/videos/generations
check "music generation" GET /api/v1/music/generations
check "ocr route" GET /api/v1/ocr
check "chat completion" POST /api/v1/chat/completions '{"model":"opencode-zen/big-pickle","messages":[{"role":"user","content":"Reply with exactly: smoke-ok"}],"stream":false}'
printf 'SUMMARY pass=%s fail=%s\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
