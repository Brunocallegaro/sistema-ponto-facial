"""Testes automatizados de ponta a ponta da API — usam o DeepFace REAL.

Execute dentro de backend/ (com o ambiente virtual ativado):
    python -m pytest -v

As imagens de tests/fixtures/ são do "AT&T Database of Faces" (ORL, AT&T
Laboratories Cambridge), redimensionadas e posicionadas em um fundo neutro para
simular um quadro de webcam. Veja tests/fixtures/CREDITOS.txt.
"""
import base64
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest

# Banco e pasta de fotos temporários: os testes nunca tocam nos dados reais
_TMP = tempfile.mkdtemp(prefix="ponto_teste_")
os.environ.update({
    "DATA_DIR": _TMP,
    "UPLOAD_DIR": str(Path(_TMP) / "fotos"),
    "DATABASE_PATH": str(Path(_TMP) / "teste.db"),
    "WARMUP_MODELO": "0",
    "INTERVALO_MINIMO_SEGUNDOS": "0",
    "ADMIN_USERNAME": "admin",
    "ADMIN_PASSWORD": "senha-teste",
})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.main import app  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def img(nome: str) -> str:
    dados = (FIX / f"{nome}.jpg").read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(dados).decode()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        r = c.post("/api/auth/login", json={"usuario": "admin", "senha": "senha-teste"})
        assert r.status_code == 200, r.text
        c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        yield c


@pytest.fixture(scope="module")
def ids(client):
    """Cadastra duas pessoas reais (A e B) para os demais testes."""
    ra = client.post("/api/funcionarios", json={"nome": "Ana Paula Souza", "matricula": "F001",
                                                "cargo": "Analista", "foto": img("pessoa_a_cadastro")})
    assert ra.status_code == 201, ra.text
    rb = client.post("/api/funcionarios", json={"nome": "Bruno Lima Costa", "matricula": "F002",
                                                "cargo": "Técnico", "foto": img("pessoa_b_cadastro")})
    assert rb.status_code == 201, rb.text
    return {"a": ra.json()["id"], "b": rb.json()["id"]}


# --- Segurança --------------------------------------------------------------
def test_endpoints_exigem_autenticacao():
    with TestClient(app) as anon:
        assert anon.get("/api/funcionarios").status_code == 401
        assert anon.post("/api/reconhecimento", json={"imagem": "x"}).status_code == 401
        assert anon.post("/api/auth/login", json={"usuario": "admin", "senha": "errada"}).status_code == 401
        assert anon.get("/api/status").status_code == 200  # status é público


# --- Cadastro ---------------------------------------------------------------
def test_cadastro_armazena_foto_e_embedding(client, ids):
    r = client.get(f"/api/funcionarios/{ids['a']}")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["matricula"] == "F001" and corpo["data_cadastro"]
    assert "embedding" not in corpo and "foto_path" not in corpo  # dado biométrico não exposto

    con = sqlite3.connect(config.DATABASE_PATH)
    foto_path, emb, modelo = con.execute(
        "SELECT foto_path, embedding, modelo_embedding FROM funcionarios WHERE id=?", (ids["a"],)).fetchone()
    con.close()
    assert (config.UPLOAD_DIR / foto_path).exists()
    assert len(emb) == 512 * 4 and modelo == "Facenet512"  # 512 floats float32

    foto = client.get(f"/api/funcionarios/{ids['a']}/foto")
    assert foto.status_code == 200 and foto.headers["content-type"] == "image/jpeg"
    assert foto.content[:3] == b"\xff\xd8\xff"


def test_cadastro_validacoes(client, ids):
    # matrícula duplicada
    r = client.post("/api/funcionarios", json={"nome": "Outra Pessoa", "matricula": "F001",
                                               "cargo": "X1", "foto": img("pessoa_c_nao_cadastrada")})
    assert r.status_code == 409
    # mesmo rosto com outra matrícula
    r = client.post("/api/funcionarios", json={"nome": "Ana Duplicada", "matricula": "F099",
                                               "cargo": "Analista", "foto": img("pessoa_a_reconhecer")})
    assert r.status_code == 409 and "já está cadastrado" in r.json()["detail"]
    # nome incompleto
    r = client.post("/api/funcionarios", json={"nome": "Ana", "matricula": "F100",
                                               "cargo": "Analista", "foto": img("pessoa_c_nao_cadastrada")})
    assert r.status_code == 422 and r.json()["codigo"] == "VALIDACAO"
    # imagem sem rosto
    r = client.post("/api/funcionarios", json={"nome": "Sem Rosto Silva", "matricula": "F101",
                                               "cargo": "Analista", "foto": img("sem_rosto")})
    assert r.status_code == 422 and r.json()["codigo"] == "SEM_ROSTO"


