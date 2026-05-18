// Configuração da API
const API_URL = 'http://127.0.0.1:5000';
let paginaAtual = 1;

// Elementos da Interface (Navegação e Telas)
const telaListagem = document.getElementById('tela-listagem');
const telaFormulario = document.getElementById('tela-formulario');
const btnNavListar = document.getElementById('nav-listar');
const btnNavCadastrar = document.getElementById('nav-cadastrar');

// Elementos do Formulário
const formPlano = document.getElementById('form-plano');
const formTituloTela = document.getElementById('form-titulo-tela');
const btnCancelar = document.getElementById('btn-cancelar');
const btnIA = document.getElementById('btn-ia');
const aiLoading = document.getElementById('ai-loading');

// Elementos de Listagem
const formFiltros = document.getElementById('form-filtros');
const tabelaCorpo = document.getElementById('tabela-corpo');
const btnAnt = document.getElementById('btn-ant');
const btnProx = document.getElementById('btn-prox');
const infoPaginacao = document.getElementById('info-paginacao');

const btnImprimir = document.getElementById('btn-imprimir');
const btnCompartilhar = document.getElementById('btn-compartilhar');

// ==========================================
// 1. NAVEGAÇÃO DA SPA
// ==========================================
function mostrarListagem() {
    telaFormulario.classList.add('d-none');
    telaListagem.classList.remove('d-none');
    carregarPlanos();
}

function mostrarFormulario(modoEdicao = false) {
    telaListagem.classList.add('d-none');
    telaFormulario.classList.remove('d-none');
    
    if (!modoEdicao) {
        formPlano.reset();
        document.getElementById('plano-id').value = '';
        formTituloTela.innerText = 'Cadastrar Novo Plano';
    } else {
        formTituloTela.innerText = 'Editar Plano de Aula';
    }
}

btnNavListar.addEventListener('click', mostrarListagem);
btnNavCadastrar.addEventListener('click', () => mostrarFormulario(false));
btnCancelar.addEventListener('click', mostrarListagem);

// ==========================================
// 2. INTEGRAÇÃO COM A INTELIGÊNCIA ARTIFICIAL
// ==========================================
btnIA.addEventListener('click', async () => {
    const titulo = document.getElementById('titulo').value;
    const disciplina = document.getElementById('disciplina').value;
    const ementa = document.getElementById('ementa').value;

    if (!titulo || !disciplina || !ementa) {
        alert('Por favor, preencha o Título, a Disciplina e a Ementa antes de chamar a IA.');
        return;
    }

    // Mostra o loading state
    aiLoading.classList.remove('d-none');

    try {
        const response = await fetch(`${API_URL}/smart-assist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, disciplina, ementa })
        });

        const data = await response.json();

        if (response.ok) {
            // Auto-preenchimento mágico
            document.getElementById('conteudos').value = data.conteudos_complementares || '';
            document.getElementById('recursos_apoio').value = data.topicos_relacionados || '';
            document.getElementById('tags').value = data.tags_recomendadas || '';
        } else {
            alert(`Erro da IA: ${data.erro || 'Desconhecido'}`);
        }
    } catch (error) {
        console.error('Erro ao conectar com a IA:', error);
        alert('Falha de comunicação com o servidor. Verifique se o backend está rodando.');
    } finally {
        // Esconde o loading state
        aiLoading.classList.add('d-none');
    }
});

// ==========================================
// 3. CRUD: LISTAR (GET) E FILTRAR
// ==========================================
async function carregarPlanos() {
    // Pegando os valores dos filtros
    const titulo = document.getElementById('busca-titulo').value;
    const disciplina = document.getElementById('filtro-disciplina').value;
    const tags = document.getElementById('filtro-tags').value;
    const dataPrev = document.getElementById('filtro-data').value;
    const ordenacao = document.getElementById('ordenar-por').value.split('-');
    
    const ordenarPor = ordenacao[0];
    const ordem = ordenacao[1];

    // Construindo a URL com os parâmetros
    let queryParams = new URLSearchParams({
        page: paginaAtual,
        per_page: 10,
        ordenar_por: ordenarPor,
        ordem: ordem
    });

    if (titulo) queryParams.append('titulo', titulo);
    if (disciplina) queryParams.append('disciplina', disciplina);
    if (tags) queryParams.append('tags', tags);
    if (dataPrev) queryParams.append('data_prevista', dataPrev);

    try {
        const response = await fetch(`${API_URL}/planos?${queryParams.toString()}`);
        const data = await response.json();

        // Limpa a tabela atual
        tabelaCorpo.innerHTML = '';

        if (data.planos.length === 0) {
            tabelaCorpo.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum plano de aula encontrado.</td></tr>';
        } else {
            // Preenche a tabela com os novos dados
            data.planos.forEach(plano => {
                // Formata a data de YYYY-MM-DD para DD/MM/YYYY para exibição
                const dataBr = plano.data_prevista.split('-').reverse().join('/');
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="fw-medium">${plano.titulo}</td>
                    <td><span class="badge bg-secondary">${plano.disciplina}</span></td>
                    <td>${dataBr}</td>
                    <td class="small text-muted">${plano.tags}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-info me-1" onclick="visualizarPlano(${plano.id})">Visualizar</button>
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="carregarParaEdicao(${plano.id})">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="excluirPlano(${plano.id})">Excluir</button>
                    </td>
                `;
                tabelaCorpo.appendChild(tr);
            });
        }

        // Atualiza a paginação
        infoPaginacao.innerText = `Mostrando página ${data.pagina_atual} de ${data.total_paginas || 1} (Total: ${data.total_registros})`;
        btnAnt.disabled = data.pagina_atual === 1;
        btnProx.disabled = data.pagina_atual === (data.total_paginas || 1);

    } catch (error) {
        console.error('Erro ao carregar planos:', error);
        tabelaCorpo.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Erro ao carregar os dados. O backend está rodando?</td></tr>';
    }
}

