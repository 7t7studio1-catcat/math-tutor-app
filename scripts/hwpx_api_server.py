"""
HWPX API Server — 독립 실행형 Windows HWPX 생성 서비스.

HWP COM을 사용하여 출판 품질 HWPX 파일을 생성하는 HTTP API.
Vercel 프론트엔드에서 호출하여 어디서든 완벽한 HWPX를 생성.

사용법:
  python scripts/hwpx_api_server.py
  → http://localhost:4000 에서 실행

  Cloudflare Tunnel / ngrok으로 외부 노출 가능:
  cloudflared tunnel --url http://localhost:4000
"""

import json
import os
import sys
import time
import tempfile
import traceback
import threading
import queue
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Add scripts directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PORT = 4000

# Global queue for serializing HWP COM access (one at a time)
hwp_lock = threading.Lock()
request_queue = queue.Queue()
active_count = 0


def create_hwpx(data: dict, output_path: str) -> str:
    """Generate HWPX using HWP COM. Returns output file path."""
    import win32com.client as win32

    hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
    hwp.XHwpWindows.Item(0).Visible = False
    time.sleep(0.2)

    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception:
        pass
    try:
        hwp.SetMessageBoxMode(0x10000)
    except Exception:
        pass

    hwp.Run("FileNew")
    time.sleep(0.1)

    # Helper functions
    def insert_text(text):
        act = hwp.CreateAction("InsertText")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("Text", text)
        act.Execute(pset)

    def break_para():
        try:
            hwp.HAction.Run("BreakPara")
        except Exception:
            pass

    def insert_equation(eq_str, base_size=8):
        act = hwp.CreateAction("EquationCreate")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("EqFontName", "HancomEQN")
        pset.SetItem("string", eq_str)
        pset.SetItem("BaseUnit", hwp.PointToHwpUnit(base_size))
        act.Execute(pset)
        try:
            hwp.Run("MoveRight")
        except Exception:
            pass

    def set_font(name, size, bold=False, color=0):
        act = hwp.CreateAction("CharShape")
        pset = act.CreateSet()
        act.GetDefault(pset)
        for i in range(7):
            pset.SetItem(f"FaceName{i}", name)
        pset.SetItem("Height", hwp.PointToHwpUnit(size))
        pset.SetItem("Bold", 1 if bold else 0)
        if color:
            pset.SetItem("TextColor", color)
        act.Execute(pset)

    def set_line_spacing(percent=160):
        act = hwp.CreateAction("ParagraphShape")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("LineSpacingType", 0)
        pset.SetItem("LineSpacing", percent)
        act.Execute(pset)

    try:
        # Set default formatting
        set_line_spacing(160)
        set_font("함초롬바탕", 10)

        sections = data.get("sections", [])
        for si, section_content in enumerate(sections):
            if si > 0:
                break_para()
                break_para()

            if not section_content:
                continue

            # Process content line by line
            lines = section_content.split("\n")
            for li, line in enumerate(lines):
                stripped = line.strip()
                if not stripped:
                    break_para()
                    continue

                # Process [EQ], [DEQ] markers and plain text
                _process_line(hwp, stripped, insert_text, insert_equation,
                              break_para, set_font)

                if li < len(lines) - 1:
                    break_para()

        # Save
        abs_path = os.path.abspath(output_path)
        hwp.SaveAs(abs_path, "HWPX")
        print(f"[OK] HWPX saved: {abs_path}", file=sys.stderr)
        return abs_path

    finally:
        try:
            hwp.Clear(1)
            hwp.Quit()
        except Exception:
            pass


