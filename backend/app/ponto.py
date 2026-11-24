"""Regras de negócio do registro de ponto.

Sequência válida em um mesmo dia:

    ENTRADA ──► SAIDA_INTERVALO ──► RETORNO_INTERVALO ──► SAIDA_FINAL
        └───────────────────────────────────────────────►┘
              (é permitido encerrar o dia sem intervalo)

Regras anti-duplicidade:
* cada tipo só pode ocorrer uma vez por dia (validado aqui e por UNIQUE no banco);
* intervalo mínimo entre duas marcações (INTERVALO_MINIMO_SEGUNDOS);
* após SAIDA_FINAL nenhum novo registro é aceito no dia.
"""
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .models import Funcionario, RegistroPonto, TipoRegistro

DESCRICOES = {
    TipoRegistro.ENTRADA: "Entrada",
    TipoRegistro.SAIDA_INTERVALO: "Saída para intervalo",
    TipoRegistro.RETORNO_INTERVALO: "Retorno do intervalo",
    TipoRegistro.SAIDA_FINAL: "Saída final",
}

TRANSICOES: dict[TipoRegistro | None, list[TipoRegistro]] = {
    None: [TipoRegistro.ENTRADA],
    TipoRegistro.ENTRADA: [TipoRegistro.SAIDA_INTERVALO, TipoRegistro.SAIDA_FINAL],
    TipoRegistro.SAIDA_INTERVALO: [TipoRegistro.RETORNO_INTERVALO],
    TipoRegistro.RETORNO_INTERVALO: [TipoRegistro.SAIDA_FINAL],
    TipoRegistro.SAIDA_FINAL: [],
}


class RegraPontoError(Exception):
    def __init__(self, mensagem: str, status_code: int = 409):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.status_code = status_code


def registros_do_dia(db: Session, funcionario_id: int, dia: date) -> list[RegistroPonto]:
    return list(db.scalars(
        select(RegistroPonto)
        .where(RegistroPonto.funcionario_id == funcionario_id, RegistroPonto.data == dia)
        .order_by(RegistroPonto.horario, RegistroPonto.id)))


def proximos_tipos(registros: list[RegistroPonto]) -> list[TipoRegistro]:
    ultimo = registros[-1].tipo if registros else None
    return TRANSICOES[ultimo]


def mensagem_sequencia(ultimo: TipoRegistro | None, tipo: TipoRegistro) -> str:
    if ultimo is None:
        return "O primeiro registro do dia deve ser a Entrada."
    if ultimo == TipoRegistro.SAIDA_FINAL:
        return "A saída final de hoje já foi registrada. Não é possível registrar novamente."
    if tipo == ultimo:
        return f"{DESCRICOES[tipo]} já foi registrada(o) hoje."
    permitidos = ", ".join(DESCRICOES[t] for t in TRANSICOES[ultimo])
    return (f"Sequência inválida: após '{DESCRICOES[ultimo]}' só é permitido: {permitidos}.")


def validar(db: Session, funcionario: Funcionario, tipo: TipoRegistro, agora: datetime) -> None:
    """Lança RegraPontoError se o registro não for permitido agora."""
    hoje = agora.date()
    registros = registros_do_dia(db, funcionario.id, hoje)
    ultimo = registros[-1] if registros else None

    if any(r.tipo == tipo for r in registros):
        raise RegraPontoError(f"Registro duplicado: '{DESCRICOES[tipo]}' já foi registrado hoje "
                              f"às {next(r.horario for r in registros if r.tipo == tipo):%H:%M:%S}.")
    if tipo not in proximos_tipos(registros):
        raise RegraPontoError(mensagem_sequencia(ultimo.tipo if ultimo else None, tipo))
    if ultimo is not None:
        decorrido = (agora - datetime.combine(hoje, ultimo.horario)).total_seconds()
        if decorrido < config.INTERVALO_MINIMO_SEGUNDOS:
            espera = int(config.INTERVALO_MINIMO_SEGUNDOS - decorrido)
            raise RegraPontoError(f"Aguarde {espera} segundo(s) antes de um novo registro "
                                  f"(proteção contra registros duplicados).", 429)


def registrar(db: Session, funcionario: Funcionario, tipo: TipoRegistro,
              distancia: float | None = None, agora: datetime | None = None,
              origem: str = "camera") -> RegistroPonto:
    agora = (agora or datetime.now()).replace(microsecond=0)
    hoje = agora.date()
    validar(db, funcionario, tipo, agora)
    registro = RegistroPonto(funcionario_id=funcionario.id, data=hoje, horario=agora.time(),
                             tipo=tipo, distancia=distancia, origem=origem)
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return registro


def para_saida(r: RegistroPonto) -> dict:
    return {
        "id": r.id,
        "funcionario_id": r.funcionario_id,
        "nome": r.funcionario.nome,
        "matricula": r.funcionario.matricula,
        "cargo": r.funcionario.cargo,
        "data": r.data,
        "horario": r.horario,
        "tipo": r.tipo,
        "tipo_descricao": DESCRICOES[r.tipo],
        "origem": r.origem or "camera",
    }
