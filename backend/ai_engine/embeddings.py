from __future__ import annotations

import numpy as np
import open_clip
import torch
from PIL import Image

from ai_engine.config import SETTINGS

_model = None
_preprocess = None


def _load() -> tuple:
    global _model, _preprocess
    if _model is None:
        _model, _, _preprocess = open_clip.create_model_and_transforms(
            SETTINGS.clip_model_name, pretrained=SETTINGS.clip_pretrained
        )
        _model.eval()
    return _model, _preprocess


def warm_up() -> None:
    _load()


def embed_garment(image: Image.Image) -> np.ndarray:
    model, preprocess = _load()
    tensor = preprocess(image).unsqueeze(0)
    with torch.no_grad():
        features = model.encode_image(tensor)
        features = features / features.norm(dim=-1, keepdim=True)
    return features.squeeze(0).cpu().numpy()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))
