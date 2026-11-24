"""Tabelas do banco de dados (ORM SQLAlchemy)."""
from datetime import date, datetime, time
import enum

from sqlalchemy import (Date, DateTime, Enum, ForeignKey, Integer, LargeBinary,
                        String, Time, UniqueConstraint, Index)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TipoRegistro(str, enum.Enum):
    ENTRADA = "ENTRADA"
    SAIDA_INTERVALO = "SAIDA_INTERVALO"
    RETORNO_INTERVALO = "RETORNO_INTERVALO"
    SAIDA_FINAL = "SAIDA_FINAL"


class Funcionario(Base):
    __tablename__ = "funcionarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    matricula: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    cargo: Mapped[str] = mapped_column(String(80), nullable=False)
    foto_path: Mapped[str] = mapped_column(String(255), nullable=False)
    data_cadastro: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    # Vetor de características (embedding) gerado pelo DeepFace, em float32.
    # É um dado biométrico: nunca é devolvido pela API.
    embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    modelo_embedding: Mapped[str] = mapped_column(String(40), nullable=False)

    registros: Mapped[list["RegistroPonto"]] = relationship(
        back_populates="funcionario", cascade="all, delete-orphan", passive_deletes=True)


class RegistroPonto(Base):
    __tablename__ = "registros_ponto"
    __table_args__ = (
        # Garante no próprio banco que cada tipo só ocorre uma vez por dia
        UniqueConstraint("funcionario_id", "data", "tipo", name="uq_registro_dia_tipo"),
        Index("ix_registro_data", "data"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    funcionario_id: Mapped[int] = mapped_column(
        ForeignKey("funcionarios.id", ondelete="CASCADE"), nullable=False, index=True)
    data: Mapped[date] = mapped_column(Date, nullable=False)
    horario: Mapped[time] = mapped_column(Time, nullable=False)
    tipo: Mapped[TipoRegistro] = mapped_column(Enum(TipoRegistro), nullable=False)
    distancia: Mapped[float | None] = mapped_column(nullable=True)  # auditoria do reconhecimento
    # "camera" (câmera ao vivo) ou "arquivo" (foto enviada) — auditoria
    origem: Mapped[str] = mapped_column(String(10), nullable=False, default="camera",
                                        server_default="camera")

    funcionario: Mapped[Funcionario] = relationship(back_populates="registros")
