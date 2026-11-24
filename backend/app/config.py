"""Configurações centrais do backend.

Todos os valores podem ser sobrescritos por variáveis de ambiente ou pelo
arquivo backend/.env (veja .env.example).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # pasta backend/
load_dotenv(BASE_DIR / ".env")


def _env(nome: str, padrao: str) -> str:
    return os.getenv(nome, padrao)


# --- Caminhos -------------------------------------------------------------
DATA_DIR = Path(_env("DATA_DIR", str(BASE_DIR / "data")))
UPLOAD_DIR = Path(_env("UPLOAD_DIR", str(BASE_DIR / "uploads" / "fotos")))
DATABASE_PATH = Path(_env("DATABASE_PATH", str(DATA_DIR / "ponto.db")))

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# --- Segurança ------------------------------------------------------------
# Em produção, troque SECRET_KEY e a senha do administrador no arquivo .env
SECRET_KEY = _env("SECRET_KEY", "troque-esta-chave-em-producao-0123456789abcdef")
ADMIN_USERNAME = _env("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = _env("ADMIN_PASSWORD", "admin123")
TOKEN_EXPIRA_MINUTOS = int(_env("TOKEN_EXPIRA_MINUTOS", "480"))  # sessão de 8 h
# Token emitido após o reconhecimento facial; precisa ser usado para registrar o ponto
TOKEN_RECONHECIMENTO_SEGUNDOS = int(_env("TOKEN_RECONHECIMENTO_SEGUNDOS", "90"))

CORS_ORIGINS = [o.strip() for o in _env(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# --- Reconhecimento facial (DeepFace) ------------------------------------
# Modelo de reconhecimento: Facenet512 tem ótima precisão e é leve o bastante para CPU.
MODEL_NAME = _env("MODEL_NAME", "Facenet512")
# Detector: "opencv" não exige downloads extras; "retinaface"/"mtcnn" são mais precisos.
DETECTOR_BACKEND = _env("DETECTOR_BACKEND", "opencv")
DISTANCE_METRIC = _env("DISTANCE_METRIC", "cosine")
# Limite de distância. Vazio = usa o limite oficial do DeepFace para o par modelo/métrica
# (Facenet512 + cosine = 0.30). Valores menores = mais rigoroso.
_limite = _env("DISTANCE_THRESHOLD", "")
DISTANCE_THRESHOLD = float(_limite) if _limite else None
# Se o 2º funcionário mais parecido estiver a menos desta diferença do 1º, o
# resultado é considerado ambíguo e recusado (evita identificação incorreta).
MARGEM_AMBIGUIDADE = float(_env("MARGEM_AMBIGUIDADE", "0.05"))

# --- Qualidade da imagem -------------------------------------------------
MAX_IMAGE_BYTES = int(_env("MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))  # 5 MB
MIN_IMAGE_LADO = int(_env("MIN_IMAGE_LADO", "240"))  # px
BRILHO_MINIMO = float(_env("BRILHO_MINIMO", "60"))     # média de cinza (0-255)
BRILHO_MAXIMO = float(_env("BRILHO_MAXIMO", "230"))
NITIDEZ_MINIMA = float(_env("NITIDEZ_MINIMA", "25"))   # variância do Laplaciano no rosto
CONFIANCA_DETECCAO_MINIMA = float(_env("CONFIANCA_DETECCAO_MINIMA", "0.80"))
ROSTO_MIN_LADO = int(_env("ROSTO_MIN_LADO", "80"))     # px

# --- Origem da imagem ----------------------------------------------------
# Permite reconhecer a partir de uma FOTO ENVIADA (arquivo/galeria do celular), além
# da câmera ao vivo. Prático para demonstração, porém menos seguro: alguém poderia
# usar uma foto de outra pessoa. Cada registro guarda a origem para auditoria.
PERMITIR_FOTO_ARQUIVO = _env("PERMITIR_FOTO_ARQUIVO", "true").lower() in ("1", "true", "sim", "yes")

# --- Regras do ponto -----------------------------------------------------
# Intervalo mínimo entre duas marcações do mesmo funcionário (evita clique duplo)
INTERVALO_MINIMO_SEGUNDOS = int(_env("INTERVALO_MINIMO_SEGUNDOS", "60"))
