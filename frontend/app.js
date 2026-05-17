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