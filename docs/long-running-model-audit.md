# Long-Running 240-Model Audit Workflow

This workflow sends one explicit `chat.completions` request to each model in `docs/model-taxonomy.json` with the prompt `Say hi in one short sentence.` It runs sequentially, waits for the gateway/provider response without a client-side timeout, saves a checkpoint after every completed model, and resumes from that checkpoint after interruption.

> The workflow does not disable the gateway’s own server-side safety timeout. If the deployed gateway returns a timeout response, that is recorded as a gateway result. The audit client itself does not impose a shorter deadline.

## Requirements

Set the deployment URL and gateway key locally. Do not place either value in the repository, command history shared with others, or generated reports.

```bash
export OMNIROUTE_BASE_URL="https://<your-deployment>/api/v1"
export OMNIROUTE_API_KEY_FILE="/path/to/private/gateway-key-file"
```

The key file must contain only the gateway key and must be readable by the current user.

## Start or resume the audit

From the repository root, run:

```bash
python3 scripts/long-running-model-audit.py \
  --base-url "$OMNIROUTE_BASE_URL" \
  --api-key-file "$OMNIROUTE_API_KEY_FILE"
```

The default files are:

| File | Purpose |
|---|---|
| `/tmp/omniroute-long-model-audit-checkpoint.json` | Atomic resumable state and every completed per-model result |
| `/tmp/omniroute-long-model-audit.csv` | Incrementally updated tabular result file |

If the process is interrupted with `Ctrl-C`, the latest completed model remains in the checkpoint. Re-run the same command to continue; already completed IDs are skipped.

## Stop and continuation semantics

The default workflow stops immediately after recording a hard terminal error or a true transport failure. HTTP 402, 401, 403, 404, 400, 405, 409, and 422 are terminal by default because they usually indicate quota, authentication, permission, or request incompatibility. This prevents the audit from continuing to consume quota after a provider has explicitly rejected the operation.

HTTP 408, 429, and 5xx responses are recorded as retryable provider outcomes and the workflow continues to the next model. They represent transient timeout, rate-limit, or upstream availability signals rather than proof that the full catalog cannot be tested. If a complete run is required regardless of hard errors, use:

```bash
python3 scripts/long-running-model-audit.py \
  --base-url "$OMNIROUTE_BASE_URL" \
  --api-key-file "$OMNIROUTE_API_KEY_FILE" \
  --continue-on-error
```

Use `--reset` only when intentionally discarding the current checkpoint and starting all 240 models again:

```bash
python3 scripts/long-running-model-audit.py \
  --base-url "$OMNIROUTE_BASE_URL" \
  --api-key-file "$OMNIROUTE_API_KEY_FILE" \
  --reset
```

## Recorded fields

The JSON and CSV outputs record the model ID, taxonomy provider/family/modality fields, HTTP status, observed latency, OmniRoute route headers, whether a choices array was returned, a safe error code, outcome, and terminal flag. Response text is never saved. Credentials, database URLs, and authorization headers are never written to the output.

A `success` result means HTTP 200 with a non-empty `choices` array. A terminal 402 means the provider rejected that model request, while a `transport_error` means the client could not complete the connection. A 408/429/5xx response is preserved as an observed provider failure and does not automatically stop the audit unless the operator omits `--continue-on-error` only for hard-terminal statuses.

## Operational warning

This is intentionally a long-running process. Keep the terminal or durable host alive until completion. The workflow is designed to be resumable rather than backgrounded inside a short-lived serverless request. The complete audit is finished only when the checkpoint reports `stop_reason: completed_all_models` and contains 240 results.
