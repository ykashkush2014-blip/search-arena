"""
Tiny web UI for your own code model (Python standard library only).

    python server.py --port 8000
Then open http://localhost:8000
"""
import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch

from generate import complete, load

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = {"model": None, "tok": None, "ck": None, "mtime": None}
LOCK = threading.Lock()


def get_model():
    """(Re)load the checkpoint if it changed on disk — handy while training."""
    path = os.path.join(HERE, "checkpoints", "model.pt")
    if not os.path.exists(path):
        return None
    m = os.path.getmtime(path)
    if STATE["mtime"] != m:
        STATE["model"], STATE["tok"], STATE["ck"] = load(path)
        STATE["mtime"] = m
    return STATE


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "web", "index.html"), encoding="utf-8") as f:
                self._send(200, f.read(), "text/html; charset=utf-8")
        elif self.path == "/api/info":
            with LOCK:
                st = get_model()
            if not st:
                return self._send(200, json.dumps({"ready": False}), "application/json")
            hist = []
            hp = os.path.join(HERE, "checkpoints", "history.json")
            if os.path.exists(hp):
                hist = json.load(open(hp))
            info = {"ready": True, "params": st["model"].num_params(),
                    "iter": st["ck"]["iter"], "val_loss": st["ck"]["val_loss"],
                    "config": st["ck"]["config"], "history": hist}
            self._send(200, json.dumps(info), "application/json")
        else:
            self._send(404, "not found", "text/plain")

    def do_POST(self):
        if self.path != "/api/complete":
            return self._send(404, "not found", "text/plain")
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        with LOCK:
            st = get_model()
        if not st:
            return self._send(503, "model not trained yet", "text/plain")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def stream(s):
            self.wfile.write(s.encode("utf-8"))
            self.wfile.flush()

        try:
            with LOCK:
                complete(st["model"], st["tok"], req.get("prompt", ""),
                         max_new_tokens=min(int(req.get("max_tokens", 150)), 512),
                         temperature=float(req.get("temperature", 0.7)),
                         top_k=int(req.get("top_k", 40)), stream=stream)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--threads", type=int, default=os.cpu_count())
    args = ap.parse_args()
    torch.set_num_threads(args.threads)
    print(f"my_code_ai UI on http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
