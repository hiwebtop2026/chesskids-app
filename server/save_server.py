#!/usr/bin/env python3
"""Simple HTTP server that can save files via POST and serve static files."""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class SaveHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        body = self.rfile.read(content_length)
        # Path format: /save?path=xxx
        if self.path.startswith('/save'):
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            file_path = params.get('path', [''])[0]
            if file_path:
                try:
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    with open(file_path, 'wb') as f:
                        f.write(body)
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/plain')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(f'Saved {len(body)} bytes to {file_path}'.encode())
                    print(f'[SAVED] {len(body)} bytes -> {file_path}', flush=True)
                    return
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-Type', 'text/plain')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(f'Error: {e}'.encode())
                    return
        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    os.chdir(directory)
    server = HTTPServer(('127.0.0.1', port), SaveHandler)
    print(f'Server running on http://127.0.0.1:{port}, serving from {directory}', flush=True)
    server.serve_forever()
