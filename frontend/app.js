'use strict';

// Configuração da API
const API_URL = 'http://127.0.0.1:5000';
const PLANOS_POR_PAGINA = 10;

let paginaAtual = 1;
let planosCache = new Map();

// Atalho seguro para buscar elementos pelo ID
const $ = (id) => document.getElementById(id);

// Elementos da Interface
const telaListagem = $('tela-listagem');
const telaFormulario = $('tela-formulario');
const btnNavListar = $('nav-listar');
const btnNavCadastrar = $('nav-cadastrar');

// Elementos do Formulário
const formPlano = $('form-plano');
const formTituloTela = $('form-titulo-tela');
const btnSalvar = $('btn-salvar');
const btnCancelar = $('btn-cancelar');
const btnIA = $('btn-ia');
const aiLoading = $('ai-loading');

// Elementos de Listagem
const formFiltros = $('form-filtros');
const tabelaCorpo = $('tabela-corpo');
const btnLimparFiltros = $('btn-limpar-filtros');
const btnAnt = $('btn-ant');
const btnProx = $('btn-prox');
const infoPaginacao = $('info-paginacao');
const totalPlanos = $('total-planos');
const paginaAtualLabel = $('pagina-atual-label');

// Elementos do modal
const btnImprimir = $('btn-imprimir');
const btnCompartilhar = $('btn-compartilhar');
const modalVisualizar = new bootstrap.Modal($('modalVisualizar'));

