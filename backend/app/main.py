"""API REST do Sistema de Registro de Ponto com Reconhecimento Facial.

Execute (dentro da pasta backend/):
    uvicorn app.main:app --reload --port 8000
Documentação interativa: http://localhost:8000/docs
"""
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
import csv
import io
import logging
import os

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from . import config, ponto, recognition, security, storage
from .database import criar_tabelas, get_db
from .models import Funcionario, RegistroPonto, TipoRegistro
from .schemas import (DashboardOut, FuncionarioCreate, FuncionarioOut, FuncionarioUpdate,
                      ImagemIn, LoginIn, ReconhecimentoOut, RegistroOut, RegistroPontoIn,
                      TokenOut)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    criar_tabelas()
    if os.getenv("WARMUP_MODELO", "1") == "1":
        recognition.carregar_modelo_em_segundo_plano()
    if config.ADMIN_PASSWORD == "admin123":
        logger.warning("Usando a senha padrão do administrador. Altere ADMIN_PASSWORD no arquivo .env")
    yield


app = FastAPI(
    title="Sistema de Ponto com Reconhecimento Facial",
    version="1.0.0",
    description="API REST (FastAPI + SQLite + DeepFace) para registro de ponto por reconhecimento facial.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def cabecalhos_seguranca(request: Request, call_next):
    resposta = await call_next(request)
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    resposta.headers["X-Frame-Options"] = "DENY"
    resposta.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        resposta.headers["Cache-Control"] = "no-store"  # não guarda dados/fotos em cache
    return resposta


# ---------------------------------------------------------------------------
# Tratamento de erros padronizado: {"detail": "...", "codigo": "..."}
# ---------------------------------------------------------------------------
@app.exception_handler(recognition.FaceError)
async def _face_error(_: Request, exc: recognition.FaceError):
    return JSONResponse(status_code=422, content={"detail": exc.mensagem, "codigo": exc.codigo})


@app.exception_handler(ponto.RegraPontoError)
async def _regra_error(_: Request, exc: ponto.RegraPontoError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.mensagem, "codigo": "REGRA_PONTO"})


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    erros = []
    for e in exc.errors():
        campo = ".".join(str(p) for p in e.get("loc", []) if p != "body")
        msg = str(e.get("msg", "")).removeprefix("Value error, ")
        erros.append({"campo": campo, "mensagem": msg})
    resumo = "; ".join(f"{e['campo']}: {e['mensagem']}" for e in erros)
    return JSONResponse(status_code=422, content={"detail": f"Dados inválidos — {resumo}",
                                                  "codigo": "VALIDACAO", "erros": erros})


@app.exception_handler(Exception)
async def _erro_inesperado(_: Request, exc: Exception):
    logger.exception("Erro inesperado: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Erro interno no servidor.", "codigo": "ERRO_INTERNO"})


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------
def _buscar_funcionario(db: Session, funcionario_id: int) -> Funcionario:
    f = db.get(Funcionario, funcionario_id)
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funcionário não encontrado.")
    return f


def _funcionario_out(db: Session, f: Funcionario) -> FuncionarioOut:
    total = db.scalar(select(func.count()).select_from(RegistroPonto)
                      .where(RegistroPonto.funcionario_id == f.id)) or 0
    return FuncionarioOut(id=f.id, nome=f.nome, matricula=f.matricula, cargo=f.cargo,
                          data_cadastro=f.data_cadastro, total_registros=total)


def _candidatos(db: Session, excluir_id: int | None = None):
    linhas = db.execute(select(Funcionario.id, Funcionario.embedding, Funcionario.modelo_embedding)).all()
    return [(fid, recognition.bytes_para_embedding(emb)) for fid, emb, modelo in linhas
            if fid != excluir_id and modelo == config.MODEL_NAME]


def _verificar_rosto_duplicado(db: Session, embedding, excluir_id: int | None = None):
    resultado = recognition.identificar(embedding, _candidatos(db, excluir_id))
    if resultado.funcionario_id is not None:
        existente = db.get(Funcionario, resultado.funcionario_id)
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Este rosto já está cadastrado para o funcionário de matrícula "
                            f"{existente.matricula}. Cada pessoa só pode ter um cadastro.")


def _matricula_em_uso(db: Session, matricula: str, excluir_id: int | None = None) -> bool:
    q = select(Funcionario.id).where(Funcionario.matricula == matricula)
    if excluir_id is not None:
        q = q.where(Funcionario.id != excluir_id)
    return db.scalar(q) is not None


