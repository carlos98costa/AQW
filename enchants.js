/**
 * Configurações
 */
const CONFIG = {
    API_BASE_URL: 'http://localhost:3000/api',
    DEBOUNCE_DELAY: 300
};

/**
 * Cache de Elementos DOM
 */
const dom = {
    loader: document.getElementById('loader'),
    messageDiv: document.getElementById('message'),
    classSelect: document.getElementById('classSelect'),
    enchantmentsDiv: document.getElementById('enchantments'),
    weaponEnchant: document.getElementById('weaponEnchant'),
    classEnchant: document.getElementById('classEnchant'),
    helmEnchant: document.getElementById('helmEnchant'),
    capeEnchant: document.getElementById('capeEnchant'),
    editEnchantModal: document.getElementById('editEnchantModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalInput: document.getElementById('modalInput'),
    confirmModalBtn: document.getElementById('confirmModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    createEnchantBtnContainer: document.getElementById('createEnchantBtnContainer'),
    createEnchantBtn: document.getElementById('createEnchantBtn'),
    createEnchantModal: document.getElementById('createEnchantModal'),
    createModalTitle: document.getElementById('createModalTitle'),
    createWeaponInput: document.getElementById('createWeaponInput'),
    createClassInput: document.getElementById('createClassInput'),
    createHelmInput: document.getElementById('createHelmInput'),
    createCapeInput: document.getElementById('createCapeInput'),
    confirmCreateModalBtn: document.getElementById('confirmCreateModalBtn'),
    cancelCreateModalBtn: document.getElementById('cancelCreateModalBtn')
};

/**
 * Sanitiza entradas de texto para prevenir XSS
 * @param {string} input - Texto a ser sanitizado
 * @returns {string} - Texto limpo
 */
function sanitizeInput(input) {
    if (!input) return '';
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML
        .replace(/[<>&"']/g, '')
        .replace(/[^\w\s.-]/g, '')
        .trim()
        .substring(0, 50);
}

/**
 * Mostra o loader
 */
const showLoader = () => {
    dom.loader.classList.remove('hidden');
};

/**
 * Esconde o loader
 */
const hideLoader = () => {
    dom.loader.classList.add('hidden');
};

/**
 * Mostra uma mensagem ao usuário
 * @param {string} text - Texto da mensagem
 * @param {string} type - Tipo (info, success, warning, error)
 */
function showMessage(text, type = 'info') {
    const types = {
        info: 'text-blue-400 bg-blue-50',
        success: 'text-green-400 bg-green-50',
        warning: 'text-yellow-400 bg-yellow-50',
        error: 'text-red-400 bg-red-50'
    };
    
    dom.messageDiv.textContent = text;
    dom.messageDiv.className = `mb-6 p-4 rounded-lg ${types[type]} transition-all duration-300 opacity-100`;
    dom.messageDiv.classList.remove('hidden');
    setTimeout(() => {
        dom.messageDiv.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => dom.messageDiv.classList.add('hidden'), 300);
    }, 4000);
}

/**
 * Carrega classes do localStorage
 */
function loadClasses() {
    try {
        // Tenta carregar as classes do localStorage
        const savedClasses = localStorage.getItem('availableClasses');
        if (savedClasses) {
            const classes = JSON.parse(savedClasses);
            
            // Limpa o select
            dom.classSelect.innerHTML = '<option value="">Escolha uma classe</option>';
            
            // Adiciona as classes ordenadas
            classes.sort().forEach(className => {
                const option = document.createElement('option');
                option.value = className;
                option.textContent = className;
                dom.classSelect.appendChild(option);
            });
            
            return;
        }
        
        // Se não houver classes salvas, mostra mensagem
        dom.classSelect.innerHTML = '<option value="">Nenhuma classe disponível</option>';
        showMessage('Nenhuma classe encontrada. Adicione classes na tierlist primeiro.', 'warning');
    } catch (error) {
        console.error('Erro ao carregar classes:', error);
        dom.classSelect.innerHTML = '<option value="">Erro ao carregar classes</option>';
        showMessage('Erro ao carregar classes. Tente recarregar a página.', 'error');
    }
}

/**
 * Carrega e atualiza encantamentos para a classe selecionada
 * @param {string} className - Nome da classe
 */
async function loadEnchantments(className) {
    dom.enchantmentsDiv.classList.add('hidden');
    dom.createEnchantBtnContainer.classList.add('hidden');
    dom.weaponEnchant.textContent = '-';
    dom.classEnchant.textContent = '-';
    dom.helmEnchant.textContent = '-';
    dom.capeEnchant.textContent = '-';

    if (!className) {
        return;
    }

    showLoader();
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/enchantments/${encodeURIComponent(className)}`);
        if (!response.ok) throw new Error('Erro ao carregar encantamentos');
        const data = await response.json();
        
        if (!data.data) {
            dom.createEnchantBtnContainer.classList.remove('hidden');
            showMessage('Nenhum encantamento encontrado para esta classe. Crie um novo!', 'info');
            return;
        }

        dom.weaponEnchant.textContent = data.data.weapon || 'Nenhum';
        dom.classEnchant.textContent = data.data.class || 'Nenhum';
        dom.helmEnchant.textContent = data.data.helm || 'Nenhum';
        dom.capeEnchant.textContent = data.data.cape || 'Nenhum';
        dom.enchantmentsDiv.classList.remove('hidden');
    } catch (error) {
        dom.createEnchantBtnContainer.classList.add('hidden');
        showMessage(`Erro ao carregar encantamentos: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Mostra o modal de edição de encantamento
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {string} defaultValue - Valor padrão para o input
 * @returns {Promise}
 */
function showEditModal(title, message, defaultValue = '') {
    return new Promise((resolve) => {
        editModalResolve = resolve;
        dom.modalTitle.textContent = title;
        dom.modalMessage.textContent = message;
        dom.modalInput.value = defaultValue;
        dom.editEnchantModal.classList.remove('hidden');
    });
}

let editModalResolve;

/**
 * Manipula a confirmação do modal de edição
 */
function handleEditModalConfirm() {
    dom.editEnchantModal.classList.add('hidden');
    if (typeof editModalResolve === 'function') {
        const value = dom.modalInput.value;
        editModalResolve(value);
    }
}

/**
 * Manipula o cancelamento do modal de edição
 */
function handleEditModalCancel() {
    dom.editEnchantModal.classList.add('hidden');
    if (typeof editModalResolve === 'function') {
        editModalResolve(null);
    }
}

/**
 * Mostra o modal de criação de encantamento
 * @returns {Promise}
 */
function showCreateModal() {
    return new Promise((resolve) => {
        createModalResolve = resolve;
        dom.createEnchantModal.classList.remove('hidden');
        dom.createWeaponInput.value = '';
        dom.createClassInput.value = '';
        dom.createHelmInput.value = '';
        dom.createCapeInput.value = '';
    });
}

let createModalResolve;

/**
 * Manipula a confirmação do modal de criação
 */
function handleCreateModalConfirm() {
    dom.createEnchantModal.classList.add('hidden');
    if (typeof createModalResolve === 'function') {
        const weapon = dom.createWeaponInput.value;
        const classEnchant = dom.createClassInput.value;
        const helm = dom.createHelmInput.value;
        const cape = dom.createCapeInput.value;
        createModalResolve({ weapon, class: classEnchant, helm, cape });
    }
}

/**
 * Manipula o cancelamento do modal de criação
 */
function handleCreateModalCancel() {
    dom.createEnchantModal.classList.add('hidden');
    if (typeof createModalResolve === 'function') {
        createModalResolve(null);
    }
}

/**
 * Manipula a edição de um encantamento
 * @param {string} className - Nome da classe
 * @param {string} field - Campo a ser editado (weapon, class, helm, cape)
 * @param {string} currentValue - Valor atual do campo
 */
async function handleEditEnchantment(className, field, currentValue) {
    const fieldLabels = {
        weapon: 'Arma (Weapon)',
        class: 'Classe (Class)',
        helm: 'Capacete (Helm)',
        cape: 'Capa (Cape)'
    };

    const newValue = await showEditModal(
        `Editar ${fieldLabels[field]}`,
        `Digite o novo valor para ${fieldLabels[field]}:`,
        currentValue === 'Nenhum' ? '' : currentValue
    );

    if (!newValue) return;

    const sanitizedValue = sanitizeInput(newValue);
    if (sanitizedValue.length === 0) {
        showMessage('O valor não pode ser vazio', 'error');
        return;
    }

    showLoader();
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/enchantments/${encodeURIComponent(className)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: sanitizedValue })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao atualizar encantamento');
        }

        showMessage('Encantamento atualizado com sucesso!', 'success');
        await loadEnchantments(className);
    } catch (error) {
        showMessage(`Erro ao atualizar encantamento: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Manipula a criação de um novo encantamento
 * @param {string} className - Nome da classe
 */
async function handleCreateEnchantment(className) {
    const values = await showCreateModal();

    if (!values) return;

    const { weapon, class: classEnchant, helm, cape } = values;
    const sanitizedWeapon = sanitizeInput(weapon);
    const sanitizedClass = sanitizeInput(classEnchant);
    const sanitizedHelm = sanitizeInput(helm);
    const sanitizedCape = sanitizeInput(cape);

    if ([sanitizedWeapon, sanitizedClass, sanitizedHelm, sanitizedCape].every(val => val.length === 0)) {
        showMessage('Pelo menos um campo deve ser preenchido', 'error');
        return;
    }

    showLoader();
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/enchantments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                className,
                weapon: sanitizedWeapon || null,
                class: sanitizedClass || null,
                helm: sanitizedHelm || null,
                cape: sanitizedCape || null
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao criar encantamento');
        }

        showMessage('Encantamento criado com sucesso!', 'success');
        await loadEnchantments(className);
    } catch (error) {
        showMessage(`Erro ao criar encantamento: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Inicializa a página
 */
function initialize() {
    loadClasses();

    dom.classSelect.addEventListener('change', (e) => {
        const className = sanitizeInput(e.target.value);
        loadEnchantments(className);
    });

    dom.enchantmentsDiv.addEventListener('click', async (e) => {
        const btn = e.target.closest('.edit-enchant-btn');
        if (btn) {
            const field = btn.dataset.field;
            const className = sanitizeInput(dom.classSelect.value);
            const currentValue = dom[`${field}Enchant`].textContent;
            await handleEditEnchantment(className, field, currentValue);
        }
    });

    dom.createEnchantBtn.addEventListener('click', async () => {
        const className = sanitizeInput(dom.classSelect.value);
        await handleCreateEnchantment(className);
    });

    dom.confirmModalBtn.addEventListener('click', handleEditModalConfirm);
    dom.cancelModalBtn.addEventListener('click', handleEditModalCancel);
    dom.confirmCreateModalBtn.addEventListener('click', handleCreateModalConfirm);
    dom.cancelCreateModalBtn.addEventListener('click', handleCreateModalCancel);

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
}

document.addEventListener('DOMContentLoaded', initialize);