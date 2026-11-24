"""Esquemas Pydantic: validação de entrada e formato das respostas da API."""
from datetime import date, datetime, time
from typing import Literal
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import TipoRegistro

_RE_MATRICULA = re.compile(r"^[A-Za-z0-9._-]{3,20}$")
_RE_NOME = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$")


def _limpar(valor: str) -> str:
    return re.sub(r"\s+", " ", valor or "").strip()


def validar_nome(v: str) -> str:
    v = _limpar(v)
    if len(v) < 3 or len(v) > 120 or not _RE_NOME.match(v):
        raise ValueError("Nome deve conter apenas letras e espaços (3 a 120 caracteres).")
    if len(v.split(" ")) < 2:
        raise ValueError("Informe o nome completo (nome e sobrenome).")
    return v


def validar_matricula(v: str) -> str:
    v = _limpar(v).upper()
    if not _RE_MATRICULA.match(v):
        raise ValueError("Matrícula deve ter de 3 a 20 caracteres (letras, números, '.', '-' ou '_').")
    return v


def validar_cargo(v: str) -> str:
    v = _limpar(v)
    if len(v) < 2 or len(v) > 80:
        raise ValueError("Cargo deve ter entre 2 e 80 caracteres.")
    return v


class FuncionarioBase(BaseModel):
    nome: str = Field(..., max_length=200)
    matricula: str = Field(..., max_length=40)
    cargo: str = Field(..., max_length=160)

    _v_nome = field_validator("nome")(lambda cls, v: validar_nome(v))
    _v_mat = field_validator("matricula")(lambda cls, v: validar_matricula(v))
    _v_cargo = field_validator("cargo")(lambda cls, v: validar_cargo(v))


class FuncionarioCreate(FuncionarioBase):
    foto: str = Field(..., description="Imagem capturada pela webcam (data URL base64)")


class FuncionarioUpdate(BaseModel):
    nome: str | None = Field(None, max_length=200)
    matricula: str | None = Field(None, max_length=40)
    cargo: str | None = Field(None, max_length=160)
    foto: str | None = Field(None, description="Nova foto (opcional) em data URL base64")

    _v_nome = field_validator("nome")(lambda cls, v: None if v is None else validar_nome(v))
    _v_mat = field_validator("matricula")(lambda cls, v: None if v is None else validar_matricula(v))
    _v_cargo = field_validator("cargo")(lambda cls, v: None if v is None else validar_cargo(v))


class FuncionarioOut(BaseModel):
    """Dados públicos do funcionário. O embedding biométrico e o caminho da foto
    no disco NUNCA são expostos."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    matricula: str
    cargo: str
    data_cadastro: datetime
    total_registros: int = 0


class RegistroOut(BaseModel):
    id: int
    funcionario_id: int
    nome: str
    matricula: str
    cargo: str
    data: date
    horario: time
    tipo: TipoRegistro
    tipo_descricao: str
    origem: str = "camera"


class ImagemIn(BaseModel):
    imagem: str = Field(..., description="Imagem (data URL base64) da câmera ou de uma foto enviada")
    origem: Literal["camera", "arquivo"] = Field(
        "camera", description="camera = câmera ao vivo; arquivo = foto enviada (galeria/arquivo)")


class ReconhecimentoOut(BaseModel):
    reconhecido: bool
    mensagem: str
    funcionario: FuncionarioOut | None = None
    distancia: float | None = None
    limite: float
    confianca: float | None = None
    token_registro: str | None = None
    origem: str = "camera"
    proximos_tipos: list[TipoRegistro] = []
    registros_hoje: list[RegistroOut] = []


class RegistroPontoIn(BaseModel):
    token_registro: str = Field(..., min_length=10)
    tipo: TipoRegistro


class LoginIn(BaseModel):
    usuario: str = Field(..., min_length=1, max_length=50)
    senha: str = Field(..., min_length=1, max_length=100)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expira_em_minutos: int
    usuario: str


class DashboardOut(BaseModel):
    total_funcionarios: int
    total_registros: int
    registros_hoje: int
    presentes_agora: int
    em_intervalo: int
    ultimos_registros: list[RegistroOut]
    registros_por_dia: list[dict]
