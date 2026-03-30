import fitz  # PyMuPDF
import os

OUTPUT_DIR = r"C:\Users\7t7st\math-tutor-app\scripts\graph_samples"
os.makedirs(OUTPUT_DIR, exist_ok=True)

BOOKS = [
    (r"c:\Users\7t7st\OneDrive\바탕 화면\수알음\프레젠또\ㄱㄱ인강교재참고\김현우T 스탠다드 미적분 문제집 01.pdf", "standard", [4, 8, 12, 20]),
    (r"c:\Users\7t7st\OneDrive\바탕 화면\수알음\프레젠또\ㄱㄱ인강교재참고\2026학년도 배성민 피지컬N제 수학Ⅰ 본문.pdf", "physical", [3, 8, 15, 25]),
    (r"c:\Users\7t7st\OneDrive\바탕 화면\수알음\프레젠또\ㄱㄱ인강교재참고\2026학년도 한석원 4의규칙 시즌1 수학Ⅰ 본문.pdf", "rule4", [3, 8, 15, 25]),
    (r"c:\Users\7t7st\OneDrive\바탕 화면\수알음\프레젠또\ㄱㄱ인강교재참고\2026 정승제 기출끝 ( 수1, 수2, 확통) - 문제.pdf", "gichul", [5, 10, 20, 30]),
    (r"c:\Users\7t7st\OneDrive\바탕 화면\수알음\프레젠또\ㄱㄱ인강교재참고\2026 수학 이정환 미적분(상) 1주 chapter1.pdf", "lee_calc", [3, 8, 15, 20]),
    (r"c:\Users\7t7st\OneDrive\바탕 화면\수알음\프레젠또\ㄱㄱ인강교재참고\2026학년도 이미지 N티켓 시즌1 미적분 본문.pdf", "nticket", [3, 8, 15, 25]),
    (r"c:\Users\7t7st\OneDrive\바탕 화면\수알음\프레젠또\ㄱㄱ인강교재참고\2026년 이해원 시즌1 수학 1 - 문제.pdf", "leehw", [5, 15, 30, 50]),
]

for path, name, pages in BOOKS:
    try:
        doc = fitz.open(path)
        total = len(doc)
        for p in pages:
            if p >= total:
                continue
            page = doc[p]
            pix = page.get_pixmap(dpi=200)
            out = os.path.join(OUTPUT_DIR, f"{name}_p{p:03d}.png")
            pix.save(out)
            print(f"[OK] {out}")
        doc.close()
    except Exception as e:
        print(f"[ERR] {name}: {e}")

print("Done.")
