"""
local_server.py — 로컬 개발 서버

프로덕션(API Gateway → Lambda)과 동일한 라우팅을 순수 Python http.server로 제공한다.

라우팅:
  GET  /api/daily/{date}   → daily/{date}/results.json 파일 서빙
  GET  /stores.json        → 프로젝트 루트 stores.json
  GET  /*                  → frontend/ 정적 파일 서빙
  OPTIONS *                → CORS preflight

실행:
  python local_server.py   # http://localhost:8000
"""

from __future__ import annotations

import json
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

# 프로젝트 루트를 sys.path에 추가하여 lambdas 패키지 import 가능하게
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

# .env 파일 로드 (가장 먼저 실행하여 모든 모듈에서 환경변수 사용 가능)
try:
    from dotenv import load_dotenv
    _env_file = PROJECT_ROOT / ".env"
    if _env_file.exists():
        load_dotenv(_env_file)
        print(f"[server] .env 로드: {_env_file}")
except ImportError:
    pass

PORT = 8000

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

# daily API 경로 패턴: /api/daily/{date}
DAILY_PATTERN = re.compile(r"^/api/daily/(\d{4}-\d{2}-\d{2})$")
# alerts API 경로 패턴
ALERTS_INDEX_PATTERN = re.compile(r"^/api/alerts/(\d{4}-\d{2}-\d{2})$")
ALERTS_DETAIL_PATTERN = re.compile(r"^/api/alerts/(\d{4}-\d{2}-\d{2})/(.+)$")


class LocalHandler(SimpleHTTPRequestHandler):
    """로컬 개발용 HTTP 요청 핸들러."""

    def __init__(self, *args, **kwargs):
        # frontend/ 디렉토리를 정적 파일 루트로 설정
        super().__init__(*args, directory=str(PROJECT_ROOT / "frontend"), **kwargs)

    # ── CORS 헬퍼 ──

    def _send_cors_headers(self):
        """공통 CORS 헤더를 전송한다."""
        for key, value in CORS_HEADERS.items():
            self.send_header(key, value)

    def _send_json(self, status_code: int, body: str):
        """JSON 응답을 전송한다."""
        encoded = body.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._send_cors_headers()
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_error_json(self, status_code: int, message: str):
        """에러 JSON 응답을 전송한다."""
        body = json.dumps({"error": message}, ensure_ascii=False)
        self._send_json(status_code, body)

    def _serve_file(self, file_path: Path, content_type: str = "application/json"):
        """로컬 파일을 HTTP 응답으로 서빙한다."""
        if not file_path.exists():
            self._send_error_json(404, f"파일을 찾을 수 없습니다: {file_path.name}")
            return
        try:
            data = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self._send_error_json(500, str(e))

    # ── 라우팅 ──

    def _route(self, method: str):
        """요청 경로에 따라 적절한 핸들러로 분기한다."""
        parsed = urlparse(self.path)
        path = parsed.path

        # CORS preflight
        if method == "OPTIONS":
            self.send_response(204)
            self._send_cors_headers()
            self.end_headers()
            return

        # GET /api/daily/{date} → daily/{date}/results.json
        daily_match = DAILY_PATTERN.match(path)
        if method == "GET" and daily_match:
            date_str = daily_match.group(1)
            file_path = PROJECT_ROOT / "daily" / date_str / "results.json"
            self._serve_file(file_path)
            return

        # GET /api/alerts/{date} → alerts/{date}/index.json (알림 목록)
        alerts_index_match = ALERTS_INDEX_PATTERN.match(path)
        if method == "GET" and alerts_index_match:
            date_str = alerts_index_match.group(1)
            file_path = PROJECT_ROOT / "alerts" / date_str / "index.json"
            self._serve_file(file_path)
            return

        # GET /api/alerts/{date}/{filename} → alerts/{date}/{filename} (알림 상세)
        alerts_detail_match = ALERTS_DETAIL_PATTERN.match(path)
        if method == "GET" and alerts_detail_match:
            date_str = alerts_detail_match.group(1)
            filename = alerts_detail_match.group(2)
            file_path = PROJECT_ROOT / "alerts" / date_str / filename
            self._serve_file(file_path)
            return

        # GET /stores.json → 프로젝트 루트 stores.json
        if method == "GET" and path == "/stores.json":
            self._serve_file(PROJECT_ROOT / "stores.json")
            return

        # 그 외 GET → frontend/ 정적 파일 서빙
        if method == "GET":
            super().do_GET()
            return

        # 지원하지 않는 메서드/경로
        self._send_error_json(404, f"Not Found: {method} {path}")

    # ── HTTP 메서드 핸들러 ──

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def do_OPTIONS(self):
        self._route("OPTIONS")

    # ── 로그 포맷 ──

    def log_message(self, format, *args):
        """요청 로그를 간결하게 출력한다."""
        print(f"[{self.log_date_time_string()}] {args[0]}")


def main():
    """서버를 시작한다."""
    # frontend/ 디렉토리가 없으면 생성
    frontend_dir = PROJECT_ROOT / "frontend"
    frontend_dir.mkdir(exist_ok=True)

    import socket

    class ReusableHTTPServer(HTTPServer):
        allow_reuse_address = True
        allow_reuse_port = True

    server = ReusableHTTPServer(("", PORT), LocalHandler)
    print(f"로컬 개발 서버 시작: http://localhost:{PORT}")
    print(f"  GET  /api/daily/{{date}}   → daily/{{date}}/results.json")
    print(f"  GET  /stores.json        → stores.json")
    print(f"  GET  /*                  → frontend/ 정적 파일")
    print(f"종료: Ctrl+C")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")
        server.server_close()


if __name__ == "__main__":
    main()