@pytest.mark.parametrize("arquivo,codigo", [
    ("sem_rosto", "SEM_ROSTO"),
    ("dois_rostos", "VARIOS_ROSTOS"),
    ("escura", "IMAGEM_ESCURA"),
    ("desfocada", "IMAGEM_DESFOCADA"),
])
def test_reconhecimento_recusa_imagens_ruins(client, ids, arquivo, codigo):
    r = client.post("/api/reconhecimento", json={"imagem": img(arquivo)})
    assert r.status_code == 422, r.text
    assert r.json()["codigo"] == codigo


def test_imagem_invalida(client):
    r = client.post("/api/reconhecimento", json={"imagem": "data:image/png;base64,bmFvLWUtaW1hZ2Vt"})
    assert r.status_code == 422 and r.json()["codigo"] == "FORMATO_INVALIDO"
    r = client.post("/api/reconhecimento", json={"imagem": "@@@"})
    assert r.status_code == 422 and r.json()["codigo"] == "IMAGEM_INVALIDA"


# --- Reconhecimento ---------------------------------------------------------
def test_reconhece_funcionarios_cadastrados(client, ids):
    for pessoa, arquivo in (("a", "pessoa_a_reconhecer"), ("b", "pessoa_b_reconhecer")):
        r = client.post("/api/reconhecimento", json={"imagem": img(arquivo)})
        assert r.status_code == 200, r.text
        corpo = r.json()
        assert corpo["reconhecido"] is True, corpo
        assert corpo["funcionario"]["id"] == ids[pessoa]
        assert corpo["distancia"] <= corpo["limite"]
        assert corpo["token_registro"]


def test_recusa_funcionario_nao_cadastrado(client, ids):
    r = client.post("/api/reconhecimento", json={"imagem": img("pessoa_c_nao_cadastrada")})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["reconhecido"] is False
    assert corpo["token_registro"] is None and corpo["funcionario"] is None
    assert corpo["distancia"] > corpo["limite"]


# --- Registro de ponto -------------------------------------------------------
def _reconhecer(client, arquivo="pessoa_a_reconhecer"):
    r = client.post("/api/reconhecimento", json={"imagem": img(arquivo)})
    assert r.json()["reconhecido"], r.text
    return r.json()


def test_fluxo_completo_de_ponto(client, ids):
    sequencia = ["ENTRADA", "SAIDA_INTERVALO", "RETORNO_INTERVALO", "SAIDA_FINAL"]
    for tipo in sequencia:
        rec = _reconhecer(client)
        assert tipo in rec["proximos_tipos"]
        r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": tipo})
        assert r.status_code == 201, r.text
        corpo = r.json()
        assert corpo["tipo"] == tipo and corpo["matricula"] == "F001" and corpo["nome"] == "Ana Paula Souza"
        assert corpo["data"] and corpo["horario"]
    # após a saída final, nada mais é permitido no dia
    rec = _reconhecer(client)
    assert rec["proximos_tipos"] == []
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "ENTRADA"})
    assert r.status_code == 409


def test_sequencias_invalidas_e_duplicadas(client, ids):
    rec = _reconhecer(client, "pessoa_b_reconhecer")
    # não pode começar o dia com retorno
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "RETORNO_INTERVALO"})
    assert r.status_code == 409 and "primeiro registro" in r.json()["detail"]
    # o token não foi gasto pelo erro de regra: ainda serve para a entrada
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "ENTRADA"})
    assert r.status_code == 201
    # token de uso único
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "SAIDA_FINAL"})
    assert r.status_code == 409 and "já foi utilizado" in r.json()["detail"]
    # entrada duplicada
    rec = _reconhecer(client, "pessoa_b_reconhecer")
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "ENTRADA"})
    assert r.status_code == 409 and "duplicado" in r.json()["detail"].lower()
    # retorno sem ter saído para intervalo
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "RETORNO_INTERVALO"})
    assert r.status_code == 409 and "Sequência inválida" in r.json()["detail"]