// ==========================================
// HELPERS
// ==========================================
function escapeHTML(valor = '') {
    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function textoSeguro(valor, fallback = 'Não informado') {
    const texto = String(valor ?? '').trim();
    return texto || fallback;
}

function formatarData(dataISO) {
    if (!dataISO || !dataISO.includes('-')) return 'Sem data';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

function resumirTexto(texto, limite = 96) {
    const valor = textoSeguro(texto, '');
    if (!valor) return 'Sem resumo cadastrado';
    return valor.length > limite ? `${valor.slice(0, limite).trim()}...` : valor;
}

function obterFiltros() {
    const [ordenarPor, ordem] = $('ordenar-por').value.split('-');
    return {
        titulo: $('busca-titulo').value.trim(),
        disciplina: $('filtro-disciplina').value.trim(),
        tags: $('filtro-tags').value.trim(),
        dataPrevista: $('filtro-data').value,
        ordenarPor,
        ordem
    };
}

function definirNavAtiva(tela) {
    const listando = tela === 'listagem';
    btnNavListar.classList.toggle('active', listando);
    btnNavCadastrar.classList.toggle('active', !listando);
}

function definirEstadoCarregandoIA(ativo) {
    aiLoading.classList.toggle('d-none', !ativo);
    btnIA.disabled = ativo;
}

function rolarParaTopo() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// SISTEMA DE NOTIFICAÇÕES
// ==========================================
function mostrarNotificacao(mensagem, tipo = 'success') {
    const toastContainer = $('toast-container') || criarToastContainer();
    const mapaTipos = {
        success: 'success',
        warning: 'warning',
        danger: 'danger',
        info: 'info'
    };

    const toastEl = document.createElement('div');
    toastEl.className = `alert alert-${mapaTipos[tipo] || 'success'} alert-dismissible fade show`;
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML = `
        <strong>SmartPlanner:</strong> ${escapeHTML(mensagem)}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
    `;

    toastContainer.appendChild(toastEl);

    setTimeout(() => {
        const alert = bootstrap.Alert.getOrCreateInstance(toastEl);
        alert.close();
    }, 4200);
}

function criarToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container-custom';
    document.body.appendChild(container);
    return container;
}

// ==========================================
// NAVEGAÇÃO DA SPA
// ==========================================
function mostrarListagem() {
    telaFormulario.classList.add('d-none');
    telaListagem.classList.remove('d-none');
    definirNavAtiva('listagem');
    carregarPlanos();
    rolarParaTopo();
}

function mostrarFormulario(modoEdicao = false) {
    telaListagem.classList.add('d-none');
    telaFormulario.classList.remove('d-none');
    definirNavAtiva('formulario');

    if (!modoEdicao) {
        formPlano.reset();
        $('plano-id').value = '';
        formTituloTela.innerText = 'Cadastrar Novo Plano';
        btnSalvar.innerHTML = '<i class="bi bi-check2-circle"></i> Salvar Plano';
    } else {
        formTituloTela.innerText = 'Editar Plano de Aula';
        btnSalvar.innerHTML = '<i class="bi bi-check2-circle"></i> Atualizar Plano';
    }

    rolarParaTopo();
}

btnNavListar.addEventListener('click', mostrarListagem);
btnNavCadastrar.addEventListener('click', () => mostrarFormulario(false));
btnCancelar.addEventListener('click', mostrarListagem);

// ==========================================
// INTEGRAÇÃO COM A INTELIGÊNCIA ARTIFICIAL
// ==========================================
btnIA.addEventListener('click', async () => {
    const titulo = $('titulo').value.trim();
    const disciplina = $('disciplina').value.trim();
    const ementa = $('ementa').value.trim();

    if (!titulo || !disciplina || !ementa) {
        mostrarNotificacao('Preencha Título, Disciplina e Ementa antes de chamar a IA.', 'warning');
        return;
    }

    definirEstadoCarregandoIA(true);

    try {
        const response = await fetch(`${API_URL}/smart-assist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, disciplina, ementa })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.erro || 'Erro desconhecido ao gerar recomendações.');
        }

        $('conteudos').value = data.conteudos_complementares || '';
        $('recursos_apoio').value = data.topicos_relacionados || '';
        $('tags').value = data.tags_recomendadas || '';
        mostrarNotificacao('Recomendações geradas com sucesso pela IA!', 'success');
    } catch (error) {
        console.error('Erro ao conectar com a IA:', error);
        mostrarNotificacao(error.message || 'Falha de comunicação com o servidor. Verifique se o backend está rodando.', 'danger');
    } finally {
        definirEstadoCarregandoIA(false);
    }
});

// ==========================================
// CRUD: LISTAR, FILTRAR E RENDERIZAR
// ==========================================
function renderizarEstadoTabela(tipo, mensagem) {
    removerTooltipsAbertos();

    const icones = {
        loading: 'bi-hourglass-split',
        empty: 'bi-journal-x',
        error: 'bi-exclamation-triangle'
    };

    tabelaCorpo.innerHTML = `
        <tr class="${tipo}-row">
            <td colspan="5">
                <div class="${tipo}-state">
                    ${tipo === 'loading' ? '<div class="spinner-border text-primary" role="status"></div>' : `<i class="bi ${icones[tipo]}"></i>`}
                    <span>${escapeHTML(mensagem)}</span>
                </div>
            </td>
        </tr>
    `;
}

function criarTagsHTML(tags) {
    const lista = String(tags || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);

    if (!lista.length) {
        return `
            <span class="tag-trigger tag-trigger-empty" title="Sem tags cadastradas">
                <i class="bi bi-tags"></i>
                <span>Tags</span>
            </span>
        `;
    }

    const tooltip = escapeHTML(lista.join(', '));

    return `
        <div class="tags-list tags-list-summary">
            <span
                class="tag-trigger"
                tabindex="0"
                role="button"
                data-bs-toggle="tooltip"
                data-bs-placement="top"
                data-bs-title="${tooltip}"
                title="${tooltip}"
                aria-label="Tags: ${tooltip}"
            >
                <i class="bi bi-tags"></i>
                <span>Tags</span>
            </span>
        </div>
    `;
}

function removerTooltipsAbertos() {
    document.querySelectorAll('.tooltip').forEach((tooltip) => tooltip.remove());
}

function inicializarTooltipsTabela() {
    tabelaCorpo.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((elemento) => {
        bootstrap.Tooltip.getOrCreateInstance(elemento, {
            container: 'body',
            trigger: 'hover focus'
        });
    });
}

function criarLinhaPlano(plano) {
    const tr = document.createElement('tr');
    tr.dataset.id = plano.id;

    const titulo = textoSeguro(plano.titulo);
    const disciplina = textoSeguro(plano.disciplina);
    const ementa = resumirTexto(plano.ementa, 88);
    const dataBr = formatarData(plano.data_prevista);

    tr.innerHTML = `
        <td class="plan-title-cell">
            <span class="plan-title" title="${escapeHTML(titulo)}">${escapeHTML(titulo)}</span>
            <span class="plan-subtitle" title="${escapeHTML(ementa)}">${escapeHTML(ementa)}</span>
        </td>
        <td>
            <span class="discipline-pill" title="${escapeHTML(disciplina)}">
                <i class="bi bi-bookmark-star"></i>
                <span>${escapeHTML(disciplina)}</span>
            </span>
        </td>
        <td>
            <span class="date-chip"><i class="bi bi-calendar-event"></i>${escapeHTML(dataBr)}</span>
        </td>
        <td>${criarTagsHTML(plano.tags)}</td>
        <td>
            <div class="table-actions" aria-label="Ações do plano ${escapeHTML(titulo)}">
                <button class="btn btn-sm btn-outline-info" type="button" data-action="visualizar" data-id="${plano.id}" title="Visualizar plano">
                    <i class="bi bi-eye"></i><span>Ver</span>
                </button>
                <button class="btn btn-sm btn-outline-primary" type="button" data-action="editar" data-id="${plano.id}" title="Editar plano">
                    <i class="bi bi-pencil-square"></i><span>Editar</span>
                </button>
                <button class="btn btn-sm btn-outline-danger" type="button" data-action="excluir" data-id="${plano.id}" title="Excluir plano">
                    <i class="bi bi-trash3"></i><span>Excluir</span>
                </button>
            </div>
        </td>
    `;

    return tr;
}

function atualizarResumo(data) {
    const totalPaginas = data.total_paginas || 1;
    const totalRegistros = data.total_registros || 0;
    const pagina = data.pagina_atual || paginaAtual;

    totalPlanos.innerText = totalRegistros;
    paginaAtualLabel.innerText = `${pagina}/${totalPaginas}`;
    infoPaginacao.innerText = `Mostrando página ${pagina} de ${totalPaginas} • Total: ${totalRegistros}`;
    btnAnt.disabled = pagina <= 1;
    btnProx.disabled = pagina >= totalPaginas;
}

async function carregarPlanos() {
    const filtros = obterFiltros();
    const queryParams = new URLSearchParams({
        page: paginaAtual,
        per_page: PLANOS_POR_PAGINA,
        ordenar_por: filtros.ordenarPor,
        ordem: filtros.ordem
    });

    if (filtros.titulo) queryParams.append('titulo', filtros.titulo);
    if (filtros.disciplina) queryParams.append('disciplina', filtros.disciplina);
    if (filtros.tags) queryParams.append('tags', filtros.tags);
    if (filtros.dataPrevista) queryParams.append('data_prevista', filtros.dataPrevista);

    renderizarEstadoTabela('loading', 'Carregando planos de aula...');

    try {
        const response = await fetch(`${API_URL}/planos?${queryParams.toString()}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.erro || 'Não foi possível carregar os planos.');
        }

        removerTooltipsAbertos();
        tabelaCorpo.innerHTML = '';
        planosCache = new Map();

        if (!data.planos || data.planos.length === 0) {
            renderizarEstadoTabela('empty', 'Nenhum plano de aula encontrado com os filtros atuais.');
        } else {
            data.planos.forEach((plano) => {
                planosCache.set(Number(plano.id), plano);
                tabelaCorpo.appendChild(criarLinhaPlano(plano));
            });
            inicializarTooltipsTabela();
        }

        atualizarResumo(data);
    } catch (error) {
        console.error('Erro ao carregar planos:', error);
        renderizarEstadoTabela('error', 'Erro ao carregar os dados. Verifique se o backend Flask está rodando.');
        atualizarResumo({ pagina_atual: paginaAtual, total_paginas: 1, total_registros: 0 });
    }
}

formFiltros.addEventListener('submit', (e) => {
    e.preventDefault();
    paginaAtual = 1;
    carregarPlanos();
});

btnLimparFiltros.addEventListener('click', () => {
    formFiltros.reset();
    paginaAtual = 1;
    carregarPlanos();
});

btnAnt.addEventListener('click', () => {
    if (paginaAtual > 1) {
        paginaAtual -= 1;
        carregarPlanos();
    }
});

btnProx.addEventListener('click', () => {
    paginaAtual += 1;
    carregarPlanos();
});

tabelaCorpo.addEventListener('click', (event) => {
    const botao = event.target.closest('button[data-action]');
    if (!botao) return;

    const id = Number(botao.dataset.id);
    const action = botao.dataset.action;

    if (action === 'visualizar') visualizarPlano(id);
    if (action === 'editar') carregarParaEdicao(id);
    if (action === 'excluir') excluirPlano(id);
});

// ==========================================
// CRUD: SALVAR
// ==========================================
function obterDadosFormulario() {
    return {
        titulo: $('titulo').value.trim(),
        disciplina: $('disciplina').value.trim(),
        data_prevista: $('data_prevista').value,
        ementa: $('ementa').value.trim(),
        objetivo: $('objetivo').value.trim(),
        conteudos: $('conteudos').value.trim(),
        recursos_apoio: $('recursos_apoio').value.trim(),
        tags: $('tags').value.trim()
    };
}

formPlano.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = $('plano-id').value;
    const metodo = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/planos/${id}` : `${API_URL}/planos`;
    const dadosPlano = obterDadosFormulario();

    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Salvando...';

    try {
        const response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosPlano)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.erro || 'Erro ao salvar o plano.');
        }

        mostrarNotificacao(id ? 'Plano atualizado com sucesso!' : 'Plano cadastrado com sucesso!', 'success');
        mostrarListagem();
    } catch (error) {
        console.error('Erro ao salvar plano:', error);
        mostrarNotificacao(error.message || 'Erro ao se comunicar com o servidor.', 'danger');
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = id ? '<i class="bi bi-check2-circle"></i> Atualizar Plano' : '<i class="bi bi-check2-circle"></i> Salvar Plano';
    }
});

// ==========================================
// CRUD: VISUALIZAR, EDITAR E EXCLUIR
// ==========================================
async function obterPlanoPorId(id) {
    if (planosCache.has(Number(id))) {
        return planosCache.get(Number(id));
    }

    // Fallback compatível com o backend atual, que ainda não possui GET /planos/:id.
    const response = await fetch(`${API_URL}/planos?page=1&per_page=1000&ordenar_por=data_cadastro&ordem=desc`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.erro || 'Não foi possível buscar os dados do plano.');
    }

    const plano = (data.planos || []).find((item) => Number(item.id) === Number(id));
    if (!plano) {
        throw new Error('Plano não encontrado na listagem retornada pelo backend.');
    }

    planosCache.set(Number(plano.id), plano);
    return plano;
}

function preencherModalVisualizacao(plano) {
    $('vis-titulo').innerText = textoSeguro(plano.titulo);
    $('vis-disciplina').innerText = textoSeguro(plano.disciplina);
    $('vis-data').innerText = formatarData(plano.data_prevista);
    $('vis-ementa').innerText = textoSeguro(plano.ementa);
    $('vis-objetivo').innerText = textoSeguro(plano.objetivo);
    $('vis-conteudos').innerText = textoSeguro(plano.conteudos);
    $('vis-recursos').innerText = textoSeguro(plano.recursos_apoio);
    $('vis-tags').innerText = textoSeguro(plano.tags);
}

window.visualizarPlano = async (id) => {
    try {
        const plano = await obterPlanoPorId(id);
        preencherModalVisualizacao(plano);
        modalVisualizar.show();
    } catch (error) {
        console.error('Erro ao carregar dados para visualização:', error);
        mostrarNotificacao(error.message || 'Erro ao carregar o plano para visualização.', 'danger');
    }
};

window.carregarParaEdicao = async (id) => {
    try {
        const plano = await obterPlanoPorId(id);

        $('plano-id').value = plano.id;
        $('titulo').value = plano.titulo || '';
        $('disciplina').value = plano.disciplina || '';
        $('data_prevista').value = plano.data_prevista || '';
        $('ementa').value = plano.ementa || '';
        $('objetivo').value = plano.objetivo || '';
        $('conteudos').value = plano.conteudos || '';
        $('recursos_apoio').value = plano.recursos_apoio || '';
        $('tags').value = plano.tags || '';

        mostrarFormulario(true);
    } catch (error) {
        console.error('Erro ao carregar dados para edição:', error);
        mostrarNotificacao(error.message || 'Erro ao carregar o plano para edição.', 'danger');
    }
};

window.excluirPlano = async (id) => {
    const plano = planosCache.get(Number(id));
    const nomePlano = plano ? ` "${plano.titulo}"` : '';

    if (!confirm(`Tem certeza que deseja excluir o plano${nomePlano}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/planos/${id}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.erro || 'Erro ao excluir o plano.');
        }

        mostrarNotificacao('Plano excluído com sucesso!', 'success');
        carregarPlanos();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        mostrarNotificacao(error.message || 'Erro ao se comunicar com o servidor.', 'danger');
    }
};