def _consulta_registros(funcionario_id=None, matricula=None, tipo=None, data_inicio=None, data_fim=None):
    q = select(RegistroPonto).join(RegistroPonto.funcionario).options(joinedload(RegistroPonto.funcionario))
    if funcionario_id is not None:
        q = q.where(RegistroPonto.funcionario_id == funcionario_id)
    if matricula:
        q = q.where(Funcionario.matricula.ilike(f"%{matricula.strip()}%"))
    if tipo is not None:
        q = q.where(RegistroPonto.tipo == tipo)
    if data_inicio is not None:
        q = q.where(RegistroPonto.data >= data_inicio)
    if data_fim is not None:
        q = q.where(RegistroPonto.data <= data_fim)
    return q


# ---------------------------------------------------------------------------
# Status e autenticação
# ---------------------------------------------------------------------------
@app.get("/api/status", tags=["Sistema"])
def status_api():
    return {"api": "online", "horario_servidor": datetime.now().isoformat(timespec="seconds"),
            "reconhecimento": recognition.status_modelo(),
            "permitir_foto_arquivo": config.PERMITIR_FOTO_ARQUIVO,
            "validade_reconhecimento_segundos": config.TOKEN_RECONHECIMENTO_SEGUNDOS}


@app.post("/api/auth/login", response_model=TokenOut, tags=["Autenticação"],
          dependencies=[Depends(security.limite_login)])
def login(dados: LoginIn):
    if not security.verificar_credenciais(dados.usuario, dados.senha):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário ou senha inválidos.")
    return TokenOut(access_token=security.criar_token_sessao(dados.usuario),
                    expira_em_minutos=config.TOKEN_EXPIRA_MINUTOS, usuario=dados.usuario)


@app.get("/api/auth/me", tags=["Autenticação"])
def me(usuario: str = Depends(security.usuario_atual)):
    return {"usuario": usuario}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@app.get("/api/dashboard", response_model=DashboardOut, tags=["Dashboard"])
def dashboard(db: Session = Depends(get_db), _: str = Depends(security.usuario_atual)):
    hoje = date.today()
    total_func = db.scalar(select(func.count()).select_from(Funcionario)) or 0
    total_reg = db.scalar(select(func.count()).select_from(RegistroPonto)) or 0
    reg_hoje = list(db.scalars(select(RegistroPonto).where(RegistroPonto.data == hoje)
                               .order_by(RegistroPonto.horario, RegistroPonto.id)))
    ultimo_por_func: dict[int, TipoRegistro] = {}
    for r in reg_hoje:
        ultimo_por_func[r.funcionario_id] = r.tipo
    presentes = sum(1 for t in ultimo_por_func.values()
                    if t in (TipoRegistro.ENTRADA, TipoRegistro.RETORNO_INTERVALO))
    intervalo = sum(1 for t in ultimo_por_func.values() if t == TipoRegistro.SAIDA_INTERVALO)

    ultimos = db.scalars(select(RegistroPonto).options(joinedload(RegistroPonto.funcionario))
                         .order_by(RegistroPonto.data.desc(), RegistroPonto.horario.desc(),
                                   RegistroPonto.id.desc()).limit(8))
    inicio = hoje - timedelta(days=6)
    contagem = dict(db.execute(select(RegistroPonto.data, func.count())
                               .where(RegistroPonto.data >= inicio)
                               .group_by(RegistroPonto.data)).all())
    por_dia = [{"data": (inicio + timedelta(days=i)).isoformat(),
                "total": contagem.get(inicio + timedelta(days=i), 0)} for i in range(7)]
    return DashboardOut(total_funcionarios=total_func, total_registros=total_reg,
                        registros_hoje=len(reg_hoje), presentes_agora=presentes, em_intervalo=intervalo,
                        ultimos_registros=[ponto.para_saida(r) for r in ultimos],
                        registros_por_dia=por_dia)


# ---------------------------------------------------------------------------
# Funcionários (CRUD)
# ---------------------------------------------------------------------------
@app.post("/api/funcionarios", response_model=FuncionarioOut, status_code=201, tags=["Funcionários"])
def cadastrar_funcionario(dados: FuncionarioCreate, db: Session = Depends(get_db),
                          _: str = Depends(security.usuario_atual)):
    if _matricula_em_uso(db, dados.matricula):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A matrícula {dados.matricula} já está cadastrada.")

    img = recognition.decodificar_imagem(dados.foto)
    rosto = recognition.analisar_rosto(img)          # DeepFace: detecção + embedding
    _verificar_rosto_duplicado(db, rosto.embedding)  # mesma pessoa com 2 matrículas

    nome_foto = storage.salvar_foto(img)
    f = Funcionario(nome=dados.nome, matricula=dados.matricula, cargo=dados.cargo,
                    foto_path=nome_foto, data_cadastro=datetime.now().replace(microsecond=0),
                    embedding=recognition.embedding_para_bytes(rosto.embedding),
                    modelo_embedding=config.MODEL_NAME)
    db.add(f)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        storage.remover_foto(nome_foto)
        raise HTTPException(status.HTTP_409_CONFLICT, "Matrícula já cadastrada.")
    db.refresh(f)
    logger.info("Funcionário cadastrado: id=%s matrícula=%s", f.id, f.matricula)
    return _funcionario_out(db, f)


