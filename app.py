"""SmartPlanner API.

Backend Flask responsável pelo CRUD de planos de aula e pela integração com IA.
Adiciona validações, logs, health check, rota de detalhe e configuração para Docker.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

try:
    from google import genai
except ImportError:  # pragma: no cover - depende do ambiente de execução.
    genai = None

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "instance"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DATABASE_URI = f"sqlite:///{DATA_DIR / 'planos_aula.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URI)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").strip()
MAX_PER_PAGE = int(os.getenv("MAX_PER_PAGE", "100"))

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("smartplanner")

db = SQLAlchemy()
app = Flask(__name__, instance_path=str(DATA_DIR))

app.config.update(
    SQLALCHEMY_DATABASE_URI=DATABASE_URL,
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    JSON_AS_ASCII=False,
)

cors_config: str | list[str]
if CORS_ORIGINS == "*":
    cors_config = "*"
else:
    cors_config = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]

CORS(app, resources={r"/*": {"origins": cors_config}})
db.init_app(app)

if genai is not None and GEMINI_API_KEY:
    ai_client = genai.Client(api_key=GEMINI_API_KEY)
else:
    ai_client = None


class PlanoAula(db.Model):
    """Modelo de plano de aula persistido no banco de dados."""

    __tablename__ = "plano_aula"

    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(150), nullable=False)
    objetivo = db.Column(db.Text, nullable=False)
    ementa = db.Column(db.Text, nullable=False)
    data_prevista = db.Column(db.String(20), nullable=False)
    disciplina = db.Column(db.String(100), nullable=False)
    conteudos = db.Column(db.Text, nullable=False)
    recursos_apoio = db.Column(db.Text, nullable=False)
    tags = db.Column(db.String(255), nullable=False)
    data_cadastro = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self) -> dict[str, Any]:
        """Converte o registro para o formato consumido pelo frontend."""
        return {
            "id": self.id,
            "titulo": self.titulo,
            "objetivo": self.objetivo,
            "ementa": self.ementa,
            "data_prevista": self.data_prevista,
            "disciplina": self.disciplina,
            "conteudos": self.conteudos,
            "recursos_apoio": self.recursos_apoio,
            "tags": self.tags,
            "data_cadastro": self.data_cadastro.isoformat(),
        }


CAMPOS_OBRIGATORIOS = {
    "titulo": {"nome": "Título", "max": 150},
    "objetivo": {"nome": "Objetivo"},
    "ementa": {"nome": "Ementa/Resumo"},
    "data_prevista": {"nome": "Data prevista"},
    "disciplina": {"nome": "Disciplina", "max": 100},
    "conteudos": {"nome": "Conteúdos complementares"},
    "recursos_apoio": {"nome": "Recursos de apoio"},
    "tags": {"nome": "Tags", "max": 255},
}

CAMPOS_ORDENACAO = {
    "titulo": PlanoAula.titulo,
    "disciplina": PlanoAula.disciplina,
    "data_prevista": PlanoAula.data_prevista,
    "data_cadastro": PlanoAula.data_cadastro,
}


def resposta_erro(mensagem: str, status_code: int = 400, **extra: Any):
    """Retorna erros em um formato único para o frontend."""
    payload = {"erro": mensagem}
    payload.update(extra)
    return jsonify(payload), status_code


def obter_json() -> dict[str, Any] | None:
    """Obtém JSON da requisição com segurança."""
    dados = request.get_json(silent=True)
    return dados if isinstance(dados, dict) else None


def texto_limpo(valor: Any) -> str:
    """Normaliza campos textuais recebidos do frontend."""
    if valor is None:
        return ""
    return str(valor).strip()


def validar_data_iso(data: str) -> bool:
    """Valida datas no formato esperado pelo input date do HTML."""
    try:
        datetime.strptime(data, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def validar_plano(dados: dict[str, Any], parcial: bool = False) -> tuple[dict[str, str], str | None]:
    """Valida e normaliza os dados de um plano de aula."""
    dados_normalizados: dict[str, str] = {}

    if parcial and not any(campo in dados for campo in CAMPOS_OBRIGATORIOS):
        return {}, "Envie pelo menos um campo válido para atualização."

    for campo, config in CAMPOS_OBRIGATORIOS.items():
        if campo not in dados:
            if parcial:
                continue
            return {}, f"O campo '{campo}' é obrigatório."

        valor = texto_limpo(dados.get(campo))
        nome_campo = config["nome"]

        if not valor:
            return {}, f"O campo '{nome_campo}' não pode ficar vazio."

        tamanho_maximo = config.get("max")
        if tamanho_maximo and len(valor) > tamanho_maximo:
            return {}, f"O campo '{nome_campo}' deve ter no máximo {tamanho_maximo} caracteres."

        if campo == "data_prevista" and not validar_data_iso(valor):
            return {}, "A data prevista deve estar no formato AAAA-MM-DD."

        dados_normalizados[campo] = valor

    return dados_normalizados, None


def obter_plano_ou_404(plano_id: int) -> PlanoAula | None:
    """Busca um plano pelo ID."""
    return db.session.get(PlanoAula, plano_id)


def aplicar_filtros(query):
    """Aplica filtros textuais e de data na consulta de listagem."""
    titulo = texto_limpo(request.args.get("titulo"))
    disciplina = texto_limpo(request.args.get("disciplina"))
    tags = texto_limpo(request.args.get("tags"))
    data_prevista = texto_limpo(request.args.get("data_prevista"))

    if titulo:
        query = query.filter(PlanoAula.titulo.ilike(f"%{titulo}%"))
    if disciplina:
        query = query.filter(PlanoAula.disciplina.ilike(f"%{disciplina}%"))
    if tags:
        query = query.filter(PlanoAula.tags.ilike(f"%{tags}%"))
    if data_prevista:
        query = query.filter(PlanoAula.data_prevista == data_prevista)

    return query


def aplicar_ordenacao(query):
    """Aplica ordenação com lista segura de campos permitidos."""
    ordenar_por = texto_limpo(request.args.get("ordenar_por")) or "data_cadastro"
    ordem = texto_limpo(request.args.get("ordem")) or "desc"
    ordem = "asc" if ordem == "asc" else "desc"

    coluna = CAMPOS_ORDENACAO.get(ordenar_por, PlanoAula.data_cadastro)
    return query.order_by(coluna.asc() if ordem == "asc" else coluna.desc()), ordenar_por, ordem


def extrair_json_ia(texto: str) -> dict[str, Any]:
    """Extrai JSON mesmo quando o modelo retorna cercas de markdown."""
    texto_ia = texto.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(texto_ia)
    except json.JSONDecodeError:
        inicio = texto_ia.find("{")
        fim = texto_ia.rfind("}") + 1
        if inicio >= 0 and fim > inicio:
            return json.loads(texto_ia[inicio:fim])
        raise


def registrar_commit() -> bool:
    """Executa commit com rollback automático em caso de falha."""
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("Erro ao persistir dados no banco.")
        return False
    return True


def inicializar_banco() -> None:
    """Cria as tabelas do banco quando a aplicação inicia."""
    with app.app_context():
        db.create_all()
        logger.info("Banco de dados inicializado em: %s", DATABASE_URL)


@app.route("/", methods=["GET"])
def index():
    """Endpoint raiz com informações úteis da API."""
    return jsonify(
        {
            "nome": "SmartPlanner API",
            "status": "online",
            "versao": "2.1",
            "endpoints": {
                "health": "/health",
                "listar_planos": "GET /planos",
                "criar_plano": "POST /planos",
                "detalhar_plano": "GET /planos/<id>",
                "editar_plano": "PUT /planos/<id>",
                "excluir_plano": "DELETE /planos/<id>",
                "smart_assist": "POST /smart-assist",
            },
        }
    )


@app.route("/health", methods=["GET"])
def health_check():
    """Verifica se API e banco estão prontos."""
    try:
        db.session.execute(text("SELECT 1 FROM plano_aula LIMIT 1"))
    except SQLAlchemyError:
        logger.exception("Falha no health check do banco.")
        return resposta_erro("API online, mas o banco de dados não está pronto.", 503)

    return jsonify(
        {
            "status": "ok",
            "database": "ok",
            "ai_configurada": bool(ai_client),
            "message": "API rodando e banco de dados configurado.",
        }
    )


@app.route("/planos", methods=["POST"])
def criar_plano():
    """Cria um novo plano de aula."""
    dados = obter_json()
    if dados is None:
        return resposta_erro("Envie um JSON válido no corpo da requisição.")

    dados_validados, erro = validar_plano(dados)
    if erro:
        return resposta_erro(erro)

    novo_plano = PlanoAula(**dados_validados)
    db.session.add(novo_plano)

    if not registrar_commit():
        return resposta_erro("Não foi possível salvar o plano de aula.", 500)

    logger.info('Plano criado: id=%s titulo="%s"', novo_plano.id, novo_plano.titulo)
    return jsonify({"mensagem": "Plano criado com sucesso!", "plano": novo_plano.to_dict()}), 201


@app.route("/planos", methods=["GET"])
def listar_planos():
    """Lista planos com busca, filtros, ordenação e paginação."""
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = request.args.get("per_page", 10, type=int)
    per_page = max(1, min(per_page, MAX_PER_PAGE))

    query = aplicar_filtros(PlanoAula.query)
    query, ordenar_por, ordem = aplicar_ordenacao(query)
    paginacao = query.paginate(page=page, per_page=per_page, error_out=False)

    logger.info(
        "GET /planos page=%s per_page=%s order=%s-%s returned=%s total=%s",
        page,
        per_page,
        ordenar_por,
        ordem,
        len(paginacao.items),
        paginacao.total,
    )

    return jsonify(
        {
            "total_registros": paginacao.total,
            "total_paginas": paginacao.pages,
            "pagina_atual": page,
            "planos": [plano.to_dict() for plano in paginacao.items],
        }
    )


@app.route("/planos/<int:plano_id>", methods=["GET"])
def detalhar_plano(plano_id: int):
    """Retorna um único plano por ID."""
    plano = obter_plano_ou_404(plano_id)
    if plano is None:
        return resposta_erro("Plano de aula não encontrado.", 404)

    return jsonify({"plano": plano.to_dict()})


@app.route("/planos/<int:plano_id>", methods=["PUT"])
def editar_plano(plano_id: int):
    """Atualiza um plano de aula existente."""
    plano = obter_plano_ou_404(plano_id)
    if plano is None:
        return resposta_erro("Plano de aula não encontrado.", 404)

    dados = obter_json()
    if dados is None:
        return resposta_erro("Envie um JSON válido no corpo da requisição.")

    dados_validados, erro = validar_plano(dados, parcial=True)
    if erro:
        return resposta_erro(erro)

    for campo, valor in dados_validados.items():
        setattr(plano, campo, valor)

    if not registrar_commit():
        return resposta_erro("Não foi possível atualizar o plano de aula.", 500)

    logger.info('Plano editado: id=%s titulo="%s"', plano.id, plano.titulo)
    return jsonify({"mensagem": "Plano atualizado com sucesso!", "plano": plano.to_dict()})


@app.route("/planos/<int:plano_id>", methods=["DELETE"])
def excluir_plano(plano_id: int):
    """Remove um plano de aula."""
    plano = obter_plano_ou_404(plano_id)
    if plano is None:
        return resposta_erro("Plano de aula não encontrado.", 404)

    db.session.delete(plano)

    if not registrar_commit():
        return resposta_erro("Não foi possível excluir o plano de aula.", 500)

    logger.info("Plano excluído: id=%s", plano_id)
    return jsonify({"mensagem": "Plano excluído com sucesso!"})


@app.route("/smart-assist", methods=["POST"])
def smart_assist():
    """Gera recomendações pedagógicas com IA."""
    if ai_client is None:
        return resposta_erro(
            "A integração com IA não está configurada. Verifique a variável GEMINI_API_KEY.",
            503,
        )

    dados = obter_json()
    if dados is None:
        return resposta_erro("Envie um JSON válido no corpo da requisição.")

    titulo = texto_limpo(dados.get("titulo"))
    disciplina = texto_limpo(dados.get("disciplina"))
    ementa = texto_limpo(dados.get("ementa"))

    if not all([titulo, disciplina, ementa]):
        return resposta_erro("Título, disciplina e ementa são obrigatórios para a IA.")

    prompt = f"""
