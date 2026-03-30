"""
자동 피드백 루프 — HWPX 생성 → PDF 변환 → 이미지 분석 → 코드 수정 반복
이 스크립트는 테스트 데이터로 한글 파일을 만들고 PDF로 확인하는 과정을 자동화합니다.
"""
import subprocess
import sys
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)

def run_generation():
    """테스트 데이터로 HWPX + PDF 생성"""
    result = subprocess.run(
        [sys.executable, os.path.join(SCRIPTS_DIR, "hwpx_generator.py"),
         "--input", os.path.join(SCRIPTS_DIR, "test_data.json"),
         "--output", os.path.join(SCRIPTS_DIR, "test_output.hwpx"),
         "--mode", "single"],
        capture_output=True, text=True, timeout=300
    )
    print(result.stderr)
    if result.returncode != 0:
        print(f"[ERROR] Generation failed: {result.stderr}")
        return False
    return True

def convert_to_images():
    """PDF → 이미지 변환"""
    pdf_path = os.path.join(SCRIPTS_DIR, "test_output.pdf")
    if not os.path.exists(pdf_path):
        print("[ERROR] PDF not found")
        return []

    import fitz
    doc = fitz.open(pdf_path)
    paths = []
    for i in range(min(6, len(doc))):
        img_path = os.path.join(SCRIPTS_DIR, f"_auto_{i+1}.png")
        doc[i].get_pixmap(dpi=250).save(img_path)
        paths.append(img_path)
    doc.close()
    print(f"[OK] {len(paths)} pages converted")
    return paths

def cleanup_images():
    for f in os.listdir(SCRIPTS_DIR):
        if f.startswith("_auto_") and f.endswith(".png"):
            os.remove(os.path.join(SCRIPTS_DIR, f))

if __name__ == "__main__":
    print("=== Round 1: Generate ===")
    if run_generation():
        paths = convert_to_images()
        print(f"Images: {paths}")
        print("Done. Check images for quality.")