@app.get("/api/funcionarios", response_model=list[FuncionarioOut], tags=["Funcionários"])
def listar_funcionarios(busca: str | None = Query(None, max_length=100), db: Session = Depends(get_db),
                        _: str = Depends(security.usuario_atual)):
    q = select(Funcionario).order_by(Funcionario.nome)
    if busca:
        termo = f"%{busca.strip()}%"
        q = q.where(Funcionario.nome.ilike(termo) | Funcionario.matricula.ilike(termo)
                    | Funcionario.cargo.ilike(termo))
    return [_funcionario_out(db, f) for f in db.scalars(q)]


@app.get("/api/funcionarios/{funcionario_id}", response_model=FuncionarioOut, tags=["Funcionários"])
def consultar_funcionario(funcionario_id: int, db: Session = Depends(get_db),
                          _: str = Depends(security.usuario_atual)):
    return _funcionario_out(db, _buscar_funcionario(db, funcionario_id))


@app.put("/api/funcionarios/{funcionario_id}", response_model=FuncionarioOut, tags=["Funcionários"])
def atualizar_funcionario(funcionario_id: int, dados: FuncionarioUpdate, db: Session = Depends(get_db),
                          _: str = Depends(security.usuario_atual)):
    f = _buscar_funcionario(db, funcionario_id)
    if dados.matricula and _matricula_em_uso(db, dados.matricula, excluir_id=f.id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A matrícula {dados.matricula} já está em uso.")

    foto_antiga = None
    if dados.foto:
        img = recognition.decodificar_imagem(dados.foto)
        rosto = recognition.analisar_rosto(img)
        _verificar_rosto_duplicado(db, rosto.embedding, excluir_id=f.id)
        foto_antiga = f.foto_path
        f.foto_path = storage.salvar_foto(img)
        f.embedding = recognition.embedding_para_bytes(rosto.embedding)
        f.modelo_embedding = config.MODEL_NAME
    for campo in ("nome", "matricula", "cargo"):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(f, campo, valor)
    db.commit()
    storage.remover_foto(foto_antiga)
    db.refresh(f)
    return _funcionario_out(db, f)


@app.delete("/api/funcionarios/{funcionario_id}", tags=["Funcionários"])
def excluir_funcionario(funcionario_id: int, db: Session = Depends(get_db),
                        _: str = Depends(security.usuario_atual)):
    f = _buscar_funcionario(db, funcionario_id)
    foto = f.foto_path
    db.delete(f)  # ON DELETE CASCADE remove também os registros de ponto
    db.commit()
    storage.remover_foto(foto)  # elimina o dado biométrico do disco (LGPD)
    return {"mensagem": "Funcionário, fotografia e registros excluídos com sucesso."}


@app.get("/api/funcionarios/{funcionario_id}/foto", tags=["Funcionários"],
         response_class=FileResponse)
def foto_funcionario(funcionario_id: int, db: Session = Depends(get_db),
                     _: str = Depends(security.usuario_atual)):
    f = _buscar_funcionario(db, funcionario_id)
    caminho = storage.caminho_foto(f.foto_path)
    if not caminho.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fotografia não encontrada.")
    return FileResponse(caminho, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/funcionarios/{funcionario_id}/registros", response_model=list[RegistroOut],
         tags=["Registros de ponto"])
def registros_do_funcionario(funcionario_id: int, data_inicio: date | None = None,
                             data_fim: date | None = None, db: Session = Depends(get_db),
                             _: str = Depends(security.usuario_atual)):
    _buscar_funcionario(db, funcionario_id)
    q = _consulta_registros(funcionario_id=funcionario_id, data_inicio=data_inicio, data_fim=data_fim)
    q = q.order_by(RegistroPonto.data.desc(), RegistroPonto.horario.desc())
    return [ponto.para_saida(r) for r in db.scalars(q)]


# ---------------------------------------------------------------------------
# Reconhecimento facial e registro de ponto
# ---------------------------------------------------------------------------
@app.post("/api/reconhecimento", response_model=ReconhecimentoOut, tags=["Reconhecimento facial"],
          dependencies=[Depends(security.limite_reconhecimento)])
def reconhecer(dados: ImagemIn, db: Session = Depends(get_db), _: str = Depends(security.usuario_atual)):
    if dados.origem == "arquivo" and not config.PERMITIR_FOTO_ARQUIVO:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "O reconhecimento por foto enviada está desativado. Use a câmera ao vivo.")
    img = recognition.decodificar_imagem(dados.imagem)
    rosto = recognition.analisar_rosto(img)
    resultado = recognition.identificar(rosto.embedding, _candidatos(db))

    if resultado.funcionario_id is None:
        logger.info("Reconhecimento recusado (distância=%s): %s", resultado.distancia, resultado.motivo)
        return ReconhecimentoOut(reconhecido=False, mensagem=resultado.motivo or "Não reconhecido.",
                                 distancia=resultado.distancia, limite=resultado.limite,
                                 confianca=resultado.confianca)

    f = db.get(Funcionario, resultado.funcionario_id)
    hoje = ponto.registros_do_dia(db, f.id, date.today())
    logger.info("Reconhecido: matrícula=%s distância=%.4f origem=%s", f.matricula, resultado.distancia,
                dados.origem)
    return ReconhecimentoOut(
        reconhecido=True, mensagem=f"Funcionário identificado: {f.nome}",
        funcionario=_funcionario_out(db, f), distancia=resultado.distancia, limite=resultado.limite,
        confianca=resultado.confianca,
        token_registro=security.criar_token_reconhecimento(f.id, resultado.distancia, dados.origem),
        origem=dados.origem,
        proximos_tipos=ponto.proximos_tipos(hoje),
        registros_hoje=[ponto.para_saida(r) for r in hoje])


