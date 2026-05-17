import os
import json
import logging
import time
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
from dotenv import load_dotenv
from google import genai

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

# Configura a chave API do Gemini
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Inicializa o app Flask
app = Flask(__name__)
CORS(app) # Libera a comunicação com o frontend

# --- CONFIGURAÇÃO DE OBSERVABILIDADE (LOGS) ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Configura o banco de dados SQLite local
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///planos_aula.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Inicializa o SQLAlchemy
db = SQLAlchemy(app)

# Definindo a Tabela (Model) de Planos de Aula
class PlanoAula(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(150), nullable=False)
    objetivo = db.Column(db.Text, nullable=False)
    ementa = db.Column(db.Text, nullable=False)
    data_prevista = db.Column(db.String(20), nullable=False)
    disciplina = db.Column(db.String(100), nullable=False)
    conteudos = db.Column(db.Text, nullable=False)
    recursos_apoio = db.Column(db.Text, nullable=False)
    tags = db.Column(db.String(255), nullable=False)
    # Coluna extra para ordenação na listagem
    data_cadastro = db.Column(db.DateTime, default=datetime.utcnow) 

    def to_dict(self):
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
            "data_cadastro": self.data_cadastro.isoformat()
        }

# Cria o arquivo do banco de dados e as tabelas automaticamente
with app.app_context():
    db.create_all()

# --- ROTAS DE CRUD ---

# 1. Endpoint: Criar um novo Plano de Aula (Cadastro)
@app.route('/planos', methods=['POST'])
def criar_plano():
    dados = request.get_json()
    
    # Validação básica para garantir que o frontend envie tudo
    campos_obrigatorios = ['titulo', 'objetivo', 'ementa', 'data_prevista', 'disciplina', 'conteudos', 'recursos_apoio', 'tags']
    for campo in campos_obrigatorios:
        if campo not in dados:
            return jsonify({"erro": f"O campo '{campo}' é obrigatório."}), 400
            
    novo_plano = PlanoAula(
        titulo=dados['titulo'],
        objetivo=dados['objetivo'],
        ementa=dados['ementa'],
        data_prevista=dados['data_prevista'],
        disciplina=dados['disciplina'],
        conteudos=dados['conteudos'],
        recursos_apoio=dados['recursos_apoio'],
        tags=dados['tags']
    )
    
    db.session.add(novo_plano)
    db.session.commit()
    logger.info(f'Plano Criado: ID={novo_plano.id}, Titulo="{novo_plano.titulo}"')
    
    return jsonify({"mensagem": "Plano criado com sucesso!", "plano": novo_plano.to_dict()}), 201

# 2. Endpoint: Listar Planos de Aula (com paginação, filtros completos e ordenação dinâmica)
@app.route('/planos', methods=['GET'])
def listar_planos():
    # Captura de parâmetros de busca e filtro
    disciplina = request.args.get('disciplina')
    tags = request.args.get('tags')
    data_prevista = request.args.get('data_prevista')
    titulo = request.args.get('titulo')
    
    # Captura de parâmetros de ordenação e paginação
    ordenar_por = request.args.get('ordenar_por', 'data_cadastro') # 'titulo' ou 'data_cadastro'
    ordem = request.args.get('ordem', 'desc') # 'asc' ou 'desc'
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    query = PlanoAula.query
    
    # 1. Aplica os Filtros e Buscas
    if disciplina:
        query = query.filter(PlanoAula.disciplina.ilike(f'%{disciplina}%'))
    if tags:
        query = query.filter(PlanoAula.tags.ilike(f'%{tags}%'))
    if data_prevista:
        query = query.filter(PlanoAula.data_prevista == data_prevista) # Busca exata pela data
    if titulo:
        query = query.filter(PlanoAula.titulo.ilike(f'%{titulo}%')) # Busca parcial pelo título
        
    # 2. Aplica a Ordenação
    if ordenar_por == 'titulo':
        if ordem == 'asc':
            query = query.order_by(PlanoAula.titulo.asc())
        else:
            query = query.order_by(PlanoAula.titulo.desc())
    else: # Padrão é ordenar por data_cadastro
        if ordem == 'asc':
            query = query.order_by(PlanoAula.data_cadastro.asc())
        else:
            query = query.order_by(PlanoAula.data_cadastro.desc())
            
    # 3. Executa a Paginação
    planos_paginados = query.paginate(page=page, per_page=per_page, error_out=False)
    
    resultado = [plano.to_dict() for plano in planos_paginados.items]
    
    return jsonify({
        "total_registros": planos_paginados.total,
        "total_paginas": planos_paginados.pages,
        "pagina_atual": page,
        "planos": resultado
    }), 200

