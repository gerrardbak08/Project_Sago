"""
enrich_leaves.py - 리프 노드 규칙 고도화 결과를 JSON으로 저장

Usage:
    python scripts/enrich_leaves.py

출력:
    models/cust/leaf_enriched.json
    models/emp/leaf_enriched.json
"""

import json
import sys
from pathlib import Path

# 프로젝트 루트를 path에 추가
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.rule_enrichment import enrich_all_leaves


def main():
    for model_type in ["cust", "emp"]:
        input_path = ROOT / "models" / model_type / "leaf_type_counts.json"
        output_path = ROOT / "models" / model_type / "leaf_enriched.json"

        if not input_path.exists():
            print(f"[SKIP] {input_path} 없음")
            continue

        with open(input_path, "r", encoding="utf-8") as f:
            leaf_type_counts = json.load(f)

        enriched = enrich_all_leaves(leaf_type_counts)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(enriched, f, ensure_ascii=False, indent=2)

        print(f"[OK] {output_path} 생성 완료 ({len(enriched)}개 리프)")


if __name__ == "__main__":
    main()
