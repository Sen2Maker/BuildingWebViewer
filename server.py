#!/usr/bin/env python3
"""Serve the local 3D tools UI without reading or exposing model data."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
HTML_FILES = ('index.html', 'lod.html', 'wireframe.html', 'pointcloud.html')
CSS_FILES = ('hub.css', 'styles.css', 'cloud.css', 'viewer-controls.css', 'camera-controls.css', 'viewer-layout.css')
JS_FILES = ('viewer.js', 'renderer.js', 'obj-parser.js', 'app.js',
            'cloud-app.bundle.js', 'cloud-app.js', 'cloud-renderer.js', 'point-io.js')
STATIC_FILES = {'/': ('index.html', 'text/html; charset=utf-8')}
for names, content_type in ((HTML_FILES, 'text/html; charset=utf-8'),
                            (CSS_FILES, 'text/css; charset=utf-8'),
                            (JS_FILES, 'text/javascript; charset=utf-8')):
    STATIC_FILES.update({'/' + name: (name, content_type) for name in names})


def json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')


def make_handler():
    class ViewerHandler(BaseHTTPRequestHandler):
        server_version = 'BuildingWebViewer/1.0'

        def respond(self, status: HTTPStatus, body: bytes,
                    content_type: str = 'application/json; charset=utf-8'):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            if self.command != 'HEAD':
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def error(self, status: HTTPStatus, message: str):
            self.respond(status, json_bytes({'error': message, 'status': int(status)}))

        def send_error(self, code, message=None, explain=None):
            self.error(HTTPStatus(code), message or HTTPStatus(code).phrase)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            try:
                path = unquote(urlsplit(self.path).path, errors='strict')
                if path == '/api/health':
                    self.respond(HTTPStatus.OK, json_bytes({'status': 'ok', 'mode': 'static', 'data': 'manual-selection'}))
                elif path in STATIC_FILES:
                    filename, content_type = STATIC_FILES[path]
                    file_path = HERE / filename
                    # Only exact assets from this directory are accessible.
                    if file_path.resolve().parent != HERE:
                        self.error(HTTPStatus.NOT_FOUND, 'File not found.')
                        return
                    self.respond(HTTPStatus.OK, file_path.read_bytes(), content_type)
                else:
                    self.error(HTTPStatus.NOT_FOUND, 'Endpoint or file not found.')
            except FileNotFoundError:
                self.error(HTTPStatus.NOT_FOUND, 'Viewer asset not found. Extract the complete package first.')
            except (ValueError, UnicodeError):
                self.error(HTTPStatus.BAD_REQUEST, 'Invalid request URL.')
            except OSError as exc:
                print(f'File access error: {exc}', file=sys.stderr)
                self.error(HTTPStatus.INTERNAL_SERVER_ERROR, 'Could not read the requested viewer asset.')

        def do_POST(self):
            self.error(HTTPStatus.METHOD_NOT_ALLOWED, 'This service only serves local UI assets; use GET or HEAD.')

        do_PUT = do_POST
        do_PATCH = do_POST
        do_DELETE = do_POST
        do_OPTIONS = do_POST

    return ViewerHandler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765, help='Local port (default: 8765)')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler())
    except OSError as exc:
        print(f'Unable to start BuildingWebViewer: {exc}', file=sys.stderr)
        return 1
    print(f'BuildingWebViewer: http://127.0.0.1:{server.server_port}', flush=True)
    print('Choose a tool, then choose your files or folder in the browser. No model directory is preloaded.', flush=True)
    print('Local UI service only. Press Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
