"""
CLI 엔트리포인트 — python -m scripts.hwpx

안정성 기준:
- HWP COM 실패 시 3회 재시도 (전체 생성 프로세스)
- 각 시도마다 프로세스 완전 정리 후 재시작
- 최종 실패 시에도 가능한 한 부분 결과물 저장
"""

import json
import sys
import os
import time
import tempfile
import argparse
import traceback

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from .core import create_hwp, quit_hwp, kill_existing_hwp


def _prepare_workbook_data(data: dict, fmt: str) -> dict:
    """workbook 포맷에서 sections를 자동 변환."""
    if fmt == "workbook" and "sections" in data and "variations" not in data:
        from .extract import extract_workbook_data_from_markdown
        problem_image = data.get("problemImage")
        sections = data.get("sections", [])
        wb_data = extract_workbook_data_from_markdown(sections, problem_image)
        wb_data["graphImagePaths"] = data.get("graphImagePaths", [])
        print(f"[INFO] Auto-extracted: {len(wb_data.get('variations', []))} variations, "
              f"{len(wb_data.get('solutions', []))} solutions", file=sys.stderr)
        return wb_data
    return data


def _generate(hwp, fmt: str, data: dict, output_path: str, temp_dir: str):
    """실제 생성 로직."""
    from .equation import reset_equation_counter
    reset_equation_counter()

    if fmt == "solution":
        from .formats.solution import generate_solution
        generate_solution(hwp, data, output_path, temp_dir)
    elif fmt == "solution-batch":
        from .formats.solution import generate_solution_batch
        generate_solution_batch(hwp, data, output_path, temp_dir)
    elif fmt == "workbook":
        from .formats.workbook import generate_workbook
        generate_workbook(hwp, data, output_path, temp_dir)
    elif fmt == "workbook-multi":
        from .formats.workbook import generate_workbook_multi
        generate_workbook_multi(hwp, data, output_path, temp_dir)


def main():
    parser = argparse.ArgumentParser(description="HWPX 생성기")
    parser.add_argument("--format", required=True,
                        choices=["solution", "solution-batch", "workbook", "workbook-multi"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    temp_dir = tempfile.mkdtemp(prefix="hwpx_")
    data = _prepare_workbook_data(data, args.format)

    MAX_RETRIES = 3
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        hwp = None
        start = time.time()

        try:
            if attempt > 1:
                print(f"\n[INFO] === Retry {attempt}/{MAX_RETRIES} ===", file=sys.stderr)
                kill_existing_hwp()
                time.sleep(2)

            print(f"[INFO] Generating (fmt={args.format}, attempt={attempt})", file=sys.stderr)

            hwp = create_hwp()
            _generate(hwp, args.format, data, args.output, temp_dir)

            elapsed = time.time() - start
            print(f"[INFO] Done in {elapsed:.1f}s", file=sys.stderr)

            if os.path.exists(args.output) and os.path.getsize(args.output) > 100:
                return 0
            else:
                raise RuntimeError("Output file not created or too small")

        except Exception as e:
            last_error = e
            elapsed = time.time() - start
            print(f"[ERROR] Attempt {attempt} failed after {elapsed:.1f}s: {e}",
                  file=sys.stderr)
            if attempt == MAX_RETRIES:
                traceback.print_exc(file=sys.stderr)

        finally:
            if hwp:
                try:
                    quit_hwp(hwp)
                except Exception:
                    kill_existing_hwp()

    # 모든 재시도 실패
    print(f"[FATAL] All {MAX_RETRIES} attempts failed: {last_error}", file=sys.stderr)
    return 1


def _cleanup_temp(temp_dir):
    try:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass


if __name__ == "__main__":
    try:
        exit_code = main()
    except SystemExit:
        exit_code = 0
    except Exception:
        exit_code = 1
    sys.exit(exit_code)