def _process_line(hwp, line, insert_text, insert_equation, break_para, set_font):
    """Process a single line with mixed text and equations."""
    import re

    # Check for heading
    heading_match = re.match(r'^(#{1,4})\s+(.+)', line)
    if heading_match:
        level = len(heading_match.group(1))
        text = heading_match.group(2)
        size = {1: 14, 2: 12, 3: 11, 4: 10}.get(level, 10)
        set_font("함초롬돋움", size, bold=True)
        text = _strip_markdown(text)
        insert_text(text)
        set_font("함초롬바탕", 10)
        return

    # Strip markdown bold/italic
    line = _strip_markdown(line)

    # Split by equation markers and process each part
    parts = re.split(r'(\[EQ\].*?\[/EQ\]|\[DEQ\].*?\[/DEQ\]|\$\$.*?\$\$|\$[^$]+\$)', line)

    for part in parts:
        if not part:
            continue

        # [DEQ]...[/DEQ] — display equation
        deq = re.match(r'^\[DEQ\](.*?)\[/DEQ\]$', part)
        if deq:
            insert_equation(deq.group(1), base_size=10)
            continue

        # [EQ]...[/EQ] — inline equation
        eq = re.match(r'^\[EQ\](.*?)\[/EQ\]$', part)
        if eq:
            insert_equation(eq.group(1), base_size=8)
            continue

        # $$...$$ — display LaTeX (convert to HwpEqn-like format)
        dmath = re.match(r'^\$\$(.*?)\$\$$', part)
        if dmath:
            insert_equation(dmath.group(1), base_size=10)
            continue

        # $...$ — inline LaTeX
        imath = re.match(r'^\$([^$]+)\$$', part)
        if imath:
            insert_equation(imath.group(1), base_size=8)
            continue

        # Plain text
        if part.strip():
            insert_text(part)


def _strip_markdown(text):
    """Remove markdown formatting."""
    import re
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'~~(.+?)~~', r'\1', text)
    # Replace emojis
    text = text.replace('✅', '[정답]')
    text = text.replace('❌', '[오답]')
    return text


class HwpxHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/hwpx-export":
            self._handle_export()
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "hwp": True}).encode())
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def _handle_export(self):
        global active_count
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length).decode("utf-8"))

            # Wait for HWP COM lock (queue system)
            wait_start = time.time()
            acquired = hwp_lock.acquire(timeout=120)
            if not acquired:
                error_json = json.dumps({"error": "대기 시간 초과. 잠시 후 다시 시도해주세요."}).encode("utf-8")
                self.send_response(503)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(error_json)
                return

            wait_time = time.time() - wait_start
            if wait_time > 1:
                print(f"[QUEUE] Waited {wait_time:.1f}s for HWP COM lock")

            try:
                with tempfile.TemporaryDirectory(prefix="hwpx_api_") as tmp:
                    output_path = os.path.join(tmp, "output.hwpx")
                    create_hwpx(body, output_path)

                    with open(output_path, "rb") as f:
                        hwpx_data = f.read()

                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", 'attachment; filename="solution.hwpx"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(hwpx_data)))
                self.end_headers()
                self.wfile.write(hwpx_data)
                print(f"[OK] HWPX exported ({len(hwpx_data)} bytes)")
            finally:
                hwp_lock.release()

        except Exception as e:
            if hwp_lock.locked():
                try: hwp_lock.release()
                except: pass
            traceback.print_exc()
            error_json = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(error_json)

    def log_message(self, format, *args):
        print(f"[HWPX-API] {args[0]}", file=sys.stderr)


class ThreadedHTTPServer(HTTPServer):
    """Handle each request in a new thread (queue serializes HWP COM)."""
    allow_reuse_address = True

    def process_request(self, request, client_address):
        t = threading.Thread(target=self._handle, args=(request, client_address))
        t.daemon = True
        t.start()

    def _handle(self, request, client_address):
        try:
            self.finish_request(request, client_address)
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)


def main():
    server = ThreadedHTTPServer(("0.0.0.0", PORT), HwpxHandler)
    print(f"=" * 60)
    print(f"  HWPX API Server (Thread-safe Queue)")
    print(f"  http://localhost:{PORT}")
    print(f"  Health: http://localhost:{PORT}/health")
    print(f"  Export: POST http://localhost:{PORT}/api/hwpx-export")
    print(f"  동시 요청 시 자동 대기열 처리 (최대 120초)")
    print(f"=" * 60)
    print(f"  Waiting for requests...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
