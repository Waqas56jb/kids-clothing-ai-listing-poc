"""Run the full AI pipeline over a folder of images.

Usage:
    python scripts/run_pipeline.py --input sample_images --output outputs/run1
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_engine.pipeline import run_pipeline  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("sample_images"))
    parser.add_argument("--output", type=Path, default=Path("outputs/run1"))
    args = parser.parse_args()

    result = run_pipeline(args.input, args.output)

    print(f"\n{result.total_images} images -> {result.total_detections} detections -> {len(result.garments)} garments")
    for note in result.notes:
        print(f"NOTE: {note}")
    for garment in result.garments:
        print(
            f"  {garment.id}: {garment.category} | brand={garment.brand} size={garment.size} "
            f"color={garment.color} gender={garment.gender} condition={garment.condition} "
            f"defects={garment.defects} | images={garment.images} "
            f"| match={garment.match_confidence} ({garment.match_status.value})"
        )
    print(f"\nFull result written to {args.output / 'result.json'}")


if __name__ == "__main__":
    main()