// ==========================================
// IMPRESSÃO E COMPARTILHAMENTO
// ==========================================
function obterTextoPlanoVisualizado() {
    return [
        `Título: ${$('vis-titulo').innerText}`,
        `Disciplina: ${$('vis-disciplina').innerText}`,
        `Data: ${$('vis-data').innerText}`,
        '',
        'Ementa/Resumo',
        $('vis-ementa').innerText,
        '',
        'Objetivo',
        $('vis-objetivo').innerText,
        '',
        'Conteúdos Complementares',
        $('vis-conteudos').innerText,
        '',
        'Recursos de Apoio',
        $('vis-recursos').innerText,
        '',
        'Tags Recomendadas',
        $('vis-tags').innerText
    ].join('\n');
}

function obterDadosPlanoVisualizado() {
    return {
        titulo: $('vis-titulo').innerText,
        disciplina: $('vis-disciplina').innerText,
        data: $('vis-data').innerText,
        ementa: $('vis-ementa').innerText,
        objetivo: $('vis-objetivo').innerText,
        conteudos: $('vis-conteudos').innerText,
        recursos: $('vis-recursos').innerText,
        tags: $('vis-tags').innerText
    };
}

btnImprimir.addEventListener('click', () => {
    const plano = obterDadosPlanoVisualizado();
    const nomeInstituicao = 'Instituição de Ensino XYZ';
    const rodapeInstituicao = 'Plano gerado pelo SmartPlanner';
    const janelaImpressao = window.open('', '_blank', 'width=900,height=700');

    if (!janelaImpressao) {
        mostrarNotificacao('O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.', 'warning');
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
                    min-height: 100vh;
                    margin: 0 auto;
                    padding: 32px;
                    background: #fff;
                }
                .print-header {
                    padding-bottom: 18px;
                    margin-bottom: 24px;
                    border-bottom: 5px solid #465cf5;
                }
                .school-name {
                    margin-bottom: 8px;
                    color: #465cf5;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                }
                .document-title {
                    margin: 0;
                    color: #101828;
                    font-size: 30px;
                    line-height: 1.1;
                }
                .document-subtitle {
                    margin: 8px 0 0;
                    color: #667085;
                    font-size: 14px;
                }
                .meta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                    margin-bottom: 24px;
                }
                .meta-card,
                .section {
                    border: 1px solid #e4e7ec;
                    border-radius: 14px;
                    background: #fff;
                }
                .meta-card {
                    padding: 14px 16px;
                    background: #f8fafc;
                }
                .meta-label {
                    display: block;
                    margin-bottom: 6px;
                    color: #667085;
                    font-size: 11px;
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }
                .meta-value {
                    color: #101828;
                    font-size: 16px;
                    font-weight: 800;
                    word-break: break-word;
                }
                .section {
                    padding: 18px 20px;
                    margin-top: 16px;
                    page-break-inside: avoid;
                }
                .section h2 {
                    margin: 0 0 10px;
                    color: #101828;
                    font-size: 16px;
                }
                .section p {
                    margin: 0;
                    color: #344054;
                    line-height: 1.6;
                    white-space: pre-wrap;
                    word-break: break-word;
                }
                .footer {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    margin-top: 28px;
                    padding-top: 14px;
                    border-top: 1px solid #d0d5dd;
                    color: #667085;
                    font-size: 12px;
                }
                .footer strong { color: #344054; }
                @media print {
                    body { background: #fff; }
                    .page { padding: 24px 28px; }
                }
            </style>
        </head>
        <body>
            <div class="page">
                <header class="print-header">
                    <div class="school-name">${escapeHTML(nomeInstituicao)}</div>
                    <h1 class="document-title">${escapeHTML(plano.titulo)}</h1>
                    <p class="document-subtitle">Plano de aula para impressão e arquivamento</p>
                </header>

                <div class="meta-grid">
                    <div class="meta-card">
                        <span class="meta-label">Disciplina</span>
                        <div class="meta-value">${escapeHTML(plano.disciplina)}</div>
                    </div>
                    <div class="meta-card">
                        <span class="meta-label">Data prevista</span>
                        <div class="meta-value">${escapeHTML(plano.data)}</div>
                    </div>
                </div>

                <section class="section"><h2>Ementa/Resumo</h2><p>${escapeHTML(plano.ementa)}</p></section>
                <section class="section"><h2>Objetivo</h2><p>${escapeHTML(plano.objetivo)}</p></section>
                <section class="section"><h2>Conteúdos Complementares</h2><p>${escapeHTML(plano.conteudos)}</p></section>
                <section class="section"><h2>Recursos de Apoio</h2><p>${escapeHTML(plano.recursos)}</p></section>
                <section class="section"><h2>Tags Recomendadas</h2><p>${escapeHTML(plano.tags)}</p></section>

                <footer class="footer">
                    <div><strong>${escapeHTML(nomeInstituicao)}</strong></div>
                    <div>${escapeHTML(rodapeInstituicao)}</div>
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
                title: $('vis-titulo').innerText,
                text: textoPlano
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Erro ao compartilhar:', error);
                mostrarNotificacao('Não foi possível compartilhar este plano.', 'danger');
            }
        }
        return;
    }

    try {
        await navigator.clipboard.writeText(textoPlano);
        mostrarNotificacao('Resumo copiado para a área de transferência.', 'success');
    } catch (error) {
        console.error('Erro ao copiar para a área de transferência:', error);
        mostrarNotificacao('O navegador não suporta compartilhamento nem cópia automática.', 'danger');
    }
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
carregarPlanos();
