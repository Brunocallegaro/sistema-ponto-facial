"""Conexão com o banco SQLite usando SQLAlchemy."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_PATH

DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # FastAPI usa várias threads
)


@event.listens_for(engine, "connect")
def _ativar_foreign_keys(dbapi_connection, _):
    """O SQLite só respeita chaves estrangeiras (ON DELETE CASCADE) com este PRAGMA."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependência do FastAPI: abre uma sessão por requisição e fecha ao final."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def criar_tabelas():
    from . import models  # noqa: F401  (registra os modelos)
    Base.metadata.create_all(bind=engine)
    _migrar()


def _migrar():
    """Atualiza bancos criados por versões anteriores (create_all não adiciona colunas)."""
    with engine.begin() as con:
        colunas = {linha[1] for linha in con.exec_driver_sql("PRAGMA table_info(registros_ponto)")}
        if "origem" not in colunas:
            con.exec_driver_sql(
                "ALTER TABLE registros_ponto ADD COLUMN origem VARCHAR(10) NOT NULL DEFAULT 'camera'")
