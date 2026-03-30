"""모든 테스트 GraphSpec을 렌더링하여 PNG로 출력."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from graph_generator import generate_graph

def main():
    samples_path = os.path.join(os.path.dirname(__file__), "test_graph_samples.json")
    output_dir = os.path.join(os.path.dirname(__file__), "test_output")
    os.makedirs(output_dir, exist_ok=True)

    with open(samples_path, "r", encoding="utf-8") as f:
        samples = json.load(f)

    for name, spec in samples.items():
        desc = spec.pop("description", "")
        out_path = os.path.join(output_dir, f"{name}.png")
        try:
            result = generate_graph(spec, out_path, dpi=200)
            print(f"[OK] {name}: {result['width_px']}x{result['height_px']}px -> {out_path}")
        except Exception as e:
            print(f"[FAIL] {name}: {e}")

    print(f"\nAll outputs in: {output_dir}")

if __name__ == "__main__":
    main()
