#!/usr/bin/env python3
"""
dev_server.py — Static file server for local development, plus review-comment sync.

Identical to `python3 -m http.server` for serving the site, with one addition:

    GET  /__review   -> current comments as JSON
    POST /__review   -> replace comments with the posted JSON

Comments are stored in .review-comments.json at the repo root (gitignored), so
review notes made in the browser are readable as a plain file rather than being
trapped in localStorage. js/review.js syncs to this automatically and falls back
to localStorage alone when the endpoint is absent, so `python3 -m http.server`
still works.

Usage (from repo root):
    python3 scripts/dev_server.py [port]      # default 8000
"""

import http.server
import json
import pathlib
import socketserver
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STORE = ROOT / ".review-comments.json"
ENDPOINT = "/__review"
MAX_BODY = 2 * 1024 * 1024  # comments are small; refuse anything absurd


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        # Dev only: the page and the endpoint are same-origin, but be explicit.
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == ENDPOINT:
            if STORE.exists():
                try:
                    self._send_json(json.loads(STORE.read_text()))
                except json.JSONDecodeError:
                    self._send_json({}, 200)
            else:
                self._send_json({})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != ENDPOINT:
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            self.send_error(413)
            return

        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send_json({"ok": False, "error": "invalid JSON"}, 400)
            return

        # An empty store means "nothing outstanding" — remove the file so its
        # absence is unambiguous rather than leaving an empty object behind.
        if data:
            STORE.write_text(json.dumps(data, indent=2) + "\n")
        elif STORE.exists():
            STORE.unlink()

        self._send_json({"ok": True})

    def log_message(self, fmt, *args):
        # Quiet the per-request noise; keep the endpoint visible.
        if ENDPOINT in (args[0] if args else ""):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{port}")
        print(f"Review comments -> {STORE.name} (via {ENDPOINT})")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
