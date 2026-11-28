"""A tiny fake ComfyUI3D for the e2e suite, started by the app as `<python> main.py --port N` in its engine dir.

Answers /system_stats, /interrupt, /queue, /free and /prompt, and sends a `progress` message on /ws to the
client a /prompt names. Every POST is appended to `calls.log` in the engine dir.
"""
import base64
import hashlib
import json
import struct
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

PORT = int(sys.argv[sys.argv.index("--port") + 1])
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
STEPS = 12
CALLS = Path.cwd() / "calls.log"

clients = {}
steps = {}
lock = threading.Lock()


def frame(text):
    data = text.encode("utf-8")
    head = bytes([0x81, len(data)]) if len(data) < 126 else bytes([0x81, 126]) + struct.pack(">H", len(data))
    return head + data


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def reply(self, body):
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path == "/system_stats":
            self.reply({"system": {"comfyui_version": "fake"}, "devices": []})
        elif path == "/ws":
            self.websocket(parse_qs(query).get("clientId", [""])[0])
        else:
            self.send_error(404)

    def do_POST(self):
        path = self.path.partition("?")[0]
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        with lock, CALLS.open("a", encoding="utf-8") as log:
            log.write(path + "\n")
        if path == "/prompt":
            client = (json.loads(body or b"{}")).get("client_id", "")
            with lock:
                steps[client] = min(steps.get(client, 0) + 1, STEPS)
                sock = clients.get(client)
                message = json.dumps({"type": "progress", "data": {"value": steps[client], "max": STEPS, "prompt_id": "fake", "node": "3"}})
                if sock:
                    try:
                        sock.sendall(frame(message))
                    except OSError:
                        clients.pop(client, None)
            self.reply({"prompt_id": "fake", "number": 1})
        elif path in ("/interrupt", "/queue", "/free"):
            self.reply({})
        else:
            self.send_error(404)

    def websocket(self, client):
        accept = base64.b64encode(hashlib.sha1((self.headers["Sec-WebSocket-Key"] + WS_GUID).encode()).digest()).decode()
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        self.wfile.flush()
        with lock:
            clients[client] = self.connection
        try:
            while self.connection.recv(1024):
                pass
        except OSError:
            pass
        with lock:
            if clients.get(client) is self.connection:
                clients.pop(client)
        self.close_connection = True


ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
