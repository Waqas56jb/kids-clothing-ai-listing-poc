"""Pre-fetch and cache every model weight the pipeline needs.

Run this once after installing requirements.txt:

    python scripts/download_models.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_engine import detection, embeddings, segmentation  # noqa: E402


def main() -> None:
    print("Downloading clothing detection weights (YOLO)...")
    detection.get_model()
    print("Downloading SAM2 segmentation checkpoint...")
    segmentation.get_model()
    print("Downloading CLIP embedding weights...")
    embeddings.warm_up()
    print("All models cached.")


if __name__ == "__main__":
    main()
