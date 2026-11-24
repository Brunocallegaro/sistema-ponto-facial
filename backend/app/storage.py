"""Armazenamento das fotografias faciais.

* As fotos ficam em backend/uploads/fotos/, com nome aleatório (UUID) — o nome do
  arquivo não revela quem é a pessoa.
* A pasta NÃO é publicada como arquivo estático; a foto só é entregue pelo endpoint
  autenticado GET /api/funcionarios/{id}/foto.
* A imagem é re-codificada em JPEG, o que remove metadados (EXIF, localização etc.).
"""
from pathlib import Path
import uuid

import cv2
import numpy as np

from .config import UPLOAD_DIR


def salvar_foto(img: np.ndarray) -> str:
    nome = f"{uuid.uuid4().hex}.jpg"
    destino = UPLOAD_DIR / nome
    ok, buffer = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        raise IOError("Falha ao codificar a fotografia.")
    destino.write_bytes(buffer.tobytes())
    return nome  # guardamos apenas o nome relativo no banco


def caminho_foto(nome: str) -> Path:
    caminho = (UPLOAD_DIR / Path(nome).name).resolve()
    if caminho.parent != UPLOAD_DIR.resolve():  # impede path traversal
        raise ValueError("Caminho de foto inválido.")
    return caminho


def remover_foto(nome: str | None) -> None:
    if not nome:
        return
    try:
        caminho_foto(nome).unlink(missing_ok=True)
    except ValueError:
        pass