@app.post("/api/ponto", response_model=RegistroOut, status_code=201, tags=["Registros de ponto"])
def registrar_ponto(dados: RegistroPontoIn, db: Session = Depends(get_db),
                    _: str = Depends(security.usuario_atual)):
    token = security.decodificar(dados.token_registro, "reconhecimento")
    f = _buscar_funcionario(db, int(token["sub"]))
    agora = datetime.now().replace(microsecond=0)
    # valida a regra antes de "gastar" o token, para o usuário poder escolher outro tipo
    ponto.validar(db, f, dados.tipo, agora)
    security.consumir_token_reconhecimento(dados.token_registro)  # token de uso único
    try:
        registro = ponto.registrar(db, f, dados.tipo, token.get("dist"), agora,
                                  origem=token.get("orig", "camera"))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Registro duplicado.")
    logger.info("Ponto registrado: matrícula=%s tipo=%s", f.matricula, dados.tipo.value)
    return ponto.para_saida(registro)


@app.get("/api/registros", tags=["Registros de ponto"])
def historico(funcionario_id: int | None = None, matricula: str | None = Query(None, max_length=20),
              tipo: TipoRegistro | None = None, data_inicio: date | None = None,
              data_fim: date | None = None, limite: int = Query(50, ge=1, le=500),
              pagina: int = Query(1, ge=1), db: Session = Depends(get_db),
              _: str = Depends(security.usuario_atual)):
    if data_inicio and data_fim and data_inicio > data_fim:
        raise HTTPException(422, "A data inicial não pode ser posterior à data final.")
    q = _consulta_registros(funcionario_id, matricula, tipo, data_inicio, data_fim)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    itens = db.scalars(q.order_by(RegistroPonto.data.desc(), RegistroPonto.horario.desc(),
                                  RegistroPonto.id.desc())
                       .offset((pagina - 1) * limite).limit(limite)).unique()
    return {"total": total, "pagina": pagina, "limite": limite,
            "itens": [RegistroOut(**ponto.para_saida(r)) for r in itens]}


@app.get("/api/registros/exportar", tags=["Registros de ponto"])
def exportar_csv(funcionario_id: int | None = None, matricula: str | None = Query(None, max_length=20),
                 tipo: TipoRegistro | None = None, data_inicio: date | None = None,
                 data_fim: date | None = None, db: Session = Depends(get_db),
                 _: str = Depends(security.usuario_atual)):
    q = _consulta_registros(funcionario_id, matricula, tipo, data_inicio, data_fim)
    q = q.order_by(RegistroPonto.data, RegistroPonto.horario)
    saida = io.StringIO()
    w = csv.writer(saida, delimiter=";")
    w.writerow(["Data", "Horário", "Matrícula", "Nome", "Cargo", "Tipo", "Origem"])
    for r in db.scalars(q).unique():
        w.writerow([r.data.strftime("%d/%m/%Y"), r.horario.strftime("%H:%M:%S"), r.funcionario.matricula,
                    r.funcionario.nome, r.funcionario.cargo, ponto.DESCRICOES[r.tipo],
                    "Foto enviada" if r.origem == "arquivo" else "Câmera"])
    conteudo = "﻿" + saida.getvalue()  # BOM para o Excel reconhecer UTF-8
    return StreamingResponse(iter([conteudo]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": "attachment; filename=registros_ponto.csv"})