# 3. Endpoint: Editar um Plano de Aula (Atualização)
@app.route('/planos/<int:id>', methods=['PUT'])
def editar_plano(id):
    plano = db.session.get(PlanoAula, id)
    if not plano:
        return jsonify({"erro": "Plano de aula não encontrado."}), 404
        
    dados = request.get_json()
    
    # Atualiza os campos se eles foram enviados na requisição, senão mantém o atual
    plano.titulo = dados.get('titulo', plano.titulo)
    plano.objetivo = dados.get('objetivo', plano.objetivo)
    plano.ementa = dados.get('ementa', plano.ementa)
    plano.data_prevista = dados.get('data_prevista', plano.data_prevista)
    plano.disciplina = dados.get('disciplina', plano.disciplina)
    plano.conteudos = dados.get('conteudos', plano.conteudos)
    plano.recursos_apoio = dados.get('recursos_apoio', plano.recursos_apoio)
    plano.tags = dados.get('tags', plano.tags)
    
    db.session.commit()
    
    return jsonify({"mensagem": "Plano atualizado com sucesso!", "plano": plano.to_dict()}), 200

# 4. Endpoint: Excluir um Plano de Aula
@app.route('/planos/<int:id>', methods=['DELETE'])
def excluir_plano(id):
    plano = db.session.get(PlanoAula, id)
    if not plano:
        return jsonify({"erro": "Plano de aula não encontrado."}), 404
        
    db.session.delete(plano)
    db.session.commit()
    logger.info(f'Plano Excluído: ID={id}')
    
    return jsonify({"mensagem": "Plano excluído com sucesso!"}), 200

# Endpoint bônus de Health Check
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "API rodando e banco de dados configurado!"}), 200

# --- ROTA DE INTELIGÊNCIA ARTIFICIAL ---

@app.route('/smart-assist', methods=['POST'])
def smart_assist():
    dados = request.get_json()
    
    titulo = dados.get('titulo')
    disciplina = dados.get('disciplina')
    ementa = dados.get('ementa')
    
    # Valida se o frontend mandou o básico para a IA pensar
    if not all([titulo, disciplina, ementa]):
        return jsonify({"erro": "Título, disciplina e ementa são obrigatórios para a IA."}), 400
        
    # Engenharia de Prompt focada em JSON
    prompt = f"""
    Você é um Assistente Pedagógico especializado em planejamento de aulas.
    Com base nos dados fornecidos da aula, sugira conteúdos complementares, tópicos relacionados e exatamente 3 tags recomendadas.
    
    Dados da Aula:
    - Título: {titulo}
    - Disciplina: {disciplina}
    - Ementa/Resumo: {ementa}
    
    Responda ESTRITAMENTE em formato JSON, sem formatação markdown (como ```json), usando a seguinte estrutura:
    {{
        "conteudos_complementares": "texto corrido com as sugestões",
        "topicos_relacionados": "texto corrido com os tópicos",
        "tags_recomendadas": "Tag1, Tag2, Tag3"
    }}
    """
    
    start_time = time.time() # Inicia o cronômetro de latência
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        
        latency = round(time.time() - start_time, 2) # Calcula o tempo em segundos
        
        # Tenta capturar o uso de tokens da API do Gemini
        try:
            token_usage = response.usage_metadata.total_token_count
        except AttributeError:
            token_usage = "N/A"
            
        # LOG ESTRUTURADO CONFORME O DESAFIO
        logger.info(f'AI Request: Title="{titulo}", Discipline="{disciplina}", Token Usage={token_usage}, Latency={latency}s')
        
        # Limpeza e retorno
        texto_limpo = response.text.replace('```json', '').replace('```', '').strip()
        resultado_json = json.loads(texto_limpo)
        
        return jsonify(resultado_json), 200
        
    except Exception as e:
        latency = round(time.time() - start_time, 2)
        logger.error(f'AI Request Error: Title="{titulo}", Latency={latency}s, Error="{str(e)}"')
        return jsonify({"erro": "Falha ao se comunicar com a IA", "detalhe": str(e)}), 500

# Executa a aplicação
if __name__ == '__main__':
    app.run(debug=True)