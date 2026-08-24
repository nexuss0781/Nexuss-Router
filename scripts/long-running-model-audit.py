#!/usr/bin/env python3
"""Run a resumable, no-client-timeout greeting audit through OmniRoute.

The script intentionally probes one model at a time. It checkpoints after every
attempt, resumes by default, and stops on terminal provider errors so a quota or
authentication failure is not mistaken for a complete catalog audit.
"""

import argparse
import csv
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

TERMINAL_STATUSES = {400, 401, 402, 403, 404, 405, 409, 422}
RATE_LIMIT_STATUSES = {408, 429, 500, 502, 503, 504}


def atomic_write(path: Path, payload: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n")
    temporary.replace(path)


def load_catalog(path: Path) -> list[dict]:
    rows = json.loads(path.read_text()).get("models", [])
    ids = [row.get("model_id") for row in rows]
    if len(ids) != 240 or len(set(ids)) != 240 or any(not isinstance(model_id, str) or "/" not in model_id for model_id in ids):
        raise SystemExit("catalog must contain exactly 240 unique provider-qualified model IDs")
    return rows


def safe_error_code(payload: object) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("code"), str):
            return error["code"]
    return ""


def probe(base_url: str, api_key: str, row: dict, prompt: str) -> dict:
    model_id = row["model_id"]
    request_body = json.dumps({
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 32,
    }).encode()
    request = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=request_body,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    started = time.perf_counter()
    result = {
        "model_id": model_id,
        "provider_group": row.get("provider_group", ""),
        "family": row.get("family", ""),
        "modality": row.get("modality", ""),
        "task_role": row.get("task_role", ""),
        "http_status": None,
        "latency_ms": None,
        "routed_provider": "",
        "routed_model": "",
        "has_choices": False,
        "error_code": "",
        "outcome": "",
        "terminal": False,
    }
    try:
        # No timeout is passed deliberately. The request may wait until the
        # gateway/provider responds. Stop the process with Ctrl-C if needed;
        # the previous checkpoint remains intact.
        with urllib.request.urlopen(request) as response:
            result["http_status"] = response.status
            result["latency_ms"] = round((time.perf_counter() - started) * 1000)
            result["routed_provider"] = response.headers.get("x-omniroute-provider", "")
            result["routed_model"] = response.headers.get("x-omniroute-model", "")
            try:
                payload = json.loads(response.read())
            except Exception:
                payload = {}
            result["has_choices"] = bool(isinstance(payload, dict) and payload.get("choices"))
            result["outcome"] = "success" if response.status == 200 and result["has_choices"] else "http_success_without_choices"
            result["terminal"] = response.status not in {200}
    except urllib.error.HTTPError as exc:
        result["http_status"] = exc.code
        result["latency_ms"] = round((time.perf_counter() - started) * 1000)
        result["routed_provider"] = exc.headers.get("x-omniroute-provider", "")
        result["routed_model"] = exc.headers.get("x-omniroute-model", "")
        try:
            payload = json.loads(exc.read())
        except Exception:
            payload = {}
        result["has_choices"] = bool(isinstance(payload, dict) and payload.get("choices"))
        result["error_code"] = safe_error_code(payload)
        result["outcome"] = f"http_{exc.code}"
        result["terminal"] = exc.code in TERMINAL_STATUSES
    except (ConnectionError, ConnectionResetError, BrokenPipeError, socket.error, urllib.error.URLError) as exc:
        result["latency_ms"] = round((time.perf_counter() - started) * 1000)
        result["error_code"] = type(exc).__name__
        result["outcome"] = "transport_error"
        result["terminal"] = True
    return result


def write_csv(path: Path, results: list[dict]) -> None:
    if not results:
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(results[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(results)
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.environ.get("OMNIROUTE_BASE_URL", ""))
    parser.add_argument("--api-key-file", default="/tmp/omniroute-vercel-ai-api-key")
    parser.add_argument("--catalog", default="/home/ubuntu/OmniRoute-ai-only-deploy/docs/model-taxonomy.json")
    parser.add_argument("--checkpoint", default="/tmp/omniroute-long-model-audit-checkpoint.json")
    parser.add_argument("--csv", default="/tmp/omniroute-long-model-audit.csv")
    parser.add_argument("--prompt", default="Say hi in one short sentence.")
    parser.add_argument("--continue-on-error", action="store_true", help="Record terminal errors and continue instead of stopping")
    parser.add_argument("--reset", action="store_true", help="Discard the existing checkpoint before starting")
    args = parser.parse_args()

    catalog = load_catalog(Path(args.catalog))
    if not args.base_url:
        raise SystemExit("provide --base-url or OMNIROUTE_BASE_URL; the workflow intentionally has no shared endpoint default")
    api_key = Path(args.api_key_file).read_text().strip()
    checkpoint_path = Path(args.checkpoint)
    csv_path = Path(args.csv)
    if args.reset and checkpoint_path.exists():
        checkpoint_path.unlink()
    if checkpoint_path.exists():
        checkpoint = json.loads(checkpoint_path.read_text())
        results = checkpoint.get("results", [])
        if checkpoint.get("catalog_ids") != [row["model_id"] for row in catalog]:
            raise SystemExit("checkpoint catalog does not match the current 240-model taxonomy")
    else:
        results = []
        checkpoint = {
            "workflow": "sequential-no-client-timeout",
            "base_url": args.base_url,
            "prompt": args.prompt,
            "catalog_ids": [row["model_id"] for row in catalog],
            "results": results,
            "stopped": False,
            "stop_reason": "",
        }
    completed = {result["model_id"] for result in results}
    atomic_write(checkpoint_path, checkpoint)
    write_csv(csv_path, results)

    print(f"catalog={len(catalog)} completed={len(completed)} checkpoint={checkpoint_path}", flush=True)
    try:
        for row in catalog:
            if row["model_id"] in completed:
                continue
            result = probe(args.base_url, api_key, row, args.prompt)
            results.append(result)
            completed.add(row["model_id"])
            checkpoint["results"] = results
            checkpoint["last_completed_model"] = row["model_id"]
            checkpoint["updated_at_epoch"] = time.time()
            if result["terminal"] and not args.continue_on_error:
                checkpoint["stopped"] = True
                checkpoint["stop_reason"] = f"{result['outcome']}:{result['error_code']}"
            atomic_write(checkpoint_path, checkpoint)
            write_csv(csv_path, results)
            print(json.dumps({
                "completed": len(completed),
                "model_id": result["model_id"],
                "outcome": result["outcome"],
                "http_status": result["http_status"],
                "latency_ms": result["latency_ms"],
                "terminal": result["terminal"],
            }, sort_keys=True), flush=True)
            if result["terminal"] and not args.continue_on_error:
                print(f"stopped={checkpoint['stop_reason']}", flush=True)
                return 2
    except KeyboardInterrupt:
        checkpoint["stopped"] = True
        checkpoint["stop_reason"] = "interrupted_by_operator"
        checkpoint["results"] = results
        atomic_write(checkpoint_path, checkpoint)
        write_csv(csv_path, results)
        print(f"stopped=interrupted_by_operator completed={len(results)}", flush=True)
        return 130

    checkpoint["stopped"] = False
    checkpoint["stop_reason"] = "completed_all_models"
    checkpoint["results"] = results
    atomic_write(checkpoint_path, checkpoint)
    write_csv(csv_path, results)
    print(f"completed_all_models={len(results)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