formFiltros.addEventListener('submit', (e) => {
    e.preventDefault();
    paginaAtual = 1; // Reseta para a primeira página ao filtrar
    carregarPlanos();
});

btnAnt.addEventListener('click', () => { if (paginaAtual > 1) { paginaAtual--; carregarPlanos(); } });
btnProx.addEventListener('click', () => { paginaAtual++; carregarPlanos(); });

// ==========================================
// 4. CRUD: SALVAR (POST/PUT)
// ==========================================
formPlano.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('plano-id').value;
    const metodo = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/planos/${id}` : `${API_URL}/planos`;

    const dadosPlano = {
        titulo: document.getElementById('titulo').value,
        disciplina: document.getElementById('disciplina').value,
        data_prevista: document.getElementById('data_prevista').value,
        ementa: document.getElementById('ementa').value,
        objetivo: document.getElementById('objetivo').value,
        conteudos: document.getElementById('conteudos').value,
        recursos_apoio: document.getElementById('recursos_apoio').value,
        tags: document.getElementById('tags').value
    };

    try {
        const response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosPlano)
        });

        if (response.ok) {
            alert(id ? 'Plano atualizado com sucesso!' : 'Plano cadastrado com sucesso!');
            mostrarListagem(); // Volta para a tabela
        } else {
            const data = await response.json();
            alert(`Erro ao salvar: ${data.erro}`);
        }
    } catch (error) {
        console.error('Erro ao salvar plano:', error);
        alert('Erro ao se comunicar com o servidor.');
    }
});

// ==========================================
// 5. CRUD: EDITAR E EXCLUIR
// ==========================================
// Instância do Modal do Bootstrap
const modalVisualizar = new bootstrap.Modal(document.getElementById('modalVisualizar'));

// Função para abrir o plano em modo somente leitura
window.visualizarPlano = async (id) => {
    try {
        const response = await fetch(`${API_URL}/planos?titulo=`);
        const data = await response.json();
        const plano = data.planos.find(p => p.id === id);

        if (plano) {
            document.getElementById('vis-titulo').innerText = plano.titulo;
            document.getElementById('vis-disciplina').innerText = plano.disciplina;

            const dataBr = plano.data_prevista.split('-').reverse().join('/');
            document.getElementById('vis-data').innerText = dataBr;

            document.getElementById('vis-ementa').innerText = plano.ementa;
            document.getElementById('vis-objetivo').innerText = plano.objetivo;
            document.getElementById('vis-conteudos').innerText = plano.conteudos;
            document.getElementById('vis-recursos').innerText = plano.recursos_apoio;
            document.getElementById('vis-tags').innerText = plano.tags;

            modalVisualizar.show();
        }
    } catch (error) {
        console.error('Erro ao carregar dados para visualização:', error);
    }
};

function obterTextoPlanoVisualizado() {
    return [
        `Título: ${document.getElementById('vis-titulo').innerText}`,
        `Disciplina: ${document.getElementById('vis-disciplina').innerText}`,
        `Data: ${document.getElementById('vis-data').innerText}`,
        '',
        'Ementa/Resumo',
        document.getElementById('vis-ementa').innerText,
        '',
        'Objetivo',
        document.getElementById('vis-objetivo').innerText,
        '',
        'Conteúdos Complementares',
        document.getElementById('vis-conteudos').innerText,
        '',
        'Recursos de Apoio',
        document.getElementById('vis-recursos').innerText,
        '',
        'Tags Recomendadas',
        document.getElementById('vis-tags').innerText
    ].join('\n');
}

function obterDadosPlanoVisualizado() {
    return {
        titulo: document.getElementById('vis-titulo').innerText,
        disciplina: document.getElementById('vis-disciplina').innerText,
        data: document.getElementById('vis-data').innerText,
        ementa: document.getElementById('vis-ementa').innerText,
        objetivo: document.getElementById('vis-objetivo').innerText,
        conteudos: document.getElementById('vis-conteudos').innerText,
        recursos: document.getElementById('vis-recursos').innerText,
        tags: document.getElementById('vis-tags').innerText
    };
}

btnImprimir.addEventListener('click', () => {
    const plano = obterDadosPlanoVisualizado();
    const nomeInstituicao = 'V-Lab';
    const rodapeInstituicao = 'Plano gerado pelo SmartPlanner';

    const janelaImpressao = window.open('', '_blank', 'width=900,height=700');

    if (!janelaImpressao) {
        alert('O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
        return;
    }

    janelaImpressao.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Imprimir Plano de Aula</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    color: #1f2937;
                    background: #f8fafc;
                }
                .page {
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 32px;
                    background: #fff;
                    min-height: 100vh;
                    position: relative;
                }
                .print-header {
                    border-bottom: 4px solid #0d6efd;
                    padding-bottom: 16px;
                    margin-bottom: 24px;
                }
                .school-name {
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: #0d6efd;
                    margin-bottom: 6px;
                }
                .document-title {
                    font-size: 28px;
                    margin: 0;
                    line-height: 1.1;
                }
                .document-subtitle {
                    margin: 6px 0 0;
                    color: #6b7280;
                    font-size: 14px;
                }
                .meta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                    margin-bottom: 24px;
                }
                .meta-card {
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 14px 16px;
                    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                }
                .meta-label {
                    display: block;
                    font-size: 11px;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: #6b7280;
                    margin-bottom: 6px;
                }
                .meta-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #111827;
                }
                .section {
                    margin-top: 18px;
                    padding: 18px 20px;
                    border: 1px solid #e5e7eb;
                    border-radius: 14px;
                    background: #fff;
                    page-break-inside: avoid;
                }
                .section h2 {
                    margin: 0 0 10px;
                    font-size: 16px;
                    color: #0f172a;
                }
                .section p {
                    margin: 0;
                    white-space: pre-wrap;
                    line-height: 1.6;
                    color: #374151;
                }
                .footer {
                    margin-top: 28px;
                    padding-top: 14px;
                    border-top: 1px solid #dbe3ea;
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    color: #6b7280;
                    font-size: 12px;
                }
                .footer strong {
                    color: #374151;
                }
                @media print {
                    body { background: #fff; }
                    .page { padding: 24px 28px; }
                }
            </style>
        </head>
        <body>
            <div class="page">
                <header class="print-header">
                    <div class="school-name">${nomeInstituicao}</div>
                    <h1 class="document-title">${plano.titulo}</h1>
                    <p class="document-subtitle">Plano de aula para impressão e arquivamento</p>
                </header>

                <div class="meta-grid">
                    <div class="meta-card">
                        <span class="meta-label">Disciplina</span>
                        <div class="meta-value">${plano.disciplina}</div>
                    </div>
                    <div class="meta-card">
                        <span class="meta-label">Data prevista</span>
                        <div class="meta-value">${plano.data}</div>
                    </div>
                </div>

                <section class="section">
                    <h2>Ementa/Resumo</h2>
                    <p>${plano.ementa}</p>
                </section>

                <section class="section">
                    <h2>Objetivo</h2>
                    <p>${plano.objetivo}</p>
                </section>

                <section class="section">
                    <h2>Conteúdos Complementares</h2>
                    <p>${plano.conteudos}</p>
                </section>

                <section class="section">
                    <h2>Recursos de Apoio</h2>
                    <p>${plano.recursos}</p>
                </section>

                <section class="section">
                    <h2>Tags Recomendadas</h2>
                    <p>${plano.tags}</p>
                </section>

                <footer class="footer">
                    <div><strong>${nomeInstituicao}</strong></div>
                    <div>${rodapeInstituicao}</div>
                </footer>
            </div>
            <script>
                window.onload = () => { window.print(); window.onafterprint = () => window.close(); };
            <\/script>
        </body>
        </html>
    `);
    janelaImpressao.document.close();
});