def test_intervalo_minimo_entre_registros(client, ids, monkeypatch):
    monkeypatch.setattr(config, "INTERVALO_MINIMO_SEGUNDOS", 3600)
    rec = _reconhecer(client, "pessoa_b_reconhecer")  # B já tem ENTRADA
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "SAIDA_INTERVALO"})
    assert r.status_code == 429 and "Aguarde" in r.json()["detail"]


def test_token_forjado_e_recusado(client, ids):
    r = client.post("/api/ponto", json={"token_registro": "eyJhbGciOiJIUzI1NiJ9.e30.invalido", "tipo": "ENTRADA"})
    assert r.status_code == 400
    # um token de SESSÃO não pode ser usado como token de reconhecimento
    sessao = client.headers["Authorization"].split()[1]
    r = client.post("/api/ponto", json={"token_registro": sessao, "tipo": "ENTRADA"})
    assert r.status_code == 400


def test_token_de_reconhecimento_expirado(client, ids, monkeypatch):
    from app import security
    monkeypatch.setattr(config, "TOKEN_RECONHECIMENTO_SEGUNDOS", -1)
    token = security.criar_token_reconhecimento(ids["a"], 0.1)
    r = client.post("/api/ponto", json={"token_registro": token, "tipo": "ENTRADA"})
    assert r.status_code == 409 and "expirou" in r.json()["detail"]


# --- Histórico ---------------------------------------------------------------
def test_historico_e_filtros(client, ids):
    todos = client.get("/api/registros").json()
    assert todos["total"] == 5  # 4 de A + 1 de B
    hoje = todos["itens"][0]["data"]

    por_func = client.get(f"/api/funcionarios/{ids['a']}/registros").json()
    assert len(por_func) == 4 and all(r["matricula"] == "F001" for r in por_func)

    assert client.get("/api/registros", params={"matricula": "F002"}).json()["total"] == 1
    assert client.get("/api/registros", params={"tipo": "ENTRADA"}).json()["total"] == 2
    assert client.get("/api/registros", params={"data_inicio": hoje, "data_fim": hoje}).json()["total"] == 5
    assert client.get("/api/registros", params={"data_inicio": "2000-01-01",
                                                "data_fim": "2000-01-02"}).json()["total"] == 0
    assert client.get("/api/registros", params={"data_inicio": "2030-01-02",
                                                "data_fim": "2030-01-01"}).status_code == 422

    csv = client.get("/api/registros/exportar", params={"matricula": "F001"})
    assert csv.status_code == 200 and csv.text.count("\n") == 5  # cabeçalho + 4 linhas

    dash = client.get("/api/dashboard").json()
    assert dash["total_funcionarios"] == 2 and dash["total_registros"] == 5
    assert dash["registros_hoje"] == 5 and dash["presentes_agora"] == 1  # B entrou, A saiu


# --- Edição e exclusão --------------------------------------------------------
def test_editar_funcionario(client, ids):
    r = client.put(f"/api/funcionarios/{ids['b']}", json={"cargo": "Supervisor", "nome": "Bruno Lima Costa"})
    assert r.status_code == 200 and r.json()["cargo"] == "Supervisor"
    r = client.put(f"/api/funcionarios/{ids['b']}", json={"matricula": "F001"})
    assert r.status_code == 409
    # troca de foto pela de outra pessoa já cadastrada é recusada
    r = client.put(f"/api/funcionarios/{ids['b']}", json={"foto": img("pessoa_a_reconhecer")})
    assert r.status_code == 409


def test_persistencia_apos_reiniciar(ids):
    """Abre o arquivo SQLite diretamente (como após reiniciar o servidor)."""
    from app.database import engine
    engine.dispose()  # fecha todas as conexões da aplicação
    con = sqlite3.connect(config.DATABASE_PATH)
    assert con.execute("SELECT COUNT(*) FROM funcionarios").fetchone()[0] == 2
    assert con.execute("SELECT COUNT(*) FROM registros_ponto").fetchone()[0] == 5
    con.close()
    with TestClient(app) as novo:  # nova instância da aplicação
        tok = novo.post("/api/auth/login", json={"usuario": "admin", "senha": "senha-teste"}).json()
        lista = novo.get("/api/funcionarios", headers={"Authorization": f"Bearer {tok['access_token']}"})
        assert {f["matricula"] for f in lista.json()} == {"F001", "F002"}


