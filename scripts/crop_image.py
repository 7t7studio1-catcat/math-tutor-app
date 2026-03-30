"""이미지 크롭 유틸리티 — Nova AI 스타일 비율 좌표 기반 크롭.

사용법:
  python crop_image.py --input image.png --output crop.png --coords 0.05,0.35,0.45,0.85

좌표: x1_pct,y1_pct,x2_pct,y2_pct (0.0~1.0 비율)
"""
import argparse
import sys
import os


def crop_image(input_path: str, output_path: str, coords: list[float]) -> dict:
    from PIL import Image

    x1_pct, y1_pct, x2_pct, y2_pct = coords
    img = Image.open(input_path)
    w, h = img.size

    left = int(w * max(0.0, min(1.0, x1_pct)))
    top = int(h * max(0.0, min(1.0, y1_pct)))
    right = int(w * max(0.0, min(1.0, x2_pct)))
    bottom = int(h * max(0.0, min(1.0, y2_pct)))

    if right <= left or bottom <= top:
        print(f"[WARN] Invalid crop coords: ({left},{top})-({right},{bottom})", file=sys.stderr)
        return {"path": input_path, "width": w, "height": h}

    margin_x = int((right - left) * 0.02)
    margin_y = int((bottom - top) * 0.02)
    left = max(0, left - margin_x)
    top = max(0, top - margin_y)
    right = min(w, right + margin_x)
    bottom = min(h, bottom + margin_y)

    cropped = img.crop((left, top, right, bottom))

    cw, ch = cropped.size
    if cw < 800:
        scale = max(800 / cw, 2.0)
        new_w, new_h = int(cw * scale), int(ch * scale)
        cropped = cropped.resize((new_w, new_h), Image.LANCZOS)

    abs_out = os.path.abspath(output_path)
    cropped.save(abs_out, "PNG", quality=95)
    final_w, final_h = cropped.size
    print(f"[OK] Cropped {input_path} -> {abs_out} ({final_w}x{final_h})", file=sys.stderr)
    return {"path": abs_out, "width": final_w, "height": final_h}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="이미지 크롭")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--coords", required=True, help="x1,y1,x2,y2 (0.0~1.0)")
    args = parser.parse_args()

    coords = [float(c) for c in args.coords.split(",")]
    if len(coords) != 4:
        print("coords must be 4 floats", file=sys.stderr)
        sys.exit(1)

    crop_image(args.input, args.output, coords)
