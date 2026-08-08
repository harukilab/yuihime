#!/usr/bin/env python3
"""Interactive chat REPL for YuiHime.

Sends each line to POST /api/cortex/think as a named user and prints Yui's reply.

Usage:
    python3 tools/chat.py [--name <user>] [--port <port>] [--context <id>]

Environment:
    YUIHIME_PORT (default 3000), YUIHIME_NAME (default from --name)
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def make_payload(name: str, context_id: str, text: str) -> bytes:
    body = {
        "input": text,
        "userName": name,
        "contextId": context_id,
        "chatType": "web",
    }
    return json.dumps(body).encode("utf-8")


def send(base_url: str, payload: bytes) -> dict:
    req = urllib.request.Request(
        f"{base_url}/api/cortex/think",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"success": False, "error": f"HTTP {e.code}: {e.read().decode('utf-8')}"}
    except urllib.error.URLError as e:
        return {"success": False, "error": str(e.reason)}


def main() -> None:
    ap = argparse.ArgumentParser(description="Chat with Yui interactively.")
    ap.add_argument("--name", default=os.environ.get("YUIHIME_NAME", "User"))
    ap.add_argument("--port", default=os.environ.get("YUIHIME_PORT", "3000"))
    ap.add_argument("--context", default="interactive_cli")
    args = ap.parse_args()

    base_url = f"http://127.0.0.1:{args.port}"
    name = args.name
    context_id = args.context

    print(f"Chat with Yui as '{name}'  (context: {context_id})")
    print("Type 'exit', 'quit' or '/bye' to leave.\n")

    while True:
        try:
            line = input(f"[{name}]> ")
        except (EOFError, KeyboardInterrupt):
            print("\nbye!")
            return

        text = line.strip()
        if not text:
            continue
        if text.lower() in ("exit", "quit", "/bye"):
            print("bye!")
            return

        payload = make_payload(name, context_id, text)
        data = send(base_url, payload)

        if not data.get("success"):
            print(f"[ERROR] {data.get('error', 'unknown error')}")
            continue

        result = data.get("result") or {}
        reply = result.get("response") or result.get("text")
        if not reply or not str(reply).strip():
            print("(Yui didn't reply)")
            continue
        print(f"Yui: {reply}\n")


if __name__ == "__main__":
    main()
