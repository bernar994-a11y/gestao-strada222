/* ========================================
/* ========================================
   Gestão Strada — Application Logic
   ======================================== */

(function () {
    'use strict';

    // ==========================================
    // Valid Users
    // ==========================================
    const VALID_USERS = [
        { username: 'marcos', password: '1234', name: 'Marcos', role: 'Administrador' },
        { username: 'nicolas', password: 'admin', name: 'Nicolas', role: 'Administrador' },
    ];

    let currentUser = null;

    // ==========================================
    // Supabase Integration
    // ==========================================
    const SUPABASE_URL = 'https://ruknpuaukutpxpcriuex.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_fbcn6PhYrDEWj8HYhc9QRg_8iESPwm6';
    let supabase = null;

    try {
        if (window.supabase && window.supabase.createClient) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase conectado');
        }
    } catch (e) {
        console.warn('⚠ Supabase não disponível, usando localStorage', e);
    }

    async function saveCostToSupabase(cost) {
        if (!supabase || !state.currentUnit) return;
        try {
            const { error } = await supabase
                .from('custos')
                .upsert({
                    id: cost.id,
                    description: cost.desc,
                    value: cost.value,
                    date: cost.date,
                    category_id: cost.categoryId,
                    cost_center: cost.center,
                    notes: cost.notes,
                    kg: cost.kg || 0,
                    due_date: cost.dueDate || null,
                    paid: cost.paid,
                    unit_id: state.currentUnit
                }, { onConflict: 'id' });
            if (error) console.warn('Supabase save error:', error.message);
        } catch (e) {
            console.warn('Supabase sync error:', e);
        }
    }

    async function deleteCostSupabase(id) {
        if (!supabase) return;
        try {
            await supabase.from('custos').delete().eq('id', id);
        } catch (e) { }
    }

    async function saveCategoryToSupabase(cat) {
        if (!supabase || !state.currentUnit) return;
        try {
            const { error } = await supabase
                .from('categorias')
                .upsert({
                    id: cat.id,
                    name: cat.name,
                    color: cat.color,
                    unit_id: state.currentUnit
                }, { onConflict: 'id' });
        } catch (e) { }
    }

    async function deleteCategorySupabase(id) {
        if (!supabase) return;
        try {
            await supabase.from('categorias').delete().eq('id', id);
        } catch (e) { }
    }

    async function saveCarneToSupabase(carne) {
        if (!supabase || !state.currentUnit) return;
        try {
            await supabase.from('carnes').upsert({
                id: carne.id,
                name: carne.nome,
                phone: carne.telefone,
                address: carne.endereco,
                unit_id: state.currentUnit
            }, { onConflict: 'id' });

            if (carne.installments && carne.installments.length > 0) {
                const payload = carne.installments.map(p => ({
                    id: p.id || ('p_' + carne.id + '_' + p.number),
                    carne_id: carne.id,
                    installment_number: p.number,
                    value: p.value,
                    due_date: p.dueDate,
                    paid: p.paid,
                    payment_date: p.paymentDate || null
                }));
                await supabase.from('carnes_parcelas').upsert(payload, { onConflict: 'id' });
            }
        } catch (e) { }
    }

    async function deleteCarneSupabase(id) {
        if (!supabase) return;
        try {
            await supabase.from('carnes').delete().eq('id', id);
        } catch (e) { }
    }

    async function loadFromSupabase() {
        if (!supabase || !state.currentUnit) return false;
        try {
            // 1. Carregar Custos
            const { data: custos, error: errCosts } = await supabase
                .from('custos')
                .select('*')
                .eq('unit_id', state.currentUnit);

            // 2. Carregar Categorias
            const { data: categorias, error: errCats } = await supabase
                .from('categorias')
                .select('*')
                .eq('unit_id', state.currentUnit);

            // 3. Carregar Carnês
            const { data: carnesData, error: errCarnes } = await supabase
                .from('carnes')
                .select('*, carnes_parcelas(*)')
                .eq('unit_id', state.currentUnit);

            // 4. Carregar Caixa
            const { data: caixaData, error: errCaixa } = await supabase
                .from('caixa')
                .select('*')
                .eq('unit_id', state.currentUnit);

            if (errCosts || errCats || errCarnes) {
                console.warn('Erro ao carregar do Supabase:', errCosts || errCats || errCarnes);
                return false;
            }

            // --- MIGRAÇÃO AUTOMÁTICA DA TABELA ANTIGA ---
            const isNewEmpty = (!custos || custos.length === 0) && (!categorias || categorias.length === 0);

            if (isNewEmpty) {
                console.log('🔄 Novas tabelas vazias. Tentando migrar da antiga app_data...');
                const { data: oldData, error: errOld } = await supabase
                    .from('app_data')
                    .select('*')
                    .eq('unit_id', state.currentUnit)
                    .single();

                if (!errOld && oldData) {
                    try {
                        let parsedCosts = [];
                        let parsedCats = [];
                        let parsedCarnes = [];

                        if (oldData.costs) parsedCosts = JSON.parse(oldData.costs);
                        if (oldData.categories) parsedCats = JSON.parse(oldData.categories);
                        if (oldData.carnes) parsedCarnes = JSON.parse(oldData.carnes);

                        state.costs = parsedCosts.map(c => ({
                            ...c,
                            desc: c.desc || c.description,
                            center: c.center || c.costCenter
                        }));
                        state.categories = parsedCats;
                        state.carnes = parsedCarnes;

                        console.log(`📦 Migrando ${state.costs.length} custos para nova tabela...`);
                        
                        // Salvar na nova estrutura
                        for (const c of state.costs) { await saveCostToSupabase(c); }
                        for (const c of state.categories) { await saveCategoryToSupabase(c); }
                        for (const c of state.carnes) { await saveCarneToSupabase(c); }

                        console.log('✅ Migração de dados concluída!');
                        saveState();
                        renderAll();
                        return true; // Retorna pois já atualizou o state
                    } catch (e) {
                        console.warn('Erro na migração:', e);
                    }
                }
            }
            // -------------------------------------------

            // Mapear dados para o formato local
            if (custos) {
                state.costs = custos.map(c => ({
                    id: c.id,
                    desc: c.description,
                    value: c.value,
                    date: c.date,
                    categoryId: c.category_id,
                    center: c.cost_center,
                    notes: c.notes,
                    kg: c.kg,
                    dueDate: c.due_date,
                    paid: c.paid
                }));
            }

            if (categorias) {
                state.categories = categorias.map(c => ({
                    id: c.id,
                    name: c.name,
                    color: c.color
                }));
            }

            if (carnesData) {
                state.carnes = carnesData.map(c => ({
                    id: c.id,
                    nome: c.name,
                    telefone: c.phone,
                    endereco: c.address,
                    installments: (c.carnes_parcelas || []).map(p => ({
                        id: p.id,
                        number: p.installment_number,
                        value: p.value,
                        dueDate: p.due_date,
                        paid: p.paid,
                        paymentDate: p.payment_date
                    }))
                }));
            }

            if (typeof caixaData !== 'undefined' && caixaData) {
                state.caixa = caixaData.map(c => ({
                    id: c.id,
                    date: c.date,
                    value: c.value,
                    turno: c.turno,
                    diferenca: c.diferenca || 0,
                    obs: c.obs,
                    unit_id: c.unit_id,
                    createdAt: c.created_at
                }));
            } else {
                state.caixa = [];
            }

            saveState();
            renderAll();
            return true;
        } catch (e) {
            console.warn('Sync error:', e);
            return false;
        }
    }

    async function saveEmployeesToSupabase() {
        if (!supabase) return;
        try {
            const employees = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES) || '[]');
            const payload = employees.map(emp => ({
                id: emp.id,
                name: emp.name,
                role: emp.role,
                username: emp.username,
                password: emp.password,
                allowed_unit: emp.allowedUnit || 'all'
            }));
            const { error } = await supabase
                .from('funcionarios')
                .upsert(payload, { onConflict: 'id' });
            if (error) console.warn('Supabase employees save error:', error.message);
        } catch (e) {
            console.warn('Supabase employees sync error:', e);
        }
    }
    
    async function loadEmployeesFromSupabase() {
        if (!supabase) return false;
        try {
            const { data, error } = await supabase
                .from('app_data')
                .select('*')
                .eq('unit_id', 'employees')
                .single();
            if (error || !data) return false;
            localStorage.setItem(STORAGE_KEYS.EMPLOYEES, data.costs || '[]');
            console.log('✅ Funcionários carregados do Supabase');
            return true;
        } catch (e) {
            console.warn('Supabase load employees error:', e);
            return false;
        }
    }

    // ==========================================
    // Configuration per Business Unit
    // ==========================================
    const BUSINESS_CONFIG = {
        bikeshop: {
            name: 'Strada BikeShop',
            shortName: 'BikeShop',
            hasKg: false,
            defaultCategories: [
                { id: 'bs_cat_1', name: 'Peças e Componentes', color: '#F5A623' },
                { id: 'bs_cat_2', name: 'Acessórios', color: '#00CEFF' },
                { id: 'bs_cat_3', name: 'Mão de Obra', color: '#6C5CE7' },
                { id: 'bs_cat_4', name: 'Operacional', color: '#10B981' },
                { id: 'bs_cat_5', name: 'Marketing', color: '#A855F7' },
                { id: 'bs_cat_6', name: 'Logística', color: '#EF4444' },
                { id: 'bs_cat_7', name: 'Infraestrutura', color: '#F97316' },
                { id: 'bs_cat_8', name: 'Administrativo', color: '#06B6D4' },
            ],
        },
        bikecafe: {
            name: 'Bike Café',
            shortName: 'Café',
            hasKg: true,
            defaultCategories: [
                { id: 'bc_cat_1', name: 'Mercearia', color: '#F5A623' },
                { id: 'bc_cat_2', name: 'Bebidas', color: '#00CEFF' },
                { id: 'bc_cat_3', name: 'Diversos', color: '#A855F7' },
                { id: 'bc_cat_4', name: 'Operacional', color: '#10B981' },
                { id: 'bc_cat_5', name: 'Infraestrutura', color: '#F97316' },
                { id: 'bc_cat_6', name: 'Administrativo', color: '#06B6D4' },
            ],
        },
    };

    // ==========================================
    // State
    // ==========================================
    const STORAGE_KEYS = {
        COSTS_PREFIX: 'gestao_strada_costs_',
        CATEGORIES_PREFIX: 'gestao_strada_cats_',
        LAST_UNIT: 'gestao_strada_last_unit',
        CONTACTS_PREFIX: 'gestao_strada_contacts_',
        CAMPAIGNS_PREFIX: 'gestao_strada_campaigns_',
        INGREDIENTS: 'gestao_strada_ingredients',
        RECIPES: 'gestao_strada_recipes',
        EMPLOYEES: 'gestao_strada_employees',
        CARNES_PREFIX: 'gestao_strada_carnes_',
        CAIXA_PREFIX: 'gestao_strada_caixa_',
    };

    let state = {
        currentUnit: null,
        costs: [],
        categories: [],
        contacts: [],
        campaigns: [],
        ingredients: [],
        recipes: [],
        carnes: [],
        caixa: [],
        currentPanel: 0,
    };

    function storageKey(prefix) {
        return prefix + state.currentUnit;
    }

    function loadState() {
        try {
            const costs = localStorage.getItem(storageKey(STORAGE_KEYS.COSTS_PREFIX));
            const cats = localStorage.getItem(storageKey(STORAGE_KEYS.CATEGORIES_PREFIX));
            const contacts = localStorage.getItem(storageKey(STORAGE_KEYS.CONTACTS_PREFIX));
            const campaigns = localStorage.getItem(storageKey(STORAGE_KEYS.CAMPAIGNS_PREFIX));
            const ingredients = localStorage.getItem(STORAGE_KEYS.INGREDIENTS);
            const recipes = localStorage.getItem(STORAGE_KEYS.RECIPES);
            const carnes = localStorage.getItem(storageKey(STORAGE_KEYS.CARNES_PREFIX));
            state.costs = costs ? JSON.parse(costs) : [];
            state.categories = cats ? JSON.parse(cats) : [...BUSINESS_CONFIG[state.currentUnit].defaultCategories];
            state.contacts = contacts ? JSON.parse(contacts) : [];
            state.campaigns = campaigns ? JSON.parse(campaigns) : [];
            state.ingredients = ingredients ? JSON.parse(ingredients) : [];
            state.recipes = recipes ? JSON.parse(recipes) : [];
            state.carnes = carnes ? JSON.parse(carnes) : [];
        } catch (e) {
            state.costs = [];
            state.categories = [...BUSINESS_CONFIG[state.currentUnit].defaultCategories];
            state.contacts = [];
            state.campaigns = [];
            state.ingredients = [];
            state.recipes = [];
            state.carnes = [];
        }
    }

    function saveState() {
        localStorage.setItem(storageKey(STORAGE_KEYS.COSTS_PREFIX), JSON.stringify(state.costs));
        localStorage.setItem(storageKey(STORAGE_KEYS.CATEGORIES_PREFIX), JSON.stringify(state.categories));
        localStorage.setItem(storageKey(STORAGE_KEYS.CONTACTS_PREFIX), JSON.stringify(state.contacts));
        localStorage.setItem(storageKey(STORAGE_KEYS.CAMPAIGNS_PREFIX), JSON.stringify(state.campaigns));
        localStorage.setItem(STORAGE_KEYS.INGREDIENTS, JSON.stringify(state.ingredients));
        localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(state.recipes));
        localStorage.setItem(storageKey(STORAGE_KEYS.CARNES_PREFIX), JSON.stringify(state.carnes));
    }

    // ==========================================
    // DOM
    // ==========================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {};
    function cacheEls() {
        Object.assign(els, {
            authScreen: $('#authScreen'),
            unitScreen: $('#unitScreen'),
            unitGreetName: $('#unitGreetName'),
            appLayout: $('#appLayout'),
            sidebarUnit: $('#sidebarUnit'),
            mobileUnit: $('#mobileUnit'),
            sidebar: $('#sidebar'),
            sidebarOverlay: $('#sidebarOverlay'),
            mobileMenuBtn: $('#mobileMenuBtn'),
            navItems: $$('.sidebar-nav-item'),
            panels: $$('.panel'),
            sidebarUserName: $('#sidebarUserName'),
            sidebarUserRole: $('#sidebarUserRole'),
            sidebarUserAvatar: $('#sidebarUserAvatar'),
            // Dashboard
            totalGeral: $('#totalGeral'),
            totalMes: $('#totalMes'),
            totalLancamentos: $('#totalLancamentos'),
            mediaCusto: $('#mediaCusto'),
            categoryBars: $('#categoryBars'),
            recentEntries: $('#recentEntries'),
            // Form
            costForm: $('#costForm'),
            costDescription: $('#costDescription'),
            costValue: $('#costValue'),
            costDate: $('#costDate'),
            costCategory: $('#costCategory'),
            costCenter: $('#costCenter'),
            costNotes: $('#costNotes'),
            costKg: $('#costKg'),
            kgFieldGroup: $('#kgFieldGroup'),
            allEntries: $('#allEntries'),
            // Categories
            categoryForm: $('#categoryForm'),
            catName: $('#catName'),
            catColor: $('#catColor'),
            categoriesGrid: $('#categoriesGrid'),
            // Export
            exportDateFrom: $('#exportDateFrom'),
            exportDateTo: $('#exportDateTo'),
            exportCategory: $('#exportCategory'),
            exportColumns: $('#exportColumns'),
            kgExportCol: $('#kgExportCol'),
            previewHead: $('#previewHead'),
            previewBody: $('#previewBody'),
            previewCount: $('#previewCount'),
            btnExport: $('#btnExport'),
            btnExportCSV: $('#btnExportCSV'),
            // Toast & Modal
            toast: $('#toast'),
            toastMessage: $('#toastMessage'),
            modalOverlay: $('#modalOverlay'),
            modalText: $('#modalText'),
            modalCancel: $('#modalCancel'),
            modalConfirm: $('#modalConfirm'),
            currentDate: $('#currentDate'),
        });
    }

    // ==========================================
    // Auth
    // ==========================================
    function setupAuth() {
        const authForm = $('#authForm');
        const authUser = $('#authUser');
        const authPass = $('#authPass');
        const authError = $('#authError');
        const togglePass = $('#togglePass');

        if (togglePass) {
            togglePass.addEventListener('click', () => {
                const inp = authPass;
                inp.type = inp.type === 'password' ? 'text' : 'password';
            });
        }

        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = authUser.value.trim().toLowerCase();
            const password = authPass.value;
            const user = VALID_USERS.find(u => u.username === username && u.password === password);
            // Also check employees
            const employees = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES) || '[]');
            const emp = employees.find(u => u.username === username && u.password === password);

            if (user) {
                currentUser = user;
                authError.textContent = '';
                showUnitSelection();
            } else if (emp) {
                currentUser = { username: emp.username, name: emp.name, role: emp.role || 'Funcionário', allowedUnit: emp.allowedUnit || 'all' };
                authError.textContent = '';
                showUnitSelection();
            } else {
                authError.textContent = '⚠ Usuário ou senha incorretos';
                authError.style.animation = 'none';
                authError.offsetHeight;
                authError.style.animation = 'shake 0.4s ease';
            }
        });
    }

    function showUnitSelection() {
        els.authScreen.style.display = 'none';
        els.unitScreen.style.display = '';
        els.unitGreetName.textContent = currentUser.name;
        els.unitScreen.querySelector('.login-container').style.animation = 'loginFadeIn 0.5s ease-out';
    }

    async function selectUnit(unit) {
        // Check if employee has unit restriction
        if (currentUser && currentUser.allowedUnit && currentUser.allowedUnit !== 'all' && currentUser.allowedUnit !== unit) {
            showToast('⚠ Você não tem acesso a esta unidade');
            return;
        }
        state.currentUnit = unit;
        localStorage.setItem(STORAGE_KEYS.LAST_UNIT, unit);
        loadState();
        await loadFromSupabase();
        if (typeof loadEmployeesFromSupabase === 'function') await loadEmployeesFromSupabase();
        els.unitScreen.style.display = 'none';
        showApp();
    }

    function backToLogin() {
        currentUser = null;
        els.unitScreen.style.display = 'none';
        els.authScreen.style.display = '';
        els.authScreen.querySelector('.login-container').style.animation = 'loginFadeIn 0.5s ease-out';
    }

    // ==========================================
    // Login
    // ==========================================
    function login(unit) {
        state.currentUnit = unit;
        localStorage.setItem(STORAGE_KEYS.LAST_UNIT, unit);
        loadState();
        showApp();
    }

    function logout() {
        // Go to unit selection instead of login
        state.currentUnit = null;
        state.currentPanel = 0;
        localStorage.removeItem(STORAGE_KEYS.LAST_UNIT);
        els.appLayout.style.display = 'none';
        els.authScreen.style.display = 'none';
        els.unitScreen.style.display = '';
        els.unitGreetName.textContent = currentUser ? currentUser.name : '';
        els.unitScreen.querySelector('.login-container').style.animation = 'loginFadeIn 0.5s ease-out';
    }

    function showApp() {
        const config = BUSINESS_CONFIG[state.currentUnit];
        els.authScreen.style.display = 'none';
        els.unitScreen.style.display = 'none';
        els.appLayout.style.display = 'flex';

        // Update branding
        els.sidebarUnit.textContent = config.name;
        els.mobileUnit.textContent = config.shortName;

        // Update user info in sidebar
        if (currentUser) {
            els.sidebarUserName.textContent = currentUser.name;
            els.sidebarUserRole.textContent = currentUser.role;
            els.sidebarUserAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
        }

        // Show/hide KG field
        const showKg = config.hasKg;
        els.kgFieldGroup.style.display = showKg ? '' : 'none';
        els.kgExportCol.style.display = showKg ? '' : 'none';

        // Show/hide calculator nav (only for bikecafe)
        const navCalc = $('#navCalculator');
        if (navCalc) navCalc.style.display = state.currentUnit === 'bikecafe' ? '' : 'none';

        // Show/hide caixa nav (only for bikecafe)
        const navCaixa = $('#navCaixa');
        if (navCaixa) navCaixa.style.display = state.currentUnit === 'bikecafe' ? '' : 'none';

        // Show/hide carnê nav (only for bikeshop)
        const navCarne = $('#navCarne');
        if (navCarne) navCarne.style.display = state.currentUnit === 'bikeshop' ? '' : 'none';

        setCurrentDate();
        setupNavigation();
        setupMobileMenu();
        setupForms();
        setupExport();
        setupModal();
        setupCurrencyInput();
        setupContacts();
        setupMarketing();
        setupCalculator();
        setupEmployees();
        setupCarne();
        navigateToPanel(0);
        renderAll();
        renderAllExtended();
        checkDueNotifications();
        registerServiceWorker();
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('✅ Service Worker registrado', reg))
                    .catch(err => console.warn('⚠ Erro ao registrar Service Worker', err));
            });
        }
    }

    function checkAutoLogin() {
        // No auto-login — always show auth screen
    }

    // ==========================================
    // Date
    // ==========================================
    function setCurrentDate() {
        const now = new Date();
        const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        els.currentDate.textContent = now.toLocaleDateString('pt-BR', options);
        els.costDate.value = now.toISOString().split('T')[0];
    }

    // ==========================================
    // Sidebar Navigation
    // ==========================================
    let navSetup = false;
    function setupNavigation() {
        if (navSetup) return;
        navSetup = true;
        els.navItems.forEach((item) => {
            item.addEventListener('click', () => {
                navigateToPanel(parseInt(item.dataset.panel));
                closeMobileMenu();
            });
        });
    }

    function navigateToPanel(index) {
        state.currentPanel = index;

        // Toggle panels
        els.panels.forEach((p, i) => {
            const pIndex = p.dataset.panel ? parseInt(p.dataset.panel) : i;
            if (pIndex === index) {
                p.classList.add('active');
                p.style.animation = 'none';
                p.offsetHeight; // force reflow
                p.style.animation = '';
            } else {
                p.classList.remove('active');
            }
        });

        // Update sidebar active
        els.navItems.forEach((item) => {
            const itemPanel = parseInt(item.dataset.panel);
            item.classList.toggle('active', itemPanel === index);
        });

        // Re-render
        if (index === 0) renderDashboard();
        if (index === 3) updateExportPreview();
        if (index === 8) renderCarnes();
        if (index === 9) renderCostEvolution();
        if (index === 11) renderCaixa();
    }

    // ==========================================
    // Mobile Menu
    // ==========================================
    let mobileSetup = false;
    function setupMobileMenu() {
        if (mobileSetup) return;
        mobileSetup = true;
        els.mobileMenuBtn.addEventListener('click', openMobileMenu);
        els.sidebarOverlay.addEventListener('click', closeMobileMenu);
    }

    function openMobileMenu() {
        els.sidebar.classList.add('open');
        els.sidebarOverlay.classList.add('show');
    }

    function closeMobileMenu() {
        els.sidebar.classList.remove('open');
        els.sidebarOverlay.classList.remove('show');
    }

    // ==========================================
    // Currency & KG Input
    // ==========================================
    let currencySetup = false;
    function setupCurrencyInput() {
        if (currencySetup) return;
        currencySetup = true;

        els.costValue.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (!val) { e.target.value = ''; return; }
            val = (parseInt(val) / 100).toFixed(2);
            e.target.value = val.replace('.', ',');
        });

        els.costKg.addEventListener('input', (e) => {
            // Allow only numbers and comma
            e.target.value = e.target.value.replace(/[^0-9,]/g, '');
        });
    }

    function parseCurrency(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    }

    function formatCurrency(num) {
        return 'R$ ' + num.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    function parseKg(str) {
        if (!str) return null;
        const val = parseFloat(str.replace(',', '.'));
        return isNaN(val) ? null : val;
    }

    // ==========================================
    // Forms
    // ==========================================
    let formsSetup = false;
    function setupForms() {
        if (formsSetup) return;
        formsSetup = true;

        els.costForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addCost();
        });

        els.categoryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addCategory();
        });

        if (typeof setupCaixa === 'function') setupCaixa();
    }

    function addCost() {
        const desc = els.costDescription.value.trim();
        const value = parseCurrency(els.costValue.value);
        const date = els.costDate.value;
        const catId = els.costCategory.value;
        const center = els.costCenter.value.trim();
        const notes = els.costNotes.value.trim();
        const kg = BUSINESS_CONFIG[state.currentUnit].hasKg ? parseKg(els.costKg.value) : null;
        const dueDate = ($('#costDueDate') || {}).value || null;

        if (!desc || value <= 0 || !date || !catId) {
            showToast('⚠ Preencha todos os campos obrigatórios');
            return;
        }

        const cost = {
            id: 'cost_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            desc: desc,
            value: value,
            date: date,
            categoryId: catId,
            center: center,
            notes: notes,
            kg: kg,
            dueDate: dueDate || null,
            paid: dueDate ? false : true
        };

        state.costs.unshift(cost);
        saveState();
        saveCostToSupabase(cost);
        renderAll();

        els.costForm.reset();
        els.costDate.value = new Date().toISOString().split('T')[0];
        const dueDateInput = $('#costDueDate');
        if (dueDateInput) dueDateInput.value = '';
        showToast('✅ Custo lançado com sucesso!');
    }

    function addCategory() {
        const name = els.catName.value.trim();
        const color = els.catColor.value;
        if (!name) { showToast('Informe o nome da categoria'); return; }
        if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            showToast('Categoria já existe');
            return;
        }

        const catObj = {
            id: 'cat_' + Date.now(),
            name: name,
            color: color,
        };
        state.categories.push(catObj);
        saveState();
        saveCategoryToSupabase(catObj);
        renderAll();
        els.catName.value = '';
        showToast('✅ Categoria adicionada!');
    }

    // ==========================================
    // Delete
    // ==========================================
    let pendingDelete = null;
    let modalSetup = false;

    function setupModal() {
        if (modalSetup) return;
        modalSetup = true;

        els.modalCancel.addEventListener('click', closeModal);
        els.modalOverlay.addEventListener('click', (e) => {
            if (e.target === els.modalOverlay) closeModal();
        });
        els.modalConfirm.addEventListener('click', () => {
            if (pendingDelete) { pendingDelete(); pendingDelete = null; }
            closeModal();
        });
    }

    function showModal(text, onConfirm) {
        els.modalText.textContent = text;
        pendingDelete = onConfirm;
        els.modalOverlay.classList.add('show');
    }

    function closeModal() {
        els.modalOverlay.classList.remove('show');
        pendingDelete = null;
    }

    function deleteCost(id) {
        showModal('Deseja realmente excluir este lançamento?', () => {
            state.costs = state.costs.filter(c => c.id !== id);
            saveState();
            deleteCostSupabase(id);
            renderAll();
            showToast('Lançamento excluído');
        });
    }

    function deleteCategory(id) {
        const usedCount = state.costs.filter(c => c.categoryId === id).length;
        const msg = usedCount > 0
            ? `Esta categoria tem ${usedCount} lançamento(s). Deseja excluí-la?`
            : 'Deseja realmente excluir esta categoria?';
        showModal(msg, () => {
            state.categories = state.categories.filter(c => c.id !== id);
            saveState();
            deleteCategorySupabase(id);
            renderAll();
            showToast('Categoria excluída');
        });
    }

    // ==========================================
    // Toast
    // ==========================================
    let toastTimeout = null;
    function showToast(message) {
        els.toastMessage.textContent = message;
        els.toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => els.toast.classList.remove('show'), 2500);
    }

    // ==========================================
    // Rendering
    // ==========================================
    function renderAll() {
        renderDashboard();
        renderCategorySelects();
        renderAllEntries();
        renderCategories();
        updateExportPreview();
    }

    function renderDashboard() {
        const total = state.costs.reduce((s, c) => s + c.value, 0);
        const now = new Date();
        const monthCosts = state.costs.filter(c => {
            const d = new Date(c.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const monthTotal = monthCosts.reduce((s, c) => s + c.value, 0);
        const avg = state.costs.length > 0 ? total / state.costs.length : 0;

        animateValue(els.totalGeral, formatCurrency(total));
        animateValue(els.totalMes, formatCurrency(monthTotal));
        animateValue(els.totalLancamentos, state.costs.length.toString());
        animateValue(els.mediaCusto, formatCurrency(avg));

        // Contas a Receber (from carnê - unpaid installments)
        const contasReceberEl = $('#contasReceber');
        if (contasReceberEl) {
            let totalReceber = 0;
            if (state.carnes && state.carnes.length > 0) {
                state.carnes.forEach(carne => {
                    carne.installments.forEach(p => {
                        if (!p.paid) totalReceber += p.value;
                    });
                });
            }
            animateValue(contasReceberEl, formatCurrency(totalReceber));
        }

        // Contas a Pagar (costs with dueDate and not paid)
        const contasPagarEl = $('#contasPagar');
        if (contasPagarEl) {
            const totalPagar = state.costs.filter(c => c.dueDate && !c.paid).reduce((s, c) => s + c.value, 0);
            animateValue(contasPagarEl, formatCurrency(totalPagar));
        }

        renderCategoryBars(total);
        renderRecentEntries();
        renderContasPagarList();

        // Dynamic KPIs
        const kpiRow = $('#dashKpiRow');
        if (kpiRow) {
            const kpis = [];

            // Top Category
            if (state.costs.length > 0) {
                const catTotals = {};
                state.costs.forEach(c => {
                    const cat = state.categories.find(cat => cat.id === c.categoryId);
                    const name = cat ? cat.name : 'Sem categoria';
                    catTotals[name] = (catTotals[name] || 0) + c.value;
                });
                const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
                if (topCat) {
                    kpis.push({ icon: '🏷️', label: 'Top Categoria', value: topCat[0], sub: formatCurrency(topCat[1]) });
                }
            }

            // Last 30 days
            const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            const last30 = state.costs.filter(c => new Date(c.date) >= thirtyDaysAgo);
            const last30Total = last30.reduce((s, c) => s + c.value, 0);
            kpis.push({ icon: '📆', label: 'Últimos 30 dias', value: formatCurrency(last30Total), sub: `${last30.length} lançamento(s)` });

            // Daily average
            if (state.costs.length > 0) {
                const dates = state.costs.map(c => new Date(c.date).getTime());
                const minDate = new Date(Math.min(...dates));
                const daySpan = Math.max(1, Math.ceil((now - minDate) / (1000 * 60 * 60 * 24)));
                const dailyAvg = total / daySpan;
                kpis.push({ icon: '⚡', label: 'Média Diária', value: formatCurrency(dailyAvg), sub: `em ${daySpan} dia(s)` });
            }

            // Month trend
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthCosts = state.costs.filter(c => {
                const d = new Date(c.date);
                return d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
            });
            const prevTotal = prevMonthCosts.reduce((s, c) => s + c.value, 0);
            if (prevTotal > 0) {
                const variation = ((monthTotal - prevTotal) / prevTotal * 100).toFixed(1);
                const trend = variation > 0 ? '↑' : variation < 0 ? '↓' : '→';
                const trendClass = variation > 0 ? 'kpi-up' : variation < 0 ? 'kpi-down' : 'kpi-neutral';
                kpis.push({ icon: trend, label: 'vs Mês Anterior', value: `${variation > 0 ? '+' : ''}${variation}%`, sub: formatCurrency(prevTotal), extraClass: trendClass });
            }
            if (state.currentUnit === 'bikecafe' && state.caixa) {
                const currentMonthCaixa = state.caixa.filter(c => {
                    const d = new Date(c.date + 'T12:00:00');
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                });
                const totalCaixaMes = currentMonthCaixa.reduce((s, c) => s + c.value, 0);

                const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const prevMonthCaixa = state.caixa.filter(c => {
                    const d = new Date(c.date + 'T12:00:00');
                    return d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
                });
                const totalCaixaPrev = prevMonthCaixa.reduce((s, c) => s + c.value, 0);

                const variation = totalCaixaPrev > 0 ? ((totalCaixaMes - totalCaixaPrev) / totalCaixaPrev * 100).toFixed(1) : 0;
                const trend = variation > 0 ? '↑' : variation < 0 ? '↓' : '→';
                const trendClass = variation > 0 ? 'kpi-up' : variation < 0 ? 'kpi-down' : 'kpi-neutral';

                kpis.push({
                    icon: '💰',
                    label: 'Fluxo de Caixa',
                    value: formatCurrency(totalCaixaMes),
                    sub: totalCaixaPrev > 0 ? `${trend} ${Math.abs(variation)}% vs mês anterior` : 'Sem histórico anterior',
                    extraClass: trendClass
                });
            }

            kpiRow.innerHTML = kpis.map((k, i) => `
                <div class="dash-kpi-card ${k.extraClass || ''}" style="animation-delay:${i * 0.08}s">
                    <div class="dash-kpi-icon">${k.icon}</div>
                    <div class="dash-kpi-info">
                        <span class="dash-kpi-label">${k.label}</span>
                        <span class="dash-kpi-value">${k.value}</span>
                        ${k.sub ? `<span class="dash-kpi-sub">${k.sub}</span>` : ''}
                    </div>
                </div>
            `).join('');
        }
    }

    function animateValue(el, newVal) {
        if (el.textContent !== newVal) {
            el.textContent = newVal;
            el.classList.add('value-updated');
            setTimeout(() => el.classList.remove('value-updated'), 400);
        }
    }

    function renderCategoryBars(total) {
        if (state.costs.length === 0) {
            els.categoryBars.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><p>Nenhum lançamento ainda</p></div>`;
            return;
        }

        const catTotals = {};
        state.costs.forEach(c => { catTotals[c.categoryId] = (catTotals[c.categoryId] || 0) + c.value; });
        const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

        els.categoryBars.innerHTML = sorted.map(([catId, catTotal], idx) => {
            const cat = state.categories.find(c => c.id === catId);
            const name = cat ? cat.name : 'Sem categoria';
            const color = cat ? cat.color : '#666';
            const pct = total > 0 ? (catTotal / total) * 100 : 0;
            return `<div class="cat-bar-item" style="animation-delay:${idx * 0.08}s">
                <div class="cat-bar-dot" style="background:${color};color:${color}"></div>
                <div class="cat-bar-info">
                    <div class="cat-bar-header">
                        <span class="cat-bar-name">${esc(name)}</span>
                        <span class="cat-bar-value">${formatCurrency(catTotal)} (${pct.toFixed(1)}%)</span>
                    </div>
                    <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${color};color:${color}"></div></div>
                </div>
            </div>`;
        }).join('');

        requestAnimationFrame(() => {
            els.categoryBars.querySelectorAll('.cat-bar-fill').forEach(bar => {
                const w = bar.style.width;
                bar.style.width = '0%';
                requestAnimationFrame(() => { bar.style.width = w; });
            });
        });
    }

    function renderRecentEntries() {
        const recent = state.costs.slice(0, 5);
        if (recent.length === 0) {
            els.recentEntries.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Adicione seu primeiro custo</p></div>`;
            return;
        }
        els.recentEntries.innerHTML = recent.map((c, i) => renderEntryItem(c, i, false)).join('');
    }

    function renderAllEntries() {
        if (state.costs.length === 0) {
            els.allEntries.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Nenhum lançamento registrado</p></div>`;
            return;
        }
        els.allEntries.innerHTML = state.costs.map((c, i) => renderEntryItem(c, i, true)).join('');
    }

    function renderEntryItem(cost, idx, showDelete) {
        const cat = state.categories.find(c => c.id === cost.categoryId);
        const catName = cat ? cat.name : 'Sem categoria';
        const color = cat ? cat.color : '#666';
        const kgBadge = (cost.kg != null && cost.kg > 0)
            ? `<span class="entry-kg">${cost.kg.toFixed(2).replace('.', ',')} kg</span>`
            : '';
        const del = showDelete
            ? `<button class="entry-delete" onclick="GestaoStrada.deleteCost('${cost.id}')" title="Excluir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`
            : '';
        return `<div class="entry-item" style="animation-delay:${idx * 0.05}s">
            <div class="entry-color" style="background:${color}"></div>
            <div class="entry-info">
                <div class="entry-desc">${esc(cost.desc || '')}</div>
                <div class="entry-meta">
                    <span>${formatDate(cost.date)}</span>
                    <span class="dot"></span>
                    <span>${esc(catName)}</span>
                    ${cost.costCenter ? `<span class="dot"></span><span>${esc(cost.costCenter)}</span>` : ''}
                    ${kgBadge}
                </div>
            </div>
            <span class="entry-value">${formatCurrency(cost.value)}</span>
            ${del}
        </div>`;
    }

    function renderCategorySelects() {
        const opts = state.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        els.costCategory.innerHTML = `<option value="">Selecione uma categoria</option>${opts}`;
        els.exportCategory.innerHTML = `<option value="">Todas as categorias</option>${opts}`;
    }

    function renderCategories() {
        if (state.categories.length === 0) {
            els.categoriesGrid.innerHTML = `<div class="empty-state"><p>Nenhuma categoria cadastrada</p></div>`;
            return;
        }
        els.categoriesGrid.innerHTML = state.categories.map((cat, idx) => {
            const count = state.costs.filter(c => c.categoryId === cat.id).length;
            return `<div class="category-card" style="animation-delay:${idx * 0.05}s">
                <div class="category-color" style="background:${cat.color};color:${cat.color}"></div>
                <span class="category-name">${esc(cat.name)}</span>
                <span class="category-count">${count} custo${count !== 1 ? 's' : ''}</span>
                <button class="category-delete" onclick="GestaoStrada.deleteCategory('${cat.id}')" title="Excluir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>`;
        }).join('');
    }

    // ==========================================
    // Export
    // ==========================================
    let exportSetup = false;
    function setupExport() {
        if (exportSetup) return;
        exportSetup = true;

        els.exportDateFrom.addEventListener('change', updateExportPreview);
        els.exportDateTo.addEventListener('change', updateExportPreview);
        els.exportCategory.addEventListener('change', updateExportPreview);
        $$('.checkbox-group input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', updateExportPreview);
        });

        els.btnExport.addEventListener('click', exportExcel);
        els.btnExportCSV.addEventListener('click', exportCSV);
    }

    function getFilteredCosts() {
        let filtered = [...state.costs];
        const from = els.exportDateFrom.value;
        const to = els.exportDateTo.value;
        const catId = els.exportCategory.value;
        if (from) filtered = filtered.filter(c => c.date >= from);
        if (to) filtered = filtered.filter(c => c.date <= to);
        if (catId) filtered = filtered.filter(c => c.categoryId === catId);
        return filtered;
    }

    function getSelectedColumns() {
        const cols = [];
        els.exportColumns.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.checked && cb.closest('.kg-export-col') !== null) {
                if (BUSINESS_CONFIG[state.currentUnit].hasKg) cols.push(cb.value);
            } else if (cb.checked) {
                cols.push(cb.value);
            }
        });
        return cols;
    }

    const COLUMN_LABELS = {
        description: 'Descrição',
        value: 'Valor (R$)',
        date: 'Data',
        category: 'Categoria',
        center: 'Centro de Custo',
        notes: 'Observações',
        kg: 'Peso (KG)',
    };

    function getCostRowData(cost, columns) {
        const cat = state.categories.find(c => c.id === cost.categoryId);
        const row = {};
        columns.forEach(col => {
            switch (col) {
                case 'description': row[COLUMN_LABELS[col]] = cost.desc || ''; break;
                case 'value': row[COLUMN_LABELS[col]] = cost.value; break;
                case 'date': row[COLUMN_LABELS[col]] = formatDate(cost.date); break;
                case 'category': row[COLUMN_LABELS[col]] = cat ? cat.name : 'Sem categoria'; break;
                case 'center': row[COLUMN_LABELS[col]] = cost.center || ''; break;
                case 'notes': row[COLUMN_LABELS[col]] = cost.notes || ''; break;
                case 'kg': row[COLUMN_LABELS[col]] = cost.kg != null ? cost.kg : ''; break;
            }
        });
        return row;
    }

    function updateExportPreview() {
        const filtered = getFilteredCosts();
        const columns = getSelectedColumns();
        els.previewCount.textContent = `${filtered.length} registro${filtered.length !== 1 ? 's' : ''}`;

        els.previewHead.innerHTML = columns.map(col => `<th>${COLUMN_LABELS[col]}</th>`).join('');

        const preview = filtered.slice(0, 10);
        if (preview.length === 0) {
            els.previewBody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;color:var(--text-muted);padding:1.5rem;">Nenhum registro encontrado</td></tr>`;
            return;
        }

        els.previewBody.innerHTML = preview.map(cost => {
            const row = getCostRowData(cost, columns);
            return `<tr>${columns.map(col => {
                const val = row[COLUMN_LABELS[col]];
                const display = col === 'value' ? formatCurrency(val) : esc(String(val != null ? val : ''));
                return `<td>${display}</td>`;
            }).join('')}</tr>`;
        }).join('');

        if (filtered.length > 10) {
            els.previewBody.innerHTML += `<tr><td colspan="${columns.length}" style="text-align:center;color:var(--text-muted);font-size:0.75rem;padding:0.5rem;">+ ${filtered.length - 10} registros adicionais</td></tr>`;
        }
    }

    function exportExcel() {
        const filtered = getFilteredCosts();
        const columns = getSelectedColumns();
        if (filtered.length === 0) { showToast('Nenhum dado para exportar'); return; }
        if (typeof XLSX === 'undefined') { showToast('Erro: biblioteca XLSX não carregada'); return; }

        const data = filtered.map(c => getCostRowData(c, columns));
        const ws = XLSX.utils.json_to_sheet(data);

        ws['!cols'] = columns.map(col => {
            const label = COLUMN_LABELS[col];
            let max = label.length;
            filtered.forEach(cost => {
                const row = getCostRowData(cost, columns);
                const val = String(row[label] || '');
                if (val.length > max) max = val.length;
            });
            return { wch: Math.min(max + 2, 40) };
        });

        const wb = XLSX.utils.book_new();
        const unitName = BUSINESS_CONFIG[state.currentUnit].name;
        XLSX.utils.book_append_sheet(wb, ws, 'Custos');

        const total = filtered.reduce((s, c) => s + c.value, 0);
        const summaryData = [
            { 'Resumo': 'Unidade', 'Valor': unitName },
            { 'Resumo': 'Total de Registros', 'Valor': filtered.length },
            { 'Resumo': 'Valor Total', 'Valor': total },
            { 'Resumo': 'Média por Custo', 'Valor': filtered.length > 0 ? (total / filtered.length) : 0 },
            { 'Resumo': 'Data de Exportação', 'Valor': new Date().toLocaleDateString('pt-BR') },
        ];
        const ws2 = XLSX.utils.json_to_sheet(summaryData);
        ws2['!cols'] = [{ wch: 22 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');

        const filename = `GestaoStrada_${unitName.replace(/\s/g, '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        showToast(`📊 Exportado: ${filename}`);
    }

    function exportCSV() {
        const filtered = getFilteredCosts();
        const columns = getSelectedColumns();
        if (filtered.length === 0) { showToast('Nenhum dado para exportar'); return; }

        const headers = columns.map(c => COLUMN_LABELS[c]);
        const rows = filtered.map(cost => {
            const row = getCostRowData(cost, columns);
            return columns.map(col => {
                let val = String(row[COLUMN_LABELS[col]] != null ? row[COLUMN_LABELS[col]] : '');
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            }).join(';');
        });

        const csv = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const unitName = BUSINESS_CONFIG[state.currentUnit].name.replace(/\s/g, '');
        a.download = `GestaoStrada_${unitName}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('📄 CSV exportado com sucesso!');
    }

    // ==========================================
    // Utilities
    // ==========================================
    function esc(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================
    // Contacts
    // ==========================================
    let contactsSetup = false;
    function setupContacts() {
        if (contactsSetup) return;
        contactsSetup = true;
        const form = $('#contactForm');
        const csvDrop = $('#csvDropArea');
        const csvInput = $('#csvFileInput');
        const search = $('#contactSearch');

        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); addContact(); });
        if (csvDrop) {
            csvDrop.addEventListener('click', () => csvInput.click());
            csvDrop.addEventListener('dragover', (e) => { e.preventDefault(); csvDrop.classList.add('drag-over'); });
            csvDrop.addEventListener('dragleave', () => csvDrop.classList.remove('drag-over'));
            csvDrop.addEventListener('drop', (e) => { e.preventDefault(); csvDrop.classList.remove('drag-over'); if (e.dataTransfer.files[0]) importCSV(e.dataTransfer.files[0]); });
        }
        if (csvInput) csvInput.addEventListener('change', (e) => { if (e.target.files[0]) importCSV(e.target.files[0]); });
        if (search) search.addEventListener('input', () => renderContacts(search.value));
    }

    function addContact() {
        const name = $('#contactName').value.trim();
        const phone = $('#contactPhone').value.trim();
        const email = $('#contactEmail').value.trim();
        const tags = $('#contactTags').value.trim().split(',').map(t => t.trim()).filter(Boolean);
        if (!name) { showToast('⚠ Informe o nome do contato'); return; }
        state.contacts.push({ id: 'ct_' + Date.now(), name, phone, email, tags, createdAt: new Date().toISOString() });
        saveState(); renderContacts(); $('#contactForm').reset();
        showToast('✅ Contato adicionado!');
    }

    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split('\n').filter(l => l.trim());
            let imported = 0;
            lines.forEach(line => {
                const parts = line.split(';').map(p => p.trim());
                if (parts[0] && parts[0].toLowerCase() !== 'nome') {
                    state.contacts.push({
                        id: 'ct_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        name: parts[0] || '', phone: parts[1] || '', email: parts[2] || '',
                        tags: (parts[3] || '').split(',').map(t => t.trim()).filter(Boolean),
                        createdAt: new Date().toISOString(),
                    });
                    imported++;
                }
            });
            saveState(); renderContacts();
            showToast(`✅ ${imported} contato(s) importado(s)!`);
        };
        reader.readAsText(file, 'UTF-8');
    }

    function deleteContact(id) {
        showModal('Deseja excluir este contato?', () => {
            state.contacts = state.contacts.filter(c => c.id !== id);
            saveState(); renderContacts();
            showToast('Contato excluído');
        });
    }

    function renderContacts(filter) {
        const list = $('#contactsList');
        const count = $('#contactsCount');
        if (!list) return;
        let contacts = state.contacts;
        if (filter) {
            const f = filter.toLowerCase();
            contacts = contacts.filter(c => c.name.toLowerCase().includes(f) || (c.email || '').toLowerCase().includes(f) || (c.phone || '').includes(f));
        }
        count.textContent = `${contacts.length} contato(s)`;
        if (contacts.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Nenhum contato cadastrado</p></div>';
            return;
        }
        list.innerHTML = contacts.map((c, i) => `<div class="entry-item" style="animation-delay:${i * 0.03}s">
            <div class="entry-color" style="background:#00CEFF"></div>
            <div class="entry-info">
                <div class="entry-desc">${esc(c.name)}</div>
                <div class="entry-meta">
                    ${c.phone ? `<span>📱 ${esc(c.phone)}</span>` : ''}
                    ${c.email ? `<span class="dot"></span><span>✉ ${esc(c.email)}</span>` : ''}
                    ${c.tags.length ? `<span class="dot"></span><span>🏷 ${c.tags.map(t => esc(t)).join(', ')}</span>` : ''}
                </div>
            </div>
            <button class="entry-delete" onclick="GestaoStrada.deleteContact('${c.id}')" title="Excluir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>`).join('');
    }

    // ==========================================
    // Marketing
    // ==========================================
    let marketingSetup = false;
    function setupMarketing() {
        if (marketingSetup) return;
        marketingSetup = true;
        const form = $('#campaignForm');
        const btnPreview = $('#btnPreviewCampaign');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); sendCampaign(); });
        if (btnPreview) btnPreview.addEventListener('click', previewCampaign);
    }

    function updateRecipientsSelect() {
        const sel = $('#campaignRecipients');
        if (!sel) return;
        const tags = new Set();
        state.contacts.forEach(c => c.tags.forEach(t => tags.add(t)));
        sel.innerHTML = `<option value="all">Todos os contatos (${state.contacts.length})</option>` +
            [...tags].map(t => `<option value="tag:${t}">Tag: ${esc(t)}</option>`).join('');
    }

    function previewCampaign() {
        const title = $('#campaignTitle').value.trim();
        const msg = $('#campaignMessage').value.trim();
        const preview = $('#campaignPreview');
        const bubble = $('#previewBubble');
        const rCount = $('#recipientCount');
        if (!title || !msg) { showToast('⚠ Preencha título e mensagem'); return; }
        const recipients = getRecipients();
        bubble.innerHTML = `<strong>${esc(title)}</strong><br><br>${esc(msg).replace(/\n/g, '<br>')}`;
        rCount.textContent = `📤 Será enviada para ${recipients.length} contato(s)`;
        preview.style.display = '';
    }

    function getRecipients() {
        const val = ($('#campaignRecipients') || {}).value || 'all';
        if (val === 'all') return state.contacts;
        if (val.startsWith('tag:')) {
            const tag = val.slice(4);
            return state.contacts.filter(c => c.tags.includes(tag));
        }
        return state.contacts;
    }

    function sendCampaign() {
        const title = $('#campaignTitle').value.trim();
        const msg = $('#campaignMessage').value.trim();
        if (!title || !msg) { showToast('⚠ Preencha título e mensagem'); return; }
        const recipients = getRecipients();
        if (recipients.length === 0) { showToast('⚠ Nenhum destinatário encontrado'); return; }
        state.campaigns.unshift({
            id: 'camp_' + Date.now(), title, message: msg,
            recipientCount: recipients.length, sentAt: new Date().toISOString(),
            sentBy: currentUser ? currentUser.name : 'Sistema',
        });
        saveState(); renderCampaigns();
        $('#campaignForm').reset();
        $('#campaignPreview').style.display = 'none';
        showToast(`✅ Campanha "${title}" disparada para ${recipients.length} contato(s)!`);
    }

    function renderCampaigns() {
        const list = $('#campaignsList');
        if (!list) return;
        if (state.campaigns.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Nenhuma campanha enviada</p></div>';
            return;
        }
        list.innerHTML = state.campaigns.map((c, i) => {
            const d = new Date(c.sentAt);
            const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `<div class="entry-item" style="animation-delay:${i * 0.03}s">
                <div class="entry-color" style="background:#A855F7"></div>
                <div class="entry-info">
                    <div class="entry-desc">${esc(c.title)}</div>
                    <div class="entry-meta"><span>📤 ${c.recipientCount} destinatário(s)</span><span class="dot"></span><span>${dateStr}</span><span class="dot"></span><span>por ${esc(c.sentBy)}</span></div>
                </div>
                <span class="entry-value" style="color:#10B981;font-size:0.8rem;">✓ Enviada</span>
            </div>`;
        }).join('');
    }

    // ==========================================
    // Calculator (Bike Café)
    // ==========================================
    let calcSetup = false;
    function setupCalculator() {
        if (calcSetup) return;
        calcSetup = true;
        const ingForm = $('#ingredientForm');
        const recForm = $('#recipeForm');
        const btnAddIng = $('#btnAddRecipeIng');
        const ingCostInput = $('#ingCost');

        if (ingCostInput) ingCostInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (!val) { e.target.value = ''; return; }
            val = (parseInt(val) / 100).toFixed(2);
            e.target.value = val.replace('.', ',');
        });
        const recipePriceInput = $('#recipePrice');
        if (recipePriceInput) recipePriceInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (!val) { e.target.value = ''; return; }
            val = (parseInt(val) / 100).toFixed(2);
            e.target.value = val.replace('.', ',');
        });

        if (ingForm) ingForm.addEventListener('submit', (e) => { e.preventDefault(); addIngredient(); });
        if (recForm) recForm.addEventListener('submit', (e) => { e.preventDefault(); addRecipe(); });
        if (btnAddIng) btnAddIng.addEventListener('click', addRecipeIngredientRow);
    }

    function switchCalcTab(tab) {
        const tabs = { ingredients: 'calcIngredients', recipes: 'calcRecipes', profitTable: 'calcProfitTable' };
        const tabBtns = { ingredients: 'tabIngredients', recipes: 'tabRecipes', profitTable: 'tabProfitTable' };
        Object.keys(tabs).forEach(k => {
            const el = $('#' + tabs[k]);
            const btn = $('#' + tabBtns[k]);
            if (el) el.classList.toggle('active', k === tab);
            if (btn) btn.classList.toggle('active', k === tab);
        });
        if (tab === 'profitTable') renderProfitTable();
        if (tab === 'recipes') { renderIngredientOptions(); renderRecipes(); }
    }

    function addIngredient() {
        const name = $('#ingName').value.trim();
        const unit = $('#ingUnit').value;
        const cost = parseCurrency($('#ingCost').value);
        const supplier = $('#ingSupplier').value.trim();
        if (!name || cost <= 0) { showToast('⚠ Preencha nome e custo'); return; }
        state.ingredients.push({ id: 'ing_' + Date.now(), name, unit, cost, supplier });
        saveState(); renderIngredients(); $('#ingredientForm').reset();
        showToast('✅ Ingrediente cadastrado!');
    }

    function deleteIngredient(id) {
        showModal('Deseja excluir este ingrediente?', () => {
            state.ingredients = state.ingredients.filter(i => i.id !== id);
            saveState(); renderIngredients();
            showToast('Ingrediente excluído');
        });
    }

    function renderIngredients() {
        const list = $('#ingredientsList');
        if (!list) return;
        if (state.ingredients.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Nenhum ingrediente cadastrado</p></div>';
            return;
        }
        list.innerHTML = state.ingredients.map((ing, i) => `<div class="entry-item" style="animation-delay:${i * 0.03}s">
            <div class="entry-color" style="background:#F5A623"></div>
            <div class="entry-info">
                <div class="entry-desc">${esc(ing.name)}</div>
                <div class="entry-meta"><span>${ing.unit.toUpperCase()}</span>${ing.supplier ? `<span class="dot"></span><span>${esc(ing.supplier)}</span>` : ''}</div>
            </div>
            <span class="entry-value">${formatCurrency(ing.cost)}/${ing.unit}</span>
            <button class="entry-delete" onclick="GestaoStrada.deleteIngredient('${ing.id}')" title="Excluir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>`).join('');
    }

    function addRecipeIngredientRow() {
        const container = $('#recipeIngredientRows');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'form-row recipe-ing-row';
        row.style.marginBottom = '0.5rem';
        const opts = state.ingredients.map(i => `<option value="${i.id}">${esc(i.name)} (${formatCurrency(i.cost)}/${i.unit})</option>`).join('');
        row.innerHTML = `<div class="form-group" style="flex:2"><select class="recipe-ing-select"><option value="">Selecione</option>${opts}</select></div>
            <div class="form-group" style="flex:1"><input type="text" class="recipe-ing-qty" placeholder="Qtd" inputmode="decimal"></div>
            <button type="button" class="entry-delete" onclick="this.closest('.recipe-ing-row').remove()" style="align-self:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
        container.appendChild(row);
    }

    function renderIngredientOptions() {
        $$('.recipe-ing-select').forEach(sel => {
            const current = sel.value;
            const opts = state.ingredients.map(i => `<option value="${i.id}" ${i.id === current ? 'selected' : ''}>${esc(i.name)} (${formatCurrency(i.cost)}/${i.unit})</option>`).join('');
            sel.innerHTML = `<option value="">Selecione</option>${opts}`;
        });
    }

    function addRecipe() {
        const name = $('#recipeName').value.trim();
        const price = parseCurrency($('#recipePrice').value);
        if (!name || price <= 0) { showToast('⚠ Preencha nome e preço de venda'); return; }
        const ingRows = $$('.recipe-ing-row');
        const ingredients = [];
        ingRows.forEach(row => {
            const ingId = row.querySelector('.recipe-ing-select').value;
            const qty = parseFloat((row.querySelector('.recipe-ing-qty').value || '0').replace(',', '.'));
            if (ingId && qty > 0) ingredients.push({ ingredientId: ingId, quantity: qty });
        });
        if (ingredients.length === 0) { showToast('⚠ Adicione ao menos um ingrediente'); return; }
        state.recipes.push({ id: 'rec_' + Date.now(), name, price, ingredients });
        saveState(); renderRecipes(); $('#recipeForm').reset(); $('#recipeIngredientRows').innerHTML = '';
        showToast('✅ Receita salva!');
    }

    function deleteRecipe(id) {
        showModal('Deseja excluir esta receita?', () => {
            state.recipes = state.recipes.filter(r => r.id !== id);
            saveState(); renderRecipes();
            showToast('Receita excluída');
        });
    }

    function calcRecipeCost(recipe) {
        let total = 0;
        recipe.ingredients.forEach(ri => {
            const ing = state.ingredients.find(i => i.id === ri.ingredientId);
            if (ing) total += ing.cost * ri.quantity;
        });
        return total;
    }

    function renderRecipes() {
        const list = $('#recipesList');
        if (!list) return;
        if (state.recipes.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Nenhuma receita cadastrada</p></div>';
            return;
        }
        list.innerHTML = state.recipes.map((r, i) => {
            const cost = calcRecipeCost(r);
            const profit = r.price - cost;
            const margin = r.price > 0 ? (profit / r.price * 100) : 0;
            const color = profit >= 0 ? '#10B981' : '#EF4444';
            return `<div class="entry-item" style="animation-delay:${i * 0.03}s">
                <div class="entry-color" style="background:${color}"></div>
                <div class="entry-info">
                    <div class="entry-desc">${esc(r.name)}</div>
                    <div class="entry-meta"><span>Venda: ${formatCurrency(r.price)}</span><span class="dot"></span><span>Custo: ${formatCurrency(cost)}</span><span class="dot"></span><span style="color:${color}">Margem: ${margin.toFixed(1)}%</span></div>
                </div>
                <span class="entry-value" style="color:${color}">${formatCurrency(profit)}</span>
                <button class="entry-delete" onclick="GestaoStrada.deleteRecipe('${r.id}')" title="Excluir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>`;
        }).join('');
    }

    function renderProfitTable() {
        const tbody = $('#profitTableBody');
        if (!tbody) return;
        if (state.recipes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">Cadastre receitas para ver a tabela de lucro</td></tr>';
            return;
        }
        tbody.innerHTML = state.recipes.map(r => {
            const cost = calcRecipeCost(r);
            const profit = r.price - cost;
            const margin = r.price > 0 ? (profit / r.price * 100) : 0;
            const color = profit >= 0 ? '#10B981' : '#EF4444';
            return `<tr><td>${esc(r.name)}</td><td>${formatCurrency(r.price)}</td><td>${formatCurrency(cost)}</td><td style="color:${color};font-weight:600;">${formatCurrency(profit)}</td><td style="color:${color};font-weight:600;">${margin.toFixed(1)}%</td></tr>`;
        }).join('');
    }

    // ==========================================
    // Employees
    // ==========================================
    let empSetup = false;
    function setupEmployees() {
        if (empSetup) return;
        empSetup = true;
        const form = $('#employeeForm');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); addEmployee(); });
    }

    function addEmployee() {
        const name = $('#empName').value.trim();
        const role = $('#empRole').value.trim();
        const username = $('#empUser').value.trim().toLowerCase();
        const password = $('#empPass').value;
        const allowedUnit = ($('#empUnit') || {}).value || 'all';
        if (!name || !username || !password) { showToast('⚠ Preencha todos os campos obrigatórios'); return; }
        const employees = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES) || '[]');
        if (employees.some(e => e.username === username) || VALID_USERS.some(u => u.username === username)) {
            showToast('⚠ Usuário já existe'); return;
        }
        employees.push({ id: 'emp_' + Date.now(), name, role: role || 'Funcionário', username, password, allowedUnit });
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        saveEmployeesToSupabase();
        renderEmployees(); $('#employeeForm').reset();
        showToast('✅ Funcionário cadastrado!');
    }

    function deleteEmployee(id) {
        showModal('Deseja excluir este funcionário?', () => {
            let employees = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES) || '[]');
            employees = employees.filter(e => e.id !== id);
            localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
            saveEmployeesToSupabase();
            renderEmployees();
            showToast('Funcionário excluído');
        });
    }

    function renderEmployees() {
        const list = $('#employeesList');
        if (!list) return;
        const employees = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES) || '[]');
        if (employees.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Nenhum funcionário cadastrado</p></div>';
            return;
        }
        list.innerHTML = employees.map((emp, i) => {
            const unitLabel = emp.allowedUnit === 'bikeshop' ? 'BikeShop' : emp.allowedUnit === 'bikecafe' ? 'Bike Café' : 'Todas';
            return `<div class="entry-item" style="animation-delay:${i * 0.03}s">
            <div class="entry-color" style="background:#6C5CE7"></div>
            <div class="entry-info">
                <div class="entry-desc">${esc(emp.name)}</div>
                <div class="entry-meta"><span>${esc(emp.role)}</span><span class="dot"></span><span>@${esc(emp.username)}</span><span class="dot"></span><span>🏢 ${unitLabel}</span></div>
            </div>
            <button class="entry-delete" onclick="GestaoStrada.deleteEmployee('${emp.id}')" title="Excluir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>`;
        }).join('');
    }

    // ==========================================
    // Updated renderAll
    // ==========================================
    function renderAllExtended() {
        renderContacts();
        renderCampaigns();
        updateRecipientsSelect();
        renderIngredients();
        renderRecipes();
        renderProfitTable();
        renderEmployees();
        renderCarnes();
        renderCostEvolution();
    }

    // ==========================================
    // Carnê Management (BikeShop)
    // ==========================================
    let carneSetup = false;
    function setupCarne() {
        if (carneSetup) return;
        carneSetup = true;
        const form = $('#carneForm');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); addCarne(); });

        // Currency masks for carnê
        function applyCurrencyMask(el) {
            if (!el) return;
            el.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (!val) { e.target.value = ''; return; }
                val = (parseInt(val) / 100).toFixed(2);
                e.target.value = val.replace('.', ',');
            });
        }
        applyCurrencyMask($('#carneValorTotal'));
        applyCurrencyMask($('#carneEntrada'));
    }

    function addCarne() {
        const nome = $('#carneNome').value.trim();
        const telefone = $('#carneTelefone').value.trim();
        const endereco = $('#carneEndereco').value.trim();
        const parcelas = parseInt($('#carneParcelas').value) || 0;
        const valorTotal = parseCurrency($('#carneValorTotal').value);
        const entrada = parseCurrency($('#carneEntrada').value) || 0;
        const vencimento = $('#carneVencimento').value;

        if (!nome || parcelas <= 0 || valorTotal <= 0 || !vencimento) {
            showToast('⚠ Preencha todos os campos obrigatórios');
            return;
        }

        if (entrada >= valorTotal) {
            showToast('⚠ O valor de entrada deve ser menor que o valor total');
            return;
        }

        const saldoFinanciar = valorTotal - entrada;
        const valorParcela = Math.round((saldoFinanciar / parcelas) * 100) / 100;

        // Generate installments
        const installments = [];
        const baseDate = new Date(vencimento + 'T12:00:00');
        for (let i = 0; i < parcelas; i++) {
            const dueDate = new Date(baseDate);
            dueDate.setMonth(dueDate.getMonth() + i);
            installments.push({
                number: i + 1,
                value: valorParcela,
                dueDate: dueDate.toISOString().split('T')[0],
                paid: false,
                paidAt: null,
                paidValue: null,
            });
        }

        const carne = {
            id: 'carne_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            nome, telefone, endereco,
            totalParcelas: parcelas,
            valorTotal,
            entrada,
            valorParcela,
            installments,
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.name : 'Sistema',
        };

        state.carnes.unshift(carne);
        saveState();
        saveCarneToSupabase(carne);
        renderCarnes();
        $('#carneForm').reset();
        showToast('✅ Carnê cadastrado com sucesso!');
    }

    function toggleParcelaPaid(carneId, parcelaNum) {
        const carne = state.carnes.find(c => c.id === carneId);
        if (!carne) return;
        const parcela = carne.installments.find(p => p.number === parcelaNum);
        if (!parcela) return;

        if (parcela.paid) {
            // Desmarcar pagamento — reverter valor pago
            const paidVal = parcela.paidValue || 0;
            parcela.paid = false;
            parcela.paidAt = null;
            parcela.paymentDate = null;
            parcela.paidValue = null;

            // Se houve excedente anteriormente redistribuído, recalcular parcelas restantes
            recalcRemainingInstallments(carne);

            saveState(); saveCarneToSupabase(carne); renderCarnes(); renderDashboard();
            showToast('Parcela desmarcada');
        } else {
            // 1. Pedir data de pagamento
            const paymentDateInput = prompt('Data do Pagamento (DD/MM/AAAA):', new Date().toLocaleDateString('pt-BR'));
            if (paymentDateInput === null) return;
            let paymentDate = null;
            if (paymentDateInput) {
                const parts = paymentDateInput.split('/');
                if (parts.length === 3) {
                    paymentDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else {
                    paymentDate = new Date().toISOString().split('T')[0];
                }
            } else {
                paymentDate = new Date().toISOString().split('T')[0];
            }

            // 2. Pedir valor pago (pré-preenchido com valor da parcela)
            const valorStr = prompt(
                'Valor pago nesta parcela (R$):',
                parcela.value.toFixed(2).replace('.', ',')
            );
            if (valorStr === null) return;
            const paidValue = parseCurrency(valorStr) || parcela.value;

            parcela.paid = true;
            parcela.paidAt = new Date().toISOString();
            parcela.paymentDate = paymentDate;
            parcela.paidValue = paidValue;

            // 3. Se pagou a mais, redistribuir diferença nas parcelas restantes
            if (paidValue > parcela.value) {
                const excedente = paidValue - parcela.value;
                const remaining = carne.installments.filter(p => !p.paid && p.number !== parcelaNum);
                if (remaining.length > 0) {
                    const desconto = Math.round((excedente / remaining.length) * 100) / 100;
                    remaining.forEach(p => {
                        p.value = Math.max(0, Math.round((p.value - desconto) * 100) / 100);
                    });
                }
            }

            saveState(); saveCarneToSupabase(carne); renderCarnes(); renderDashboard();
            showToast('✅ Parcela paga em ' + formatDate(paymentDate) + ' — ' + formatCurrency(paidValue) + '!');
        }
    }

    function recalcRemainingInstallments(carne) {
        const totalPaid = carne.installments
            .filter(p => p.paid)
            .reduce((sum, p) => sum + (p.paidValue || p.value), 0);
        const saldo = (carne.valorTotal || 0) - (carne.entrada || 0) - totalPaid;
        const remaining = carne.installments.filter(p => !p.paid);
        if (remaining.length > 0 && saldo > 0) {
            const newVal = Math.round((saldo / remaining.length) * 100) / 100;
            remaining.forEach(p => { p.value = newVal; });
        }
    }

    function deleteCarne(id) {
        showModal('Deseja excluir este carnê e todas as suas parcelas?', () => {
            state.carnes = state.carnes.filter(c => c.id !== id);
            saveState();
            deleteCarneSupabase(id);
            renderCarnes();
            showToast('Carnê excluído');
        });
    }

    function renderCarnes() {
        const list = $('#carnesList');
        if (!list) return;
        if (!state.carnes || state.carnes.length === 0) {
            list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Nenhum carnê cadastrado</p></div>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!window._carneExpanded) window._carneExpanded = {};

        // Separate active and paid carnês
        const activeCarnes = state.carnes.filter(c => {
            const paidCount = c.installments.filter(p => p.paid).length;
            return paidCount < c.installments.length;
        });
        const paidCarnes = state.carnes.filter(c => {
            const paidCount = c.installments.filter(p => p.paid).length;
            return paidCount === c.installments.length;
        });

        function buildCarneCard(carne, i) {
            const paidCount = carne.installments.filter(p => p.paid).length;
            const progress = (paidCount / carne.installments.length) * 100;
            const isExpanded = !!window._carneExpanded[carne.id];
            const allPaid = paidCount === carne.installments.length;

            let parcelsHtml = '';
            if (isExpanded) {
                parcelsHtml = carne.installments.map(p => {
                    const dueDate = new Date(p.dueDate + 'T12:00:00');
                    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                    let statusClass = 'parcela-pendente';
                    let statusText = 'Pendente';
                    if (p.paid) {
                        statusClass = 'parcela-paga';
                        statusText = 'Pago';
                    } else if (diffDays < 0) {
                        statusClass = 'parcela-vencida';
                        statusText = 'Vencida';
                    } else if (diffDays <= 3) {
                        statusClass = 'parcela-proxima';
                        statusText = `Vence em ${diffDays}d`;
                    }
                    const paidDateStr = p.paid && p.paymentDate ? ` ${formatDate(p.paymentDate)}` : '';
                    const paidValueStr = p.paid && p.paidValue != null ? `<span class="parcela-paid-value" style="color:#10B981;font-weight:600;font-size:0.7rem;margin-left:4px">Pago: ${formatCurrency(p.paidValue)}</span>` : '';
                    return `<div class="parcela-item ${statusClass}">
                        <div class="parcela-info">
                            <span class="parcela-num">${p.number}ª</span>
                            <span class="parcela-date">${formatDate(p.dueDate)}</span>
                            <span class="parcela-valor">${formatCurrency(p.value)}</span>
                            <span class="parcela-status-badge">${statusText}${paidDateStr}</span>
                            ${paidValueStr}
                        </div>
                        <button class="parcela-toggle" onclick="event.stopPropagation(); GestaoStrada.toggleParcelaPaid('${carne.id}', ${p.number})" title="${p.paid ? 'Desmarcar' : 'Registrar pagamento'}">
                            ${p.paid ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'}
                        </button>
                    </div>`;
                }).join('');
            }

            const statusIcon = allPaid ? '✅' : '';

            return `<div class="carne-card ${isExpanded ? 'carne-expanded' : 'carne-collapsed'}" style="animation-delay:${i * 0.05}s">
                <div class="carne-header-row" onclick="GestaoStrada.toggleCarne('${carne.id}')">
                    <div class="carne-expand-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            ${isExpanded ? '<polyline points="6 9 12 15 18 9"/>' : '<polyline points="9 6 15 12 9 18"/>'}
                        </svg>
                    </div>
                    <div class="carne-collapsed-info">
                        <span class="carne-collapsed-name">${statusIcon} ${esc(carne.nome)}</span>
                        ${carne.telefone ? `<span class="carne-collapsed-phone">📱 ${esc(carne.telefone)}</span>` : ''}
                    </div>
                    <div class="carne-collapsed-stats">
                        <span class="carne-collapsed-paid">${paidCount}/${carne.installments.length}</span>
                        <span class="carne-collapsed-value">${formatCurrency(carne.valorTotal)}</span>
                    </div>
                    <button class="carne-delete-btn" onclick="event.stopPropagation(); GestaoStrada.deleteCarne('${carne.id}')" title="Excluir carnê">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
                ${isExpanded ? `
                <div class="carne-details">
                    <div class="carne-header">
                        <div class="carne-client">
                            <div class="carne-meta">
                                ${carne.telefone ? `<span>📱 ${esc(carne.telefone)}</span>` : ''}
                                ${carne.endereco ? `<span class="dot"></span><span>📍 ${esc(carne.endereco)}</span>` : ''}
                            </div>
                            <div class="carne-meta" style="margin-top:0.3rem">
                                <span>💰 Total: ${formatCurrency(carne.valorTotal || 0)}</span>
                                ${carne.entrada ? `<span class="dot"></span><span>📥 Entrada: ${formatCurrency(carne.entrada)}</span>` : ''}
                                <span class="dot"></span><span>📋 Parcela: ${formatCurrency(carne.valorParcela || 0)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="parcelas-list">${parcelsHtml}</div>
                </div>` : ''}
            </div>`;
        }

        let html = '';

        // Active carnês
        if (activeCarnes.length > 0) {
            html += '<div class="carne-section-label">📋 Carnês Ativos</div>';
            html += activeCarnes.map((c, i) => buildCarneCard(c, i)).join('');
        }

        // Paid carnês history
        if (paidCarnes.length > 0) {
            const totalRecebido = paidCarnes.reduce((s, c) => s + c.valorTotal, 0);
            const avgPerCarne = totalRecebido / paidCarnes.length;

            html += `<div class="carne-history-section">
                <div class="carne-section-label">✅ Histórico — Carnês Quitados</div>
                <div class="carne-history-dashboard">
                    <div class="carne-hist-card">
                        <span class="carne-hist-label">Total Recebido</span>
                        <span class="carne-hist-value" style="color:#10B981">${formatCurrency(totalRecebido)}</span>
                    </div>
                    <div class="carne-hist-card">
                        <span class="carne-hist-label">Carnês Quitados</span>
                        <span class="carne-hist-value">${paidCarnes.length}</span>
                    </div>
                    <div class="carne-hist-card">
                        <span class="carne-hist-label">Média por Carnê</span>
                        <span class="carne-hist-value">${formatCurrency(avgPerCarne)}</span>
                    </div>
                </div>
                ${paidCarnes.map((c, i) => buildCarneCard(c, i)).join('')}
            </div>`;
        }

        list.innerHTML = html;
    }

    function toggleCarne(carneId) {
        if (!window._carneExpanded) window._carneExpanded = {};
        window._carneExpanded[carneId] = !window._carneExpanded[carneId];
        renderCarnes();
    }

    // ==========================================
    // Contas a Pagar List (Dashboard)
    // ==========================================
    function renderContasPagarList() {
        const container = $('#contasPagarList');
        if (!container) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const bills = state.costs.filter(c => c.dueDate && !c.paid);
        bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        if (bills.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>Nenhum boleto pendente</p></div>';
            return;
        }

        container.innerHTML = bills.slice(0, 8).map((bill, i) => {
            const dueDate = new Date(bill.dueDate + 'T12:00:00');
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            let statusClass = 'bill-pendente';
            let statusText = 'Pendente';
            if (diffDays < 0) {
                statusClass = 'bill-vencido';
                statusText = 'Vencido';
            } else if (diffDays <= 3) {
                statusClass = 'bill-proximo';
                statusText = `${diffDays}d`;
            } else {
                statusText = formatDate(bill.dueDate);
            }

            return `<div class="bill-item ${statusClass}" style="animation-delay:${i * 0.04}s">
                <div class="bill-info">
                    <span class="bill-desc">${esc(bill.desc || '')}</span>
                    <span class="bill-date">${statusText}</span>
                </div>
                <span class="bill-value">${formatCurrency(bill.value)}</span>
                <button class="parcela-toggle" onclick="GestaoStrada.toggleCostPaid('${bill.id}')" title="Marcar como pago">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                </button>
            </div>`;
        }).join('');

        if (bills.length > 8) {
            container.innerHTML += `<div style="text-align:center;font-size:0.75rem;color:var(--text-muted);padding:0.5rem;">+ ${bills.length - 8} boleto(s) adicionais</div>`;
        }
    }

    function toggleCostPaid(costId) {
        const cost = state.costs.find(c => c.id === costId);
        if (!cost) return;
        cost.paid = !cost.paid;
        saveState();
        saveCostToSupabase(cost);
        renderDashboard();
        showToast(cost.paid ? '✅ Boleto marcado como pago!' : 'Boleto desmarcado');
    }

    // ==========================================
    // Due Date Notifications
    // ==========================================
    function checkDueNotifications() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let carneDueCount = 0;
        let carneOverdueCount = 0;
        let billDueCount = 0;
        let billOverdueCount = 0;

        // Check carnê installments
        if (state.carnes && state.carnes.length > 0) {
            state.carnes.forEach(carne => {
                carne.installments.forEach(p => {
                    if (p.paid) return;
                    const dueDate = new Date(p.dueDate + 'T12:00:00');
                    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) carneOverdueCount++;
                    else if (diffDays <= 3) carneDueCount++;
                });
            });
        }

        // Check bill due dates (contas a pagar)
        state.costs.forEach(c => {
            if (!c.dueDate || c.paid) return;
            const dueDate = new Date(c.dueDate + 'T12:00:00');
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) billOverdueCount++;
            else if (diffDays <= 3) billDueCount++;
        });

        // Update carnê badge on sidebar
        const navCarne = $('#navCarne');
        if (navCarne) {
            let badge = navCarne.querySelector('.nav-badge');
            const totalCarneAlerts = carneDueCount + carneOverdueCount;
            if (totalCarneAlerts > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'nav-badge';
                    navCarne.appendChild(badge);
                }
                badge.textContent = totalCarneAlerts;
                badge.classList.toggle('badge-danger', carneOverdueCount > 0);
            } else if (badge) {
                badge.remove();
            }
        }

        // Update dashboard badge
        const navDash = $$('.sidebar-nav-item')[0];
        if (navDash) {
            let badge = navDash.querySelector('.nav-badge');
            const totalBillAlerts = billDueCount + billOverdueCount;
            if (totalBillAlerts > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'nav-badge';
                    navDash.appendChild(badge);
                }
                badge.textContent = totalBillAlerts;
                badge.classList.toggle('badge-danger', billOverdueCount > 0);
            } else if (badge) {
                badge.remove();
            }
        }

        // Show notification toasts
        const totalAlerts = carneDueCount + carneOverdueCount + billDueCount + billOverdueCount;
        if (totalAlerts > 0) {
            setTimeout(() => {
                const parts = [];
                if (carneOverdueCount > 0) parts.push(`${carneOverdueCount} parcela(s) de carnê vencida(s)`);
                if (carneDueCount > 0) parts.push(`${carneDueCount} parcela(s) de carnê próxima(s)`);
                if (billOverdueCount > 0) parts.push(`${billOverdueCount} boleto(s) vencido(s)`);
                if (billDueCount > 0) parts.push(`${billDueCount} boleto(s) próximo(s)`);
                showToast(`🚨 ${parts.join(', ')}!`);
            }, 1500);
        }
    }

    // ==========================================
    // Cost Evolution
    // ==========================================
    function renderCostEvolution() {
        const container = $('#evolutionContent');
        if (!container) return;
        if (state.costs.length === 0) {
            container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg><p>Adicione custos para ver a evolução</p></div>';
            return;
        }

        const monthMap = {};
        const catMap = {}; // category per month
        state.costs.forEach(c => {
            const d = new Date(c.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthMap[key]) monthMap[key] = 0;
            monthMap[key] += c.value;
            if (!catMap[key]) catMap[key] = {};
            const cat = state.categories.find(cat => cat.id === c.categoryId);
            const catName = cat ? cat.name : 'Outros';
            catMap[key][catName] = (catMap[key][catName] || 0) + c.value;
        });

        const months = Object.keys(monthMap).sort();
        const maxValue = Math.max(...months.map(m => monthMap[m]));
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const brandColors = ['#F5A623', '#6C5CE7', '#10B981', '#EF4444', '#3B82F6', '#EC4899', '#F59E0B', '#8B5CF6'];

        // Summary cards
        const totalAll = months.reduce((s, m) => s + monthMap[m], 0);
        const avgMonth = totalAll / months.length;
        const lastMonth = months.length >= 1 ? monthMap[months[months.length - 1]] : 0;
        const prevMonthVal = months.length >= 2 ? monthMap[months[months.length - 2]] : 0;
        const trend = prevMonthVal > 0 ? ((lastMonth - prevMonthVal) / prevMonthVal * 100) : 0;
        const trendColor = trend > 0 ? '#EF4444' : trend < 0 ? '#10B981' : 'var(--text-muted)';
        const trendIcon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';

        let summaryHtml = `<div class="evolution-summary">
            <div class="evo-summary-card"><span class="evo-summary-label">Média Mensal</span><span class="evo-summary-value">${formatCurrency(avgMonth)}</span></div>
            <div class="evo-summary-card"><span class="evo-summary-label">Último Mês</span><span class="evo-summary-value">${formatCurrency(lastMonth)}</span></div>
            <div class="evo-summary-card"><span class="evo-summary-label">Tendência</span><span class="evo-summary-value" style="color:${trendColor}">${trendIcon} ${trend > 0 ? '+' : ''}${trend.toFixed(1)}%</span></div>
            <div class="evo-summary-card"><span class="evo-summary-label">Total Acumulado</span><span class="evo-summary-value">${formatCurrency(totalAll)}</span></div>
        </div>`;

        // Canvas chart
        let chartHtml = `<div class="evo-canvas-wrapper"><canvas id="evoCanvas" width="700" height="220"></canvas></div>`;

        // Bar rows
        let barsHtml = '<div class="evolution-chart">';
        months.forEach((m, i) => {
            const [year, month] = m.split('-');
            const label = `${monthNames[parseInt(month) - 1]}/${year.slice(2)}`;
            const value = monthMap[m];
            const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
            let variation = '';
            let variationClass = '';
            if (i > 0) {
                const prev = monthMap[months[i - 1]];
                const pctChange = prev > 0 ? ((value - prev) / prev * 100) : 0;
                if (pctChange > 0) { variation = `<span class="evolution-up">↑ +${pctChange.toFixed(1)}%</span>`; variationClass = 'evo-up'; }
                else if (pctChange < 0) { variation = `<span class="evolution-down">↓ ${pctChange.toFixed(1)}%</span>`; variationClass = 'evo-down'; }
                else { variation = `<span class="evolution-neutral">= 0%</span>`; }
            }
            // Category mini bars
            const cats = catMap[m] || {};
            const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
            const catBars = catEntries.slice(0, 3).map((ce, ci) => {
                const catPct = value > 0 ? (ce[1] / value * 100) : 0;
                return `<div class="evo-cat-chip" style="background:${brandColors[ci % brandColors.length]};width:${Math.max(catPct, 8)}%" title="${ce[0]}: ${formatCurrency(ce[1])}">${ce[0].substring(0, 8)}</div>`;
            }).join('');

            barsHtml += `<div class="evolution-row ${variationClass}" style="animation-delay:${i * 0.06}s">
                <div class="evo-label">${label}</div>
                <div class="evo-bar-wrapper"><div class="evo-bar" style="width:${pct}%"></div></div>
                <div class="evo-value">${formatCurrency(value)}</div>
                <div class="evo-variation">${variation}</div>
            </div>
            <div class="evo-cat-row">${catBars}</div>`;
        });
        barsHtml += '</div>';

        container.innerHTML = summaryHtml + chartHtml + barsHtml;

        // Draw canvas chart
        requestAnimationFrame(() => {
            const canvas = document.getElementById('evoCanvas');
            if (!canvas || months.length < 2) return;
            const ctx = canvas.getContext('2d');
            const W = canvas.width;
            const H = canvas.height;
            const padding = { top: 20, right: 20, bottom: 30, left: 60 };
            const chartW = W - padding.left - padding.right;
            const chartH = H - padding.top - padding.bottom;

            ctx.clearRect(0, 0, W, H);

            // Grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartH / 4) * i;
                ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(W - padding.right, y); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '10px Inter';
                ctx.textAlign = 'right';
                ctx.fillText(formatCurrency(maxValue * (1 - i / 4)), padding.left - 5, y + 3);
            }

            // Data points
            const points = months.map((m, i) => ({
                x: padding.left + (i / (months.length - 1)) * chartW,
                y: padding.top + chartH - (monthMap[m] / maxValue) * chartH
            }));

            // Gradient fill
            const gradient = ctx.createLinearGradient(0, padding.top, 0, H - padding.bottom);
            gradient.addColorStop(0, 'rgba(245, 166, 35, 0.25)');
            gradient.addColorStop(1, 'rgba(245, 166, 35, 0)');
            ctx.beginPath();
            ctx.moveTo(points[0].x, H - padding.bottom);
            points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.lineTo(points[points.length - 1].x, H - padding.bottom);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            // Line
            ctx.beginPath();
            ctx.strokeStyle = '#F5A623';
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();

            // Dots + labels
            points.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#F5A623';
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();

                const [, month] = months[i].split('-');
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '10px Inter';
                ctx.textAlign = 'center';
                ctx.fillText(monthNames[parseInt(month) - 1], p.x, H - 8);
            });
        });
    }

    // ==========================================
    // AI Assistant
    // ==========================================
    function askAI() {
        const input = $('#aiInput');
        if (!input) return;
        const question = input.value.trim();
        if (!question) return;
        input.value = '';

        const chatArea = $('#aiChatArea');
        if (!chatArea) return;

        // Add user message
        chatArea.innerHTML += `<div class="ai-msg ai-user"><span>Você</span><p>${esc(question)}</p></div>`;

        // Generate AI response based on data analysis
        const response = generateAIResponse(question);
        chatArea.innerHTML += `<div class="ai-msg ai-bot"><span>🤖 Assistente</span><p>${response}</p></div>`;
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function generateAIResponse(question) {
        const q = question.toLowerCase();
        const total = state.costs.reduce((s, c) => s + c.value, 0);
        const now = new Date();
        const monthCosts = state.costs.filter(c => {
            const d = new Date(c.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const monthTotal = monthCosts.reduce((s, c) => s + c.value, 0);

        // Category analysis
        const catTotals = {};
        state.costs.forEach(c => {
            const cat = state.categories.find(cat => cat.id === c.categoryId);
            const name = cat ? cat.name : 'Outros';
            catTotals[name] = (catTotals[name] || 0) + c.value;
        });
        const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

        // Monthly analysis
        const monthMap = {};
        state.costs.forEach(c => {
            const d = new Date(c.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthMap[key] = (monthMap[key] || 0) + c.value;
        });
        const monthKeys = Object.keys(monthMap).sort();

        // Carnê analysis
        const totalReceber = (state.carnes || []).reduce((s, c) => s + c.installments.filter(p => !p.paid).reduce((s2, p) => s2 + p.value, 0), 0);

        if (q.includes('resum') || q.includes('geral') || q.includes('visão')) {
            return `📊 <strong>Resumo Geral:</strong><br>
                • Total acumulado: <strong>${formatCurrency(total)}</strong><br>
                • Este mês: <strong>${formatCurrency(monthTotal)}</strong> (${monthCosts.length} lançamentos)<br>
                • ${state.costs.length} custos registrados em ${monthKeys.length} mês(es)<br>
                • Contas a receber: <strong>${formatCurrency(totalReceber)}</strong><br>
                ${topCats.length > 0 ? `• Maior categoria: <strong>${topCats[0][0]}</strong> (${formatCurrency(topCats[0][1])})` : ''}`;
        }

        if (q.includes('categor') || q.includes('maior') || q.includes('gasta')) {
            if (topCats.length === 0) return 'Nenhum custo registrado ainda para analisar.';
            let resp = '🏷️ <strong>Análise por Categoria:</strong><br>';
            topCats.slice(0, 5).forEach((c, i) => {
                const pct = total > 0 ? (c[1] / total * 100).toFixed(1) : 0;
                resp += `${i + 1}. <strong>${c[0]}</strong>: ${formatCurrency(c[1])} (${pct}%)<br>`;
            });
            if (topCats.length > 0) {
                resp += `<br>💡 <em>A categoria "${topCats[0][0]}" representa a maior parte dos custos. Considere negociar melhores preços ou encontrar alternativas nessa área.</em>`;
            }
            return resp;
        }

        if (q.includes('tendên') || q.includes('evolu') || q.includes('mês') || q.includes('mensal')) {
            if (monthKeys.length < 2) return 'Preciso de pelo menos 2 meses de dados para analisar tendências.';
            const last = monthMap[monthKeys[monthKeys.length - 1]];
            const prev = monthMap[monthKeys[monthKeys.length - 2]];
            const change = prev > 0 ? ((last - prev) / prev * 100) : 0;
            const avgMonthly = total / monthKeys.length;
            return `📈 <strong>Análise de Tendência:</strong><br>
                • Último mês: ${formatCurrency(last)}<br>
                • Mês anterior: ${formatCurrency(prev)}<br>
                • Variação: <strong style="color:${change > 0 ? '#EF4444' : '#10B981'}">${change > 0 ? '+' : ''}${change.toFixed(1)}%</strong><br>
                • Média mensal: ${formatCurrency(avgMonthly)}<br>
                ${change > 5 ? '<br>⚠️ <em>Os custos estão subindo! Revise os gastos recentes para identificar onde economizar.</em>' : change < -5 ? '<br>✅ <em>Bom trabalho! Os custos estão diminuindo.</em>' : '<br>➡️ <em>Os custos estão estáveis.</em>'}`;
        }

        if (q.includes('econom') || q.includes('dica') || q.includes('reduzir') || q.includes('sugestão') || q.includes('ajuda')) {
            let resp = '💡 <strong>Dicas para Economia:</strong><br>';
            if (topCats.length > 0) {
                resp += `1. <strong>${topCats[0][0]}</strong> é sua maior despesa (${formatCurrency(topCats[0][1])}). Pesquise fornecedores alternativos.<br>`;
            }
            if (monthKeys.length >= 2) {
                const vals = monthKeys.map(k => monthMap[k]);
                const maxMonth = Math.max(...vals);
                const maxIdx = vals.indexOf(maxMonth);
                resp += `2. O mês mais caro foi ${monthKeys[maxIdx]} (${formatCurrency(maxMonth)}). Analise o que aconteceu.<br>`;
            }
            resp += `3. Defina um orçamento mensal e monitore semanalmente.<br>`;
            resp += `4. Negocie compras recorrentes em volume para obter descontos.<br>`;
            if (totalReceber > 0) {
                resp += `5. Você tem ${formatCurrency(totalReceber)} a receber em carnês. Cobre os inadimplentes.`;
            }
            return resp;
        }

        if (q.includes('carn') || q.includes('receber') || q.includes('devedor')) {
            const total_carnes = (state.carnes || []).length;
            const quitados = (state.carnes || []).filter(c => c.installments.every(p => p.paid)).length;
            return `📋 <strong>Análise de Carnês:</strong><br>
                • Total de carnês: <strong>${total_carnes}</strong><br>
                • Quitados: <strong>${quitados}</strong><br>
                • Pendentes: <strong>${total_carnes - quitados}</strong><br>
                • A receber: <strong>${formatCurrency(totalReceber)}</strong>`;
        }

        return `Posso ajudar com:<br>
            • <strong>"resumo"</strong> — visão geral dos custos<br>
            • <strong>"categorias"</strong> — análise por categoria<br>
            • <strong>"tendência"</strong> — evolução mensal<br>
            • <strong>"dicas"</strong> — sugestões de economia<br>
            • <strong>"carnê"</strong> — análise de contas a receber<br>
            <br>Faça uma pergunta sobre seus dados financeiros!`;
    }

    // ==========================================
    // Caixa (Bike Café)
    // ==========================================
    let caixaSetup = false;
    function setupCaixa() {
        if (caixaSetup) return;
        caixaSetup = true;
        const form = $('#caixaForm');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); addCaixa(); });

        const valorInput = $('#caixaValor');
        const difInput = $('#caixaDiferenca');
        
        function applyCurrencyMask(el) {
            if (!el) return;
            el.addEventListener('input', (e) => {
                let val = e.target.value.replace(/[^\d-]/g, ''); 
                if (!val) { e.target.value = ''; return; }
                const isNegative = val.startsWith('-');
                val = val.replace('-', '');
                val = (parseInt(val) / 100).toFixed(2);
                e.target.value = (isNegative ? '-' : '') + val.replace('.', ',');
            });
        }
        applyCurrencyMask(valorInput);
        applyCurrencyMask(difInput);
        
        const dataInput = $('#caixaData');
        if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
    }

    function addCaixa() {
        const data = $('#caixaData').value;
        const valor = parseCurrency($('#caixaValor').value);
        const turno = $('#caixaTurno').value;
        const diferenca = parseCurrency($('#caixaDiferenca').value) || 0;
        const obs = $('#caixaObs').value.trim();

        if (!data || valor <= 0 || !turno) {
            showToast('⚠ Preencha os campos obrigatórios (Data, Valor, Turno)');
            return;
        }

        const entry = {
            id: 'caixa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            date: data,
            value: valor,
            turno: turno,
            diferenca: diferenca,
            obs: obs,
            unit_id: state.currentUnit,
            createdAt: new Date().toISOString()
        };

        state.caixa.unshift(entry);
        saveState();
        saveCaixaToSupabase(entry);
        renderCaixa();
        
        $('#caixaValor').value = '';
        $('#caixaDiferenca').value = '';
        $('#caixaObs').value = '';
        showToast('✅ Lançamento de Caixa salvo!');
    }

    function renderCaixa() {
        const list = $('#caixaList');
        const fluxoDiario = $('#caixaFluxoDiario');
        if (!list || !fluxoDiario) return;

        const unitCaixa = state.caixa.filter(c => c.unit_id === state.currentUnit);
        const now = new Date();
        const currentMonthCaixa = unitCaixa.filter(c => {
            const d = new Date(c.date + 'T12:00:00');
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });

        const totalCaixaMes = currentMonthCaixa.reduce((s, c) => s + (c.value - (c.diferenca || 0)), 0);
        const totalDifMes = currentMonthCaixa.reduce((s, c) => s + c.diferenca, 0);
        
        const monthDespesas = state.costs.filter(c => {
            const d = new Date(c.date + 'T12:00:00');
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).reduce((s, c) => s + c.value, 0);

        const lucroEstimado = totalCaixaMes - monthDespesas;

        $('#caixaTotalMes').textContent = formatCurrency(totalCaixaMes);
        $('#caixaDespesasMes').textContent = formatCurrency(monthDespesas);
        $('#caixaLucroMes').textContent = formatCurrency(lucroEstimado);
        $('#caixaLucroMes').style.color = lucroEstimado >= 0 ? '#10B981' : '#EF4444';
        $('#caixaDifTotal').textContent = formatCurrency(totalDifMes);
        $('#caixaDifTotal').style.color = totalDifMes === 0 ? 'var(--text-muted)' : totalDifMes > 0 ? '#10B981' : '#EF4444';

        if (unitCaixa.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>Nenhum lançamento registrado</p></div>';
        } else {
            list.innerHTML = unitCaixa.slice(0, 5).map((c, i) => `
                <div class="entry-item" style="animation-delay:${i * 0.04}s">
                    <div class="entry-color" style="background:#00B894"></div>
                    <div class="entry-info">
                        <div class="entry-desc">${formatDate_PT(c.date)} — ${c.turno.toUpperCase()}</div>
                        <div class="entry-meta">
                            ${c.obs ? `<span>${esc(c.obs)}</span>` : ''}
                            ${c.diferenca !== 0 ? `<span class="dot"></span><span style="color:${c.diferenca > 0 ? '#10B981' : '#EF4444'}">Dif: ${formatCurrency(c.diferenca)}</span>` : ''}
                        </div>
                    </div>
                    <span class="entry-value" style="color:#10B981">+ ${formatCurrency(c.value)}</span>
                    <button class="entry-delete" onclick="GestaoStrada.deleteCaixa('${c.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            `).join('');
        }

        const groupedByDay = {};
        currentMonthCaixa.forEach(c => {
            if (!groupedByDay[c.date]) groupedByDay[c.date] = { caixa: 0, dif: 0 };
            groupedByDay[c.date].caixa += (c.value - (c.diferenca || 0));
            groupedByDay[c.date].dif += c.diferenca;
        });

        const despesasByDay = {};
        state.costs.forEach(c => {
            const d = new Date(c.date + 'T12:00:00');
            if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
                if (!despesasByDay[c.date]) despesasByDay[c.date] = 0;
                despesasByDay[c.date] += c.value;
            }
        });

        const allDates = [...new Set([...Object.keys(groupedByDay), ...Object.keys(despesasByDay)])];
        allDates.sort((a, b) => b.localeCompare(a));

        if (allDates.length === 0) {
            fluxoDiario.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>Sem dados de fluxo para este mês</p></div>';
        } else {
            fluxoDiario.innerHTML = allDates.map((date, i) => {
                const caixaDia = groupedByDay[date] ? groupedByDay[date].caixa : 0;
                const despesaDia = despesasByDay[date] || 0;
                const saldoDia = caixaDia - despesaDia;

                return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-bottom:1px solid rgba(255,255,255,0.05);animation:fadeInUp 0.3s ease-out forwards;animation-delay:${i * 0.05}s">
                        <div style="display:flex;flex-direction:column;">
                            <span style="font-weight:600;font-size:0.85rem">${formatDate_PT(date)}</span>
                            <span style="font-size:0.7rem;color:var(--text-muted)">Despesas: ${formatCurrency(despesaDia)}</span>
                        </div>
                        <div style="text-align:right">
                            <span style="font-weight:700;color:${saldoDia >= 0 ? '#10B981' : '#EF4444'}">${saldoDia >= 0 ? '+' : ''}${formatCurrency(saldoDia)}</span>
                            ${caixaDia > 0 ? `<div style="font-size:0.65rem;color:#10B981">Caixa: ${formatCurrency(caixaDia)}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function formatDate_PT(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
        return dateStr;
    }

    async function saveCaixaToSupabase(entry) {
        if (!supabase) return;
        try {
            await supabase.from('caixa').upsert({
                id: entry.id,
                date: entry.date,
                value: entry.value,
                turno: entry.turno,
                diferenca: entry.diferenca,
                obs: entry.obs,
                unit_id: entry.unit_id
            }, { onConflict: 'id' });
        } catch (e) { }
    }

    async function deleteCaixa(id) {
        showModal('Deseja excluir este lançamento de caixa?', async () => {
            state.caixa = state.caixa.filter(c => c.id !== id);
            saveState();
            renderCaixa();
            if (supabase) {
                try { await supabase.from('caixa').delete().eq('id', id); } catch (e) { }
            }
            showToast('Lançamento excluído');
        });
    }

    // ==========================================
    // Public API
    // ==========================================
    window.GestaoStrada = {
        login, logout, selectUnit, backToLogin,
        deleteCost, deleteCategory, deleteContact, deleteEmployee,
        deleteIngredient, deleteRecipe, switchCalcTab,
        deleteCarne, toggleParcelaPaid, toggleCarne, toggleCostPaid,
        deleteCaixa,
        askAI,
    };

    // ==========================================
    // Boot
    // ==========================================
    async function boot() {
        cacheEls();
        if (typeof loadEmployeesFromSupabase === 'function') await loadEmployeesFromSupabase();
        setupAuth();
        checkAutoLogin();
    }

    // Extend showApp to setup new features
    const _origShowApp = showApp;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
