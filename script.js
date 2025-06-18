/**
 * Sanitiza entradas de texto para prevenir XSS
 * @param {string} input - Texto a ser sanitizado
 * @returns {string} - Texto limpo
 */
function sanitizeInput(input) {
    if (!input) return '';
    const div = document.createElement('div');
    div.textContent = input;
    let sanitized = div.innerHTML
        .replace(/[<>&"']/g, '')
        .replace(/[^\w\s.-]/g, '')
        .trim()
        .substring(0, 50);
    return sanitized;
}

// Configurações
const CONFIG = {
    API_BASE_URL: 'http://localhost:3000/api',
    DEBOUNCE_DELAY: 300,
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutos
    ANIMATION_DURATION: 300,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

// Estado Global
const appState = {
    tierData: new Map(),
    mapModifiers: new Map([['default', 1.0]]),
    selectedMap: 'default',
    currentCategory: 'farm',
    searchQuery: '',
    cache: new Map(),
    lastCacheUpdate: 0,
    isLoading: false,
    retryCount: 0,
    categories: ['farm', 'pvp', 'solo', 'support']
};

// Elementos DOM
const dom = {
    loader: document.getElementById('loader'),
    confirmationModal: document.getElementById('confirmationModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalInput: document.getElementById('modalInput'),
    confirmModalBtn: document.getElementById('confirmModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    categorySelect: document.getElementById('category'),
    mpmInput: document.getElementById('mpmInput'),
    addClassForm: document.getElementById('addClassForm'),
    addMapForm: document.getElementById('addMapForm'),
    messageDiv: document.getElementById('message'),
    mapSelect: document.getElementById('mapSelect'),
    existingMapsList: document.getElementById('existingMapsList'),
    tierlistDiv: document.getElementById('tierlist'),
    searchInput: document.getElementById('searchInput'),
    exportBtn: document.getElementById('exportBtn'),
    importInput: document.getElementById('importInput'),
    themeToggle: document.getElementById('themeToggle'),
    categoryButtons: document.querySelectorAll('.category-btn'),
    classNameInput: document.getElementById('className'),
    tierSelect: document.getElementById('tier')
};

/**
 * Cria uma função com debounce
 * @param {Function} func - Função a ser executada
 * @param {number} wait - Tempo de espera em milissegundos
 * @returns {Function} - Função com debounce
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Função para tentar novamente uma operação que falhou
 * @param {Function} operation - Operação a ser retentada
 * @param {number} maxRetries - Número máximo de tentativas
 * @returns {Promise<any>}
 */
async function retryOperation(operation, maxRetries = CONFIG.MAX_RETRIES) {
    try {
        return await operation();
    } catch (error) {
        if (appState.retryCount < maxRetries) {
            appState.retryCount++;
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            return retryOperation(operation, maxRetries);
        }
        throw error;
    }
}

/**
 * Mostra o loader com animação suave
 */
const showLoader = () => {
    dom.loader.classList.remove('hidden');
    dom.loader.classList.add('opacity-100');
    dom.loader.classList.remove('opacity-0');
};

/**
 * Esconde o loader com animação suave
 */
const hideLoader = () => {
    dom.loader.classList.add('opacity-0');
    dom.loader.classList.remove('opacity-100');
    setTimeout(() => {
        dom.loader.classList.add('hidden');
    }, CONFIG.ANIMATION_DURATION);
};

/**
 * Manipula o envio do formulário de classes
 * @param {Event} e - Evento do formulário
 */
async function handleClassSubmit(e) {
    e.preventDefault();
    showLoader();
    
    try {
        const formData = new FormData(e.target);
        const classNameInput = dom.addClassForm.querySelector('#className').value;
        const className = sanitizeInput(classNameInput?.trim().substring(0, 50) || '');

        // Captura o valor de category diretamente do elemento select
        const categoryFromSelect = dom.categorySelect.value;
        const category = categoryFromSelect || 'farm';

        // Captura o valor do tier diretamente do elemento select
        const tierSelect = dom.addClassForm.querySelector('#tier');
        const tier = tierSelect.value;

        const mpmValue = formData.get('mpmInput') || '0';

        if (!className) {
            throw new Error('Nome da classe é obrigatório');
        }

        const mpm = category === 'farm' ? parseFloat(mpmValue) : 0;
        if (isNaN(mpm) || mpm < 0) {
            throw new Error('MPM deve ser um número válido');
        }

        console.log('Enviando dados:', { name: className, category, tier, mpm });

        const response = await fetch(`${CONFIG.API_BASE_URL}/classes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: className, category, tier, mpm })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao salvar classe');
        }

        showMessage('Classe adicionada com sucesso!', 'success');
        e.target.reset();
        appState.cache.clear();
        await loadData();
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Manipula o envio do formulário de mapas
 * @param {Event} e - Evento do formulário
 */
async function handleMapSubmit(e) {
    e.preventDefault();
    showLoader();
    
    try {
        const formData = new FormData(e.target);
        const mapName = sanitizeInput(formData.get('mapName')?.trim().substring(0, 50) || '');
        const modifier = parseFloat(formData.get('mapModifier') || 1.0);

        if (!mapName) {
            throw new Error('Nome do mapa é obrigatório');
        }

        if (isNaN(modifier) || modifier < 0) {
            throw new Error('Multiplicador inválido');
        }

        const response = await fetch(`${CONFIG.API_BASE_URL}/maps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: mapName, modifier })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao salvar mapa');
        }

        showMessage('Mapa adicionado com sucesso!', 'success');
        e.target.reset();
        appState.cache.clear();
        await loadData();
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Mostra uma mensagem ao usuário com animação
 * @param {string} text - Texto da mensagem
 * @param {string} type - Tipo (info, success, warning, error)
 */
function showMessage(text, type = 'info') {
    const types = {
        info: 'text-blue-400 bg-blue-50 dark:bg-blue-900/20',
        success: 'text-green-400 bg-green-50 dark:bg-green-900/20',
        warning: 'text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
        error: 'text-red-400 bg-red-50 dark:bg-red-900/20'
    };
    
    dom.messageDiv.textContent = text;
    dom.messageDiv.className = `mb-4 text-center text-sm transition-all duration-300 ${types[type]} p-3 rounded-lg shadow-lg`;
    dom.messageDiv.classList.remove('opacity-0');
    
    setTimeout(() => {
        dom.messageDiv.classList.add('opacity-0');
    }, 3000);
}

/**
 * Carrega os dados do servidor
 */
async function loadData() {
    try {
        showLoader();
        const response = await fetch(`${CONFIG.API_BASE_URL}/classes`);
        if (!response.ok) {
            throw new Error('Erro ao carregar dados do servidor');
        }
        
        const { data } = await response.json();
        appState.tierData = convertToNestedMap(data);
        
        // Sincroniza com a lista de encantamentos ao carregar
        await syncClassesWithEnchants();
        
        // Atualiza a interface com os dados carregados
        updateUI();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        showMessage('Erro ao carregar dados. Tente recarregar a página.', 'error');
        appState.tierData = new Map();
    } finally {
        hideLoader();
    }
}

/**
 * Converte dados para Map aninhado
 * @param {Object} data - Dados da API
 * @returns {Map}
 */
function convertToNestedMap(data) {
    const result = new Map();
    
    Object.entries(data).forEach(([category, tiers]) => {
        const categoryMap = new Map();
        Object.entries(tiers).forEach(([tier, classes]) => {
            categoryMap.set(tier, classes);
        });
        result.set(category, categoryMap);
    });
    
    return result;
}

/**
 * Atualiza a interface com os dados atuais
 */
function updateUI() {
    // Atualiza o select de mapas
    updateMapSelect();
    
    // Atualiza a lista de mapas existentes
    displayMapManagement();
    
    // Mostra a categoria atual
    showCategory(appState.currentCategory);
}

/**
 * Atualiza o seletor de mapas
 */
function updateMapSelect() {
    dom.mapSelect.innerHTML = '<option value="default">Padrão (1.0x)</option>';
    appState.mapModifiers.forEach((mod, name) => {
        if (name !== 'default') {
            dom.mapSelect.innerHTML += `<option value="${name}">${name} (${mod.toFixed(1)}x)</option>`;
        }
    });
    dom.mapSelect.value = appState.selectedMap;
}

/**
 * Exibe o gerenciamento de mapas
 */
function displayMapManagement() {
    dom.existingMapsList.innerHTML = '';
    appState.mapModifiers.forEach((mod, name) => {
        if (name === 'default') return;
        
        const mapItem = document.createElement('div');
        mapItem.className = 'map-item bg-gray-700 p-3 rounded flex justify-between items-center';
        mapItem.innerHTML = `
            <span>${name} (${mod.toFixed(1)}x)</span>
            <div class="flex space-x-2">
                <button class="edit-map-btn text-yellow-400 hover:text-yellow-600" data-map="${name}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-map-btn text-red-400 hover:text-red-600" data-map="${name}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        dom.existingMapsList.appendChild(mapItem);
    });
}

/**
 * Mostra as classes de uma categoria específica
 * @param {string} category - Categoria a ser mostrada
 */
function showCategory(category) {
    if (!category || !appState.categories.includes(category)) {
        console.error('Categoria inválida:', category);
        return;
    }
    
    appState.currentCategory = category;
    
    // Limpa a tierlist
    dom.tierlistDiv.innerHTML = '';
    
    // Obtém as classes da categoria
    const categoryData = appState.tierData.get(category) || new Map();
    
    // Filtra as classes se houver uma busca
    const filteredData = new Map();
    categoryData.forEach((classes, tier) => {
        const filteredClasses = filterClasses(classes);
        if (filteredClasses.length > 0) {
            filteredData.set(tier, filteredClasses);
        }
    });
    
    // Renderiza cada tier
    const tiers = ['S', 'A', 'B', 'C', 'D'];
    tiers.forEach(tier => {
        const classes = filteredData.get(tier) || [];
        const section = renderTierSection(tier, classes);
        if (section) {
            dom.tierlistDiv.innerHTML += section;
        }
    });
    
    // Atualiza o estilo dos botões de categoria
    dom.categoryButtons.forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.remove('bg-gray-700');
            btn.classList.add('bg-blue-600');
        } else {
            btn.classList.remove('bg-blue-600');
            btn.classList.add('bg-gray-700');
        }
    });
}

/**
 * Filtra as classes com base na busca atual
 * @param {Array} classes - Lista de classes a ser filtrada
 * @returns {Array} - Lista filtrada
 */
function filterClasses(classes) {
    if (!appState.searchQuery) return classes;
    
    const query = appState.searchQuery.toLowerCase();
    return classes.filter(cls => 
        cls.name.toLowerCase().includes(query)
    );
}

/**
 * Obtém a cor correspondente ao tier
 * @param {string} tier - Nome do tier
 * @returns {string} - Cor do tier
 */
function getTierColor(tier) {
    switch (tier) {
        case 'S':
            return 'red-500';
        case 'A':
            return 'orange-500';
        case 'B':
            return 'yellow-500';
        case 'C':
            return 'green-500';
        case 'D':
            return 'blue-500';
        default:
            return 'gray-500';
    }
}

/**
 * Renderiza uma seção de tier
 * @param {string} tier - Nome do tier
 * @param {Array} classes - Lista de classes
 */
function renderTierSection(tier, classes) {
    if (!classes || classes.length === 0) return '';

    return `
        <div class="mb-6">
            <h3 class="text-2xl font-bold mb-4 text-${getTierColor(tier)}">Tier ${tier}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${classes.map(cls => `
                    <div class="bg-gray-800 p-4 rounded-lg shadow-lg hover:bg-gray-700 transition-colors duration-300">
                        <div class="flex justify-between items-center">
                            <h4 class="text-lg font-semibold text-white">${cls.name}</h4>
                            <div class="flex space-x-2">
                                <button class="edit-class-btn p-2 text-blue-400 hover:text-blue-300 transition-colors duration-300" 
                                    data-class="${cls.name}" 
                                    data-tier="${tier}"
                                    title="Editar classe">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="remove-class-btn p-2 text-red-400 hover:text-red-300 transition-colors duration-300"
                                    data-class="${cls.name}"
                                    title="Remover classe">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        ${cls.mpm ? `<p class="text-gray-400 mt-2">MPM: ${cls.mpm}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Manipula a remoção de uma classe
 * @param {string} className - Nome da classe
 */
async function handleRemoveClass(className) {
    try {
        showLoader();
        const response = await fetch(`${CONFIG.API_BASE_URL}/classes/${encodeURIComponent(className)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Erro ao remover classe');
        }

        // Atualiza os dados locais
        const category = appState.currentCategory;
        const categoryData = appState.tierData.get(category);
        if (categoryData) {
            for (const [tier, classes] of categoryData.entries()) {
                const index = classes.findIndex(cls => cls.name === className);
                if (index !== -1) {
                    classes.splice(index, 1);
                    break;
                }
            }
        }

        // Sincroniza com a lista de encantamentos
        await syncClassesWithEnchants();
        
        // Atualiza a interface
        showCategory(category);
        
        // Mostra notificação
        showMessage('Classe removida com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao remover classe:', error);
        showMessage('Erro ao remover classe. Tente novamente.', 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Manipula a edição de uma classe
 * @param {string} className - Nome da classe
 * @param {string} currentTier - Tier atual
 */
async function handleEditClass(className, currentTier) {
    try {
        const category = appState.currentCategory;
        const categoryData = appState.tierData.get(category);
        if (!categoryData) return;
        
        const classes = categoryData.get(currentTier);
        if (!classes) return;
        
        const classData = classes.find(cls => cls.name === className);
        if (!classData) return;
        
        // Preenche o formulário com os dados da classe
        dom.classNameInput.value = classData.name;
        dom.tierSelect.value = currentTier;
        dom.mpmInput.value = classData.mpm || '';
        
        // Foca no campo de nome para facilitar a edição
        dom.classNameInput.focus();
        
        // Rola até o formulário
        dom.addClassForm.scrollIntoView({ behavior: 'smooth' });
        
        // Mostra notificação
        showMessage('Edite os campos e clique em "Adicionar Classe" para salvar as alterações', 'info');
    } catch (error) {
        console.error('Erro ao editar classe:', error);
        showMessage('Erro ao editar classe. Tente novamente.', 'error');
    }
}

/**
 * Mostra o modal de confirmação
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {boolean} isPrompt - Se é um prompt de entrada
 * @param {string} defaultValue - Valor padrão
 * @returns {Promise}
 */
function showModal(title, message, isPrompt = false, defaultValue = '') {
    return new Promise((resolve) => {
        modalResolve = resolve;
        dom.modalTitle.textContent = title;
        dom.modalMessage.textContent = message;
        dom.modalInput.value = defaultValue;
        dom.modalInput.classList.toggle('hidden', !isPrompt);
        dom.confirmationModal.classList.remove('hidden');
    });
}

let modalResolve;

/**
 * Manipula a confirmação do modal
 */
function handleModalConfirm() {
    dom.confirmationModal.classList.add('hidden');
    if (typeof modalResolve === 'function') {
        const value = dom.modalInput.classList.contains('hidden') 
            ? true 
            : dom.modalInput.value;
        modalResolve(value);
    }
}

/**
 * Manipula o cancelamento do modal
 */
function handleModalCancel() {
    dom.confirmationModal.classList.add('hidden');
    if (typeof modalResolve === 'function') {
        modalResolve(false);
    }
}

/**
 * Exporta os dados da tier list para um arquivo JSON
 */
async function handleExport() {
    try {
        showLoader();
        const data = {
            classes: Array.from(appState.tierData.entries()).reduce((acc, [category, tiers]) => {
                acc[category] = tiers;
                return acc;
            }, {}),
            maps: Object.fromEntries(appState.mapModifiers)
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aqw-tierlist-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage('Tier list exportada com sucesso!', 'success');
    } catch (error) {
        showMessage('Erro ao exportar tier list: ' + error.message, 'error');
        console.error('Erro na exportação:', error);
    } finally {
        hideLoader();
    }
}

/**
 * Importa dados de um arquivo JSON para a tier list
 * @param {Event} e - Evento do input file
 */
async function handleImport(e) {
    try {
        const file = e.target.files[0];
        if (!file) return;

        showLoader();
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.classes || !data.maps) {
            throw new Error('Formato de arquivo inválido');
        }

        // Importar mapas
        const mapsResponse = await fetch(`${CONFIG.API_BASE_URL}/maps/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.entries(data.maps).map(([name, modifier]) => ({ name, modifier })))
        });

        if (!mapsResponse.ok) {
            throw new Error('Erro ao importar mapas');
        }

        // Importar classes
        for (const [category, tiers] of Object.entries(data.classes)) {
            for (const [tier, classes] of Object.entries(tiers)) {
                for (const classData of classes) {
                    const response = await fetch(`${CONFIG.API_BASE_URL}/classes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: classData.name,
                            category,
                            tier,
                            mpm: classData.mpm || 0
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Erro ao importar classe ${classData.name}`);
                    }
                }
            }
        }

        showMessage('Tier list importada com sucesso!', 'success');
        appState.cache.clear();
        await loadData();
    } catch (error) {
        showMessage('Erro ao importar tier list: ' + error.message, 'error');
        console.error('Erro na importação:', error);
    } finally {
        hideLoader();
        e.target.value = ''; // Limpa o input file
    }
}

/**
 * Adiciona uma nova classe à tierlist
 * @param {string} name - Nome da classe
 * @param {string} tier - Tier da classe
 * @param {number} mpm - MPM da classe (opcional)
 */
function addClass(name, tier, mpm = null) {
    if (!name || !tier) return;
    
    const category = appState.currentCategory;
    if (!category) return;
    
    // Garante que a categoria existe no tierData
    if (!appState.tierData.has(category)) {
        appState.tierData.set(category, new Map());
    }
    
    // Garante que o tier existe na categoria
    const categoryData = appState.tierData.get(category);
    if (!categoryData.has(tier)) {
        categoryData.set(tier, []);
    }
    
    // Verifica se a classe já existe em algum tier
    let existingClass = null;
    let existingTier = null;
    
    for (const [t, classes] of categoryData.entries()) {
        const found = classes.find(cls => cls.name === name);
        if (found) {
            existingClass = found;
            existingTier = t;
            break;
        }
    }
    
    // Se a classe existe, remove ela do tier antigo
    if (existingClass) {
        const oldClasses = categoryData.get(existingTier);
        const index = oldClasses.findIndex(cls => cls.name === name);
        if (index !== -1) {
            oldClasses.splice(index, 1);
        }
    }
    
    // Adiciona a nova classe
    const newClass = {
        name: name,
        mpm: mpm ? parseFloat(mpm) : null
    };
    
    categoryData.get(tier).push(newClass);
    
    // Salva os dados
    saveData();
    
    // Sincroniza com a lista de encantamentos
    await syncClassesWithEnchants();
    
    // Atualiza a interface
    showCategory(category);
    
    // Mostra notificação de sucesso
    showNotification(
        existingClass 
            ? 'Classe atualizada com sucesso!' 
            : 'Classe adicionada com sucesso!', 
        'success'
    );
}

/**
 * Salva os dados no localStorage
 */
function saveData() {
    const data = {};
    appState.tierData.forEach((categoryMap, category) => {
        data[category] = {};
        categoryMap.forEach((classes, tier) => {
            data[category][tier] = classes;
        });
    });
    
    localStorage.setItem('tierData', JSON.stringify(data));
}

/**
 * Inicializa a aplicação
 */
function init() {
    // Carrega os dados salvos
    loadData();
    
    // Configura os event listeners
    setupEventListeners();
    
    // Mostra a primeira categoria por padrão
    showCategory(appState.currentCategory);
}

// Inicia a aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', init);

/**
 * Configura os event listeners da aplicação
 */
function setupEventListeners() {
    // Event listeners para os botões de categoria
    dom.categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;
            if (category && appState.categories.includes(category)) {
                showCategory(category);
            }
        });
    });
    
    // Event listener para o formulário de adicionar classe
    if (dom.addClassForm) {
        dom.addClassForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!dom.classNameInput || !dom.tierSelect) {
                console.error('Elementos do formulário não encontrados');
                return;
            }
            
            const name = dom.classNameInput.value.trim();
            const tier = dom.tierSelect.value;
            const mpm = dom.mpmInput ? dom.mpmInput.value.trim() : null;
            
            if (!name || !tier) {
                showNotification('Por favor, preencha todos os campos obrigatórios.', 'error');
                return;
            }
            
            addClass(name, tier, mpm);
            
            // Limpa o formulário
            dom.addClassForm.reset();
        });
    }
    
    // Event listener para a busca
    if (dom.searchInput) {
        dom.searchInput.addEventListener('input', debounce(() => {
            appState.searchQuery = dom.searchInput.value.trim();
            if (appState.currentCategory) {
                showCategory(appState.currentCategory);
            }
        }));
    }
    
    // Event listeners para edição e remoção de classes
    if (dom.tierlistDiv) {
        dom.tierlistDiv.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-class-btn');
            const removeBtn = e.target.closest('.remove-class-btn');
            
            if (editBtn) {
                const className = editBtn.dataset.class;
                const tier = editBtn.dataset.tier;
                if (className && tier) {
                    handleEditClass(className, tier);
                }
            } else if (removeBtn) {
                const className = removeBtn.dataset.class;
                if (className) {
                    handleRemoveClass(className);
                }
            }
        });
    }
}

