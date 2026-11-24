"""Reconhecimento facial com DeepFace.

Fluxo de uma imagem recebida:
1. decodificar_imagem()   -> valida base64, tamanho, formato (JPEG/PNG) e dimensões
2. verificar_iluminacao() -> recusa imagens muito escuras ou estouradas
3. analisar_rosto()       -> DeepFace.represent() detecta o(s) rosto(s), alinha e gera
                             o embedding (vetor de 512 números do Facenet512).
                             Recusa: nenhum rosto, vários rostos, rosto pequeno,
                             baixa confiança de detecção e rosto desfocado.
4. identificar()          -> compara o embedding com todos os cadastrados usando a
                             métrica de distância do DeepFace e aplica o limite
                             (threshold) + margem de ambiguidade.
"""
from __future__ import annotations

import base64
import binascii
import logging
import os
import threading
from dataclasses import dataclass

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")  # reduz logs do TensorFlow

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from . import config  # noqa: E402

logger = logging.getLogger("recognition")

# O DeepFace/TensorFlow não é seguro para chamadas simultâneas no mesmo modelo.
_lock = threading.Lock()
_modelo_pronto = threading.Event()
_erro_modelo: str | None = None


class FaceError(Exception):
    """Erro de validação biométrica com código legível pelo frontend."""

    def __init__(self, codigo: str, mensagem: str):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem


@dataclass
class RostoAnalisado:
    embedding: np.ndarray
    area: dict
    confianca_deteccao: float
    nitidez: float
    brilho: float


@dataclass
class ResultadoIdentificacao:
    funcionario_id: int | None
    distancia: float | None
    limite: float
    confianca: float | None
    motivo: str | None = None


# ---------------------------------------------------------------------------
# Modelo
# ---------------------------------------------------------------------------
def _deepface():
    from deepface import DeepFace  # import tardio: carregar o TensorFlow é lento
    return DeepFace


def limite_distancia() -> float:
    if config.DISTANCE_THRESHOLD is not None:
        return config.DISTANCE_THRESHOLD
    from deepface.modules import verification
    return float(verification.find_threshold(config.MODEL_NAME, config.DISTANCE_METRIC))


def carregar_modelo() -> None:
    """Carrega (e baixa na primeira vez) os pesos do modelo e o detector."""
    global _erro_modelo
    try:
        DeepFace = _deepface()
        with _lock:
            DeepFace.build_model(config.MODEL_NAME)
            # "Aquece" o pipeline com uma imagem vazia para carregar o detector
            vazio = np.zeros((240, 240, 3), dtype=np.uint8)
            DeepFace.represent(vazio, model_name=config.MODEL_NAME,
                               detector_backend=config.DETECTOR_BACKEND,
                               enforce_detection=False)
        _erro_modelo = None
        _modelo_pronto.set()
        logger.info("Modelo %s pronto (detector=%s, métrica=%s, limite=%.3f)",
                    config.MODEL_NAME, config.DETECTOR_BACKEND,
                    config.DISTANCE_METRIC, limite_distancia())
    except Exception as exc:  # pragma: no cover - depende do ambiente
        _erro_modelo = str(exc)
        logger.exception("Falha ao carregar o modelo DeepFace")


def carregar_modelo_em_segundo_plano() -> None:
    threading.Thread(target=carregar_modelo, daemon=True, name="deepface-warmup").start()


def status_modelo() -> dict:
    return {
        "pronto": _modelo_pronto.is_set(),
        "erro": _erro_modelo,
        "modelo": config.MODEL_NAME,
        "detector": config.DETECTOR_BACKEND,
        "metrica": config.DISTANCE_METRIC,
        "limite": limite_distancia(),
    }


# ---------------------------------------------------------------------------
# Validação da imagem
# ---------------------------------------------------------------------------
_ASSINATURAS = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
}


