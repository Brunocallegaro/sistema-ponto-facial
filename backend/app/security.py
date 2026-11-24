"""Autenticação do administrador e tokens de reconhecimento.

* Token de sessão (JWT, 8 h): protege TODOS os endpoints de dados.
* Token de reconhecimento (JWT, 90 s): emitido somente quando o DeepFace identifica
  um funcionário. O endpoint de registro de ponto exige esse token, então não é
  possível bater o ponto de alguém apenas enviando o ID dele.
"""
from datetime import datetime, timedelta, timezone
import hmac
import secrets
import time
from collections import defaultdict, deque

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import config

ALGORITMO = "HS256"
_bearer = HTTPBearer(auto_error=False)


def verificar_credenciais(usuario: str, senha: str) -> bool:
    ok_user = hmac.compare_digest(usuario.encode(), config.ADMIN_USERNAME.encode())
    ok_pass = hmac.compare_digest(senha.encode(), config.ADMIN_PASSWORD.encode())
    return ok_user and ok_pass


def _emitir(payload: dict, segundos: int) -> str:
    agora = datetime.now(timezone.utc)
    dados = {**payload, "iat": agora, "exp": agora + timedelta(seconds=segundos),
             "jti": secrets.token_hex(8)}
    return jwt.encode(dados, config.SECRET_KEY, algorithm=ALGORITMO)


def criar_token_sessao(usuario: str) -> str:
    return _emitir({"sub": usuario, "tipo": "sessao"}, config.TOKEN_EXPIRA_MINUTOS * 60)


def criar_token_reconhecimento(funcionario_id: int, distancia: float, origem: str = "camera") -> str:
    return _emitir({"sub": str(funcionario_id), "tipo": "reconhecimento", "dist": distancia,
                    "orig": origem},
                   config.TOKEN_RECONHECIMENTO_SEGUNDOS)


def decodificar(token: str, tipo: str) -> dict:
    # Token de sessão inválido -> 401 (o frontend volta ao login).
    # Token de reconhecimento inválido -> 409/400 (só pede um novo reconhecimento).
    sessao = tipo == "sessao"
    try:
        dados = jwt.decode(token, config.SECRET_KEY, algorithms=[ALGORITMO])
    except jwt.ExpiredSignatureError:
        if sessao:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão expirada. Entre novamente.")
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "O reconhecimento expirou. Faça o reconhecimento facial novamente.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED if sessao else status.HTTP_400_BAD_REQUEST,
                            "Token inválido.")
    if dados.get("tipo") != tipo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED if sessao else status.HTTP_400_BAD_REQUEST,
                            "Token inválido para esta operação.")
    return dados


# Tokens de reconhecimento já utilizados (uso único). Limpos ao expirar.
_tokens_usados: dict[str, float] = {}


def consumir_token_reconhecimento(token: str) -> dict:
    dados = decodificar(token, "reconhecimento")
    agora = time.time()
    for jti, exp in list(_tokens_usados.items()):
        if exp < agora:
            _tokens_usados.pop(jti, None)
    if dados["jti"] in _tokens_usados:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Este reconhecimento já foi utilizado. Faça um novo reconhecimento.")
    _tokens_usados[dados["jti"]] = dados["exp"]
    return dados


def usuario_atual(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if cred is None or cred.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Autenticação necessária.",
                            headers={"WWW-Authenticate": "Bearer"})
    return decodificar(cred.credentials, "sessao")["sub"]


class LimitadorTaxa:
    """Limite simples de requisições por IP (protege login e reconhecimento)."""

    def __init__(self, maximo: int, janela_segundos: int):
        self.maximo = maximo
        self.janela = janela_segundos
        self._hist: dict[str, deque] = defaultdict(deque)

    def __call__(self, request: Request):
        ip = request.client.host if request.client else "desconhecido"
        agora = time.time()
        fila = self._hist[ip]
        while fila and agora - fila[0] > self.janela:
            fila.popleft()
        if len(fila) >= self.maximo:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                "Muitas tentativas. Aguarde alguns segundos e tente novamente.")
        fila.append(agora)


limite_login = LimitadorTaxa(maximo=10, janela_segundos=60)
limite_reconhecimento = LimitadorTaxa(maximo=30, janela_segundos=60)