btnCompartilhar.addEventListener('click', async () => {
    const textoPlano = obterTextoPlanoVisualizado();

    if (navigator.share) {
        try {
            await navigator.share({
                title: document.getElementById('vis-titulo').innerText,
                text: textoPlano
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Erro ao compartilhar:', error);
                alert('Não foi possível compartilhar este plano.');
            }
        }
        return;
    }

    try {
        await navigator.clipboard.writeText(textoPlano);
        alert('Resumo copiado para a área de transferência.');
    } catch (error) {
        console.error('Erro ao copiar para a área de transferência:', error);
        alert('O navegador não suporta compartilhamento nem cópia automática.');
    }
});

// Função chamada pelo botão "Editar" na tabela
window.carregarParaEdicao = async (id) => {
    try {
        // Fazemos uma busca rápida na listagem para pegar os dados (em um sistema real, faríamos um GET /planos/id)
        const response = await fetch(`${API_URL}/planos?titulo=`);
        const data = await response.json();
        const plano = data.planos.find(p => p.id === id);

        if (plano) {
            document.getElementById('plano-id').value = plano.id;
            document.getElementById('titulo').value = plano.titulo;
            document.getElementById('disciplina').value = plano.disciplina;
            document.getElementById('data_prevista').value = plano.data_prevista;
            document.getElementById('ementa').value = plano.ementa;
            document.getElementById('objetivo').value = plano.objetivo;
            document.getElementById('conteudos').value = plano.conteudos;
            document.getElementById('recursos_apoio').value = plano.recursos_apoio;
            document.getElementById('tags').value = plano.tags;

            mostrarFormulario(true); // Abre o formulário em modo de edição
        }
    } catch (error) {
        console.error('Erro ao carregar dados para edição:', error);
    }
};

// Função chamada pelo botão "Excluir" na tabela
window.excluirPlano = async (id) => {
    if (confirm('Tem certeza que deseja excluir este plano de aula?')) {
        try {
            const response = await fetch(`${API_URL}/planos/${id}`, { method: 'DELETE' });
            if (response.ok) {
                carregarPlanos(); // Recarrega a tabela
            } else {
                alert('Erro ao excluir o plano.');
            }
        } catch (error) {
            console.error('Erro ao excluir:', error);
            alert('Erro ao se comunicar com o servidor.');
        }
    }
};

// ==========================================
// INICIALIZAÇÃO
// ==========================================
// Carrega os dados assim que o arquivo é lido pelo navegador
carregarPlanos();