/**
 * Mostra uma notificação para o usuário
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo da notificação (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    // Cria o elemento da notificação
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full opacity-0 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    } text-white`;
    
    // Adiciona o ícone
    const icon = document.createElement('i');
    icon.className = `fas ${
        type === 'success' ? 'fa-check-circle' :
        type === 'error' ? 'fa-exclamation-circle' :
        type === 'warning' ? 'fa-exclamation-triangle' :
        'fa-info-circle'
    } mr-2`;
    
    // Adiciona a mensagem
    const text = document.createElement('span');
    text.textContent = message;
    
    // Monta a notificação
    notification.appendChild(icon);
    notification.appendChild(text);
    
    // Adiciona ao DOM
    document.body.appendChild(notification);
    
    // Anima a entrada
    requestAnimationFrame(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    });
    
    // Remove após 3 segundos
    setTimeout(() => {
        notification.style.transform = 'translateX(full)';
        notification.style.opacity = '0';
        
        // Remove do DOM após a animação
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

/**
 * Sincroniza as classes da tierlist com a lista de encantamentos
 */
async function syncClassesWithEnchants() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/classes`);
        if (!response.ok) {
            throw new Error('Erro ao buscar classes');
        }
        
        const { data } = await response.json();
        
        // Obtém todas as classes de todas as categorias e tiers
        const allClasses = new Set();
        
        Object.entries(data).forEach(([category, tiers]) => {
            Object.entries(tiers).forEach(([tier, classes]) => {
                classes.forEach(cls => allClasses.add(cls.name));
            });
        });
        
        // Salva a lista de classes no localStorage para cache
        localStorage.setItem('availableClasses', JSON.stringify(Array.from(allClasses)));
    } catch (error) {
        console.error('Erro ao sincronizar classes:', error);
        showMessage('Erro ao sincronizar classes. Tente recarregar a página.', 'error');
    }
}