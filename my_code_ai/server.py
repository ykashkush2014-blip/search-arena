"""
Web UI for your own programming AI (Python standard library only).

    python server.py --port 8000
    http://localhost:8000           -> chat (Arabic / English)
    http://localhost:8000/complete  -> raw code completion
"""
import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch

from chat import answer, load_chat
from generate import complete, load

HERE = os.path.dirname(os.path.abspath(__file__))
CKPT = os.path.join(HERE, "checkpoints")
LOCK = threading.Lock()
_cache = {}


def get(kind):
    """Load (or hot-reload when the file changes, e.g. during training) a model."""
    path = os.path.join(CKPT, "chat_model.pt" if kind == "chat" else "model.pt")
    if not os.path.exists(path):
        return None
    m = os.path.getmtime(path)
    if kind not in _cache or _cache[kind]["mtime"] != m:
        model, tok, ck = (load_chat if kind == "chat" else load)(path)
        _cache[kind] = {"model": model, "tok": tok, "ck": ck, "mtime": m}
    return _cache[kind]


def history(name):
    p = os.path.join(CKPT, name)
    return json.load(open(p)) if os.path.exists(p) else []


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

    def _page(self, name):
        with open(os.path.join(HERE, "web", name), encoding="utf-8") as f:
            self._send(200, f.read(), "text/html; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self._page("index.html")
        if path in ("/complete", "/complete.html"):
            return self._page("complete.html")
        if path in ("/api/info", "/api/chat_info"):
            kind = "chat" if path == "/api/chat_info" else "base"
            with LOCK:
                st = get(kind)
            if not st:
                return self._send(200, json.dumps({"ready": False}), "application/json")
            info = {"ready": True, "params": st["model"].num_params(), "iter": st["ck"]["iter"],
                    "val_loss": st["ck"]["val_loss"], "config": st["ck"]["config"],
                    "history": history("chat_history.json" if kind == "chat" else "history.json")}
            return self._send(200, json.dumps(info), "application/json")
        self._send(404, "not found", "text/plain")

    def _stream_start(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

    def do_POST(self):
        if self.path not in ("/api/complete", "/api/chat"):
            return self._send(404, "not found", "text/plain")
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        kind = "chat" if self.path == "/api/chat" else "base"
        with LOCK:
            st = get(kind)
        if not st:
            return self._send(503, "model not trained yet", "text/plain")
        self._stream_start()

        def stream(s):
            self.wfile.write(s.encode("utf-8"))
            self.wfile.flush()

        try:
            with LOCK:
                if kind == "chat":
                    answer(st["model"], st["tok"], req.get("message", ""),
                           max_new_tokens=min(int(req.get("max_tokens", 300)), 400),
                           temperature=float(req.get("temperature", 0.0)), stream=stream)
                else:
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
