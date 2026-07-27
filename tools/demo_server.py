#!/usr/bin/env python3
"""Demo HTTP server untuk test background task Yui."""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import datetime

class YuiHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        now = datetime.datetime.now().isoformat()
        response = {
            "status": "ok",
            "message": "Halo dari Yui! Server berjalan sebagai background task~ ✨",
            "path": self.path,
            "timestamp": now,
        }
        body = json.dumps(response, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Tetap log ke stdout supaya bisa dipantau
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {format % args}")

if __name__ == "__main__":
    host = "127.0.0.1"
    port = 9876
    server = HTTPServer((host, port), YuiHandler)
    print(f"🌸 Yui Demo Server running at http://{host}:{port}")
    print("Tekan Ctrl+C untuk stop.")
    server.serve_forever()