def test_excluir_funcionario_remove_foto_e_registros(client, ids):
    con = sqlite3.connect(config.DATABASE_PATH)
    foto = con.execute("SELECT foto_path FROM funcionarios WHERE id=?", (ids["b"],)).fetchone()[0]
    con.close()
    r = client.delete(f"/api/funcionarios/{ids['b']}")
    assert r.status_code == 200
    assert client.get(f"/api/funcionarios/{ids['b']}").status_code == 404
    assert not (config.UPLOAD_DIR / foto).exists()
    assert client.get("/api/registros", params={"matricula": "F002"}).json()["total"] == 0
    # depois de excluído, o rosto não é mais reconhecido
    r = client.post("/api/reconhecimento", json={"imagem": img("pessoa_b_reconhecer")})
    assert r.json()["reconhecido"] is False


# --- Foto enviada (arquivo / galeria do celular) ---------------------------------
def test_reconhecimento_por_foto_enviada_registra_origem(client, ids):
    r = client.post("/api/funcionarios", json={"nome": "Carla Mendes Rocha", "matricula": "F003",
                                               "cargo": "Assistente", "foto": img("pessoa_c_nao_cadastrada")})
    assert r.status_code == 201, r.text
    rec = client.post("/api/reconhecimento", json={"imagem": img("pessoa_c_nao_cadastrada"),
                                                   "origem": "arquivo"}).json()
    assert rec["reconhecido"] and rec["origem"] == "arquivo"
    r = client.post("/api/ponto", json={"token_registro": rec["token_registro"], "tipo": "ENTRADA"})
    assert r.status_code == 201 and r.json()["origem"] == "arquivo"
    csv = client.get("/api/registros/exportar", params={"matricula": "F003"}).text
    assert "Foto enviada" in csv
    # registros feitos pela câmera continuam marcados como "camera"
    hist = client.get("/api/registros", params={"matricula": "F001"}).json()["itens"]
    assert hist and all(i["origem"] == "camera" for i in hist)


def test_foto_enviada_pode_ser_desativada(client, ids, monkeypatch):
    monkeypatch.setattr(config, "PERMITIR_FOTO_ARQUIVO", False)
    r = client.post("/api/reconhecimento", json={"imagem": img("pessoa_a_reconhecer"), "origem": "arquivo"})
    assert r.status_code == 403
    assert client.get("/api/status").json()["permitir_foto_arquivo"] is False
    r = client.post("/api/reconhecimento", json={"imagem": img("pessoa_a_reconhecer"), "origem": "camera"})
    assert r.status_code == 200 and r.json()["reconhecido"]


def test_migracao_de_banco_antigo(tmp_path):
    """Um banco criado pela versão anterior (sem a coluna origem) é atualizado ao iniciar."""
    import subprocess
    antigo = tmp_path / "antigo.db"
    con = sqlite3.connect(antigo)
    con.executescript("""
        CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, nome VARCHAR(120), matricula VARCHAR(20),
            cargo VARCHAR(80), foto_path VARCHAR(255), data_cadastro DATETIME, embedding BLOB,
            modelo_embedding VARCHAR(40));
        CREATE TABLE registros_ponto (id INTEGER PRIMARY KEY, funcionario_id INTEGER, data DATE,
            horario TIME, tipo VARCHAR(17), distancia FLOAT);
        INSERT INTO registros_ponto VALUES (1, 1, '2026-01-01', '08:00:00', 'ENTRADA', 0.1);
    """)
    con.close()
    env = {**os.environ, "DATABASE_PATH": str(antigo), "DATA_DIR": str(tmp_path)}
    codigo = "from app.database import criar_tabelas; criar_tabelas()"
    subprocess.run([sys.executable, "-c", codigo], cwd=Path(__file__).resolve().parent.parent,
                   env=env, check=True)
    con = sqlite3.connect(antigo)
    assert con.execute("SELECT origem FROM registros_ponto WHERE id=1").fetchone()[0] == "camera"
    con.close()