Você é um Assistente Pedagógico especializado em planejamento de aulas.
Com base nos dados fornecidos da aula, sugira conteúdos complementares,
tópicos relacionados e exatamente 3 tags recomendadas.

Dados da Aula:
- Título: {titulo}
- Disciplina: {disciplina}
- Ementa/Resumo: {ementa}

Responda estritamente em JSON válido, sem markdown, usando esta estrutura:
{{
  "conteudos_complementares": "texto corrido com as sugestões",
  "topicos_relacionados": "texto corrido com os tópicos",
  "tags_recomendadas": "Tag1, Tag2, Tag3"
}}
""".strip()

    inicio = time.perf_counter()

    try:
        resposta = ai_client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        latencia = round(time.perf_counter() - inicio, 2)
        token_usage = getattr(getattr(resposta, "usage_metadata", None), "total_token_count", "N/A")
        resultado_json = extrair_json_ia(resposta.text)

        logger.info(
            'AI request ok: titulo="%s" disciplina="%s" tokens=%s latencia=%ss',
            titulo,
            disciplina,
            token_usage,
            latencia,
        )
        return jsonify(resultado_json)

    except (json.JSONDecodeError, TypeError, ValueError):
        latencia = round(time.perf_counter() - inicio, 2)
        logger.exception("IA retornou um conteúdo inválido. latencia=%ss", latencia)
        return resposta_erro("A IA retornou uma resposta inválida. Tente novamente.", 502)

    except Exception as exc:  # pragma: no cover - depende do serviço externo.
        latencia = round(time.perf_counter() - inicio, 2)
        logger.exception("Erro na chamada de IA. latencia=%ss", latencia)
        return resposta_erro(
            "Falha ao se comunicar com a IA.",
            502,
            detalhe=str(exc) if app.debug else "Consulte os logs do servidor.",
        )


@app.errorhandler(404)
def not_found(_erro):
    """Resposta padrão para rota inexistente."""
    return resposta_erro("Rota não encontrada.", 404)


@app.errorhandler(405)
def method_not_allowed(_erro):
    """Resposta padrão para método HTTP inválido."""
    return resposta_erro("Método HTTP não permitido para esta rota.", 405)


@app.errorhandler(500)
def internal_error(_erro):
    """Resposta padrão para erro interno."""
    db.session.rollback()
    logger.exception("Erro interno não tratado.")
    return resposta_erro("Erro interno no servidor.", 500)


try:
    inicializar_banco()
except SQLAlchemyError:
    logger.exception("Não foi possível inicializar o banco de dados.")
    raise


if __name__ == "__main__":
    porta = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=porta, debug=debug)