def decodificar_imagem(dado: str | bytes) -> np.ndarray:
    """Recebe uma data URL / base64 (ou bytes) e devolve a imagem BGR do OpenCV."""
    if isinstance(dado, str):
        texto = dado.strip()
        if texto.startswith("data:"):
            cabecalho, _, texto = texto.partition(",")
            if ";base64" not in cabecalho:
                raise FaceError("IMAGEM_INVALIDA", "A imagem deve estar codificada em base64.")
        if len(texto) > config.MAX_IMAGE_BYTES * 4 // 3 + 4:
            raise FaceError("IMAGEM_GRANDE", "A imagem excede o tamanho máximo permitido (5 MB).")
        try:
            bruto = base64.b64decode(texto, validate=True)
        except (binascii.Error, ValueError):
            raise FaceError("IMAGEM_INVALIDA", "Conteúdo base64 inválido.")
    else:
        bruto = dado

    if not bruto:
        raise FaceError("IMAGEM_INVALIDA", "Nenhuma imagem foi enviada.")
    if len(bruto) > config.MAX_IMAGE_BYTES:
        raise FaceError("IMAGEM_GRANDE", "A imagem excede o tamanho máximo permitido (5 MB).")
    if not any(bruto.startswith(sig) for sig in _ASSINATURAS):
        raise FaceError("FORMATO_INVALIDO", "Formato não suportado. Envie JPEG ou PNG.")

    img = cv2.imdecode(np.frombuffer(bruto, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise FaceError("IMAGEM_INVALIDA", "Não foi possível ler a imagem (arquivo corrompido).")
    altura, largura = img.shape[:2]
    if min(altura, largura) < config.MIN_IMAGE_LADO:
        raise FaceError("IMAGEM_PEQUENA",
                        f"Resolução muito baixa ({largura}x{altura}). Mínimo: {config.MIN_IMAGE_LADO}px.")
    return img


def verificar_iluminacao(img: np.ndarray) -> float:
    brilho = float(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).mean())
    if brilho < config.BRILHO_MINIMO:
        raise FaceError("IMAGEM_ESCURA",
                        "A imagem está muito escura. Melhore a iluminação e tente novamente.")
    if brilho > config.BRILHO_MAXIMO:
        raise FaceError("IMAGEM_CLARA",
                        "A imagem está clara demais (luz estourada). Ajuste a iluminação.")
    return brilho


def medir_nitidez(img: np.ndarray, area: dict) -> float:
    """Variância do Laplaciano na região do rosto (valores baixos = imagem borrada)."""
    x, y, w, h = (max(0, int(area.get(k, 0))) for k in ("x", "y", "w", "h"))
    rosto = img[y:y + h, x:x + w]
    if rosto.size == 0:
        rosto = img
    cinza = cv2.cvtColor(rosto, cv2.COLOR_BGR2GRAY)
    cinza = cv2.resize(cinza, (160, 160))  # normaliza a escala antes de medir
    return float(cv2.Laplacian(cinza, cv2.CV_64F).var())


# ---------------------------------------------------------------------------
# DeepFace
# ---------------------------------------------------------------------------
def analisar_rosto(img: np.ndarray) -> RostoAnalisado:
    """Detecta exatamente um rosto válido e devolve seu embedding."""
    if _erro_modelo:
        raise FaceError("MODELO_INDISPONIVEL", f"Modelo de reconhecimento indisponível: {_erro_modelo}")

    brilho = verificar_iluminacao(img)
    DeepFace = _deepface()
    try:
        with _lock:
            resultados = DeepFace.represent(
                img,
                model_name=config.MODEL_NAME,
                detector_backend=config.DETECTOR_BACKEND,
                enforce_detection=True,   # gera erro se não houver rosto
                align=True,
            )
        _modelo_pronto.set()
    except ValueError as exc:
        logger.info("Nenhum rosto detectado: %s", exc)
        raise FaceError("SEM_ROSTO",
                        "Nenhum rosto foi detectado. Posicione o rosto de frente para a câmera.")

    # Descarta detecções espúrias (muito pequenas ou com baixa confiança)
    validos = []
    for r in resultados:
        area = r.get("facial_area", {})
        conf = float(r.get("face_confidence") or 0.0)
        if min(area.get("w", 0), area.get("h", 0)) >= config.ROSTO_MIN_LADO and \
                conf >= config.CONFIANCA_DETECCAO_MINIMA:
            validos.append(r)

    if len(validos) > 1:
        raise FaceError("VARIOS_ROSTOS",
                        f"Foram detectados {len(validos)} rostos. Apenas uma pessoa deve aparecer na câmera.")
    if not validos:
        maior = max(resultados, key=lambda r: r.get("facial_area", {}).get("w", 0))
        area = maior.get("facial_area", {})
        if min(area.get("w", 0), area.get("h", 0)) < config.ROSTO_MIN_LADO:
            raise FaceError("ROSTO_PEQUENO", "O rosto está muito distante. Aproxime-se da câmera.")
        raise FaceError("SEM_ROSTO", "Não foi possível detectar um rosto com segurança. Tente novamente.")

    escolhido = validos[0]
    area = escolhido["facial_area"]
    nitidez = medir_nitidez(img, area)
    if nitidez < config.NITIDEZ_MINIMA:
        raise FaceError("IMAGEM_DESFOCADA",
                        "A imagem está desfocada. Fique parado e tente novamente.")

    embedding = np.asarray(escolhido["embedding"], dtype=np.float32)
    return RostoAnalisado(embedding=embedding, area={k: int(area[k]) for k in ("x", "y", "w", "h")},
                          confianca_deteccao=float(escolhido.get("face_confidence") or 0.0),
                          nitidez=nitidez, brilho=brilho)


def distancia(a: np.ndarray, b: np.ndarray) -> float:
    from deepface.modules import verification
    return float(verification.find_distance(a, b, config.DISTANCE_METRIC))


def _confianca(dist: float, verificado: bool) -> float:
    try:
        from deepface.modules import verification
        return round(float(verification.find_confidence(
            dist, config.MODEL_NAME, verificado, config.DISTANCE_METRIC)), 1)
    except Exception:  # versões antigas do DeepFace não têm find_confidence
        lim = limite_distancia()
        return round(max(0.0, min(100.0, (1 - dist / (2 * lim)) * 100)), 1)


def identificar(embedding: np.ndarray, candidatos: list[tuple[int, np.ndarray]]) -> ResultadoIdentificacao:
    """Compara 1:N com os funcionários cadastrados.

    O funcionário só é aceito se:
      * a menor distância for <= limite do modelo; e
      * não houver outro funcionário quase tão parecido (margem de ambiguidade).
    """
    lim = limite_distancia()
    if not candidatos:
        return ResultadoIdentificacao(None, None, lim, None, "Nenhum funcionário cadastrado.")

    distancias = sorted(((distancia(embedding, emb), fid) for fid, emb in candidatos))
    melhor_dist, melhor_id = distancias[0]

    if melhor_dist > lim:
        return ResultadoIdentificacao(None, round(melhor_dist, 4), lim, _confianca(melhor_dist, False),
                                      "Funcionário não reconhecido (rosto não cadastrado).")
    if len(distancias) > 1:
        segunda_dist, _ = distancias[1]
        if segunda_dist - melhor_dist < config.MARGEM_AMBIGUIDADE and segunda_dist <= lim:
            return ResultadoIdentificacao(None, round(melhor_dist, 4), lim, None,
                                          "Resultado ambíguo: o rosto é semelhante a mais de um cadastro.")
    return ResultadoIdentificacao(melhor_id, round(melhor_dist, 4), lim, _confianca(melhor_dist, True))


def embedding_para_bytes(emb: np.ndarray) -> bytes:
    return np.asarray(emb, dtype=np.float32).tobytes()


def bytes_para_embedding(dado: bytes) -> np.ndarray:
    return np.frombuffer(dado, dtype=np.float32)
