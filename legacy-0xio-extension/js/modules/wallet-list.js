/**
 * Wallet List Module
 * Handles wallet list display, wallet cards, and wallet management operations
 */

class WalletListModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.passwordManager = null;
        this.walletManager = null;
        
        try {
            this.crypto = new CryptoManager();
        } catch (error) {
            this.crypto = null;
        }
        
        this.currentWalletMenus = new Map();
        this.isImporting = false;
        this.eventListenersBound = false;
        this.isLoadingWalletList = false;
        this.isWalletSwitching = false;
    }

    /**
     * Initialize the wallet list module
     */
    init() {
        this.passwordManager = this.uiManager.getPasswordManager();
        
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for wallet list functionality
     */
    setupEventListeners() {
        if (this.eventListenersBound) {
            return;
        }
        

        this.addEventListenerSafe('create-new-wallet-btn', 'click', () => this.showCreateWalletForm());
        this.addEventListenerSafe('import-wallet-btn', 'click', () => this.showImportWalletForm());
        this.addEventListenerSafe('create-wallet-form', 'submit', (e) => {
            e.preventDefault();
            this.handleCreateWallet();
        });
        this.addEventListenerSafe('import-wallet-form', 'submit', (e) => {
            e.preventDefault();
            this.handleImportWallet();
        });
        this.addEventListenerSafe('refresh-wallets-btn', 'click', () => this.loadWalletList());
        document.addEventListener('click', (e) => this.handleDocumentClick(e));

        this.eventListenersBound = true;
    }

    /**
     * Safe event listener helper
     */
    addEventListenerSafe(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    /**
     * Get wallet manager instance
     */
    getWalletManager() {
        if (!this.walletManager && this.passwordManager) {
            this.walletManager = this.passwordManager.getWalletManager();
        }
        return this.walletManager;
    }

    /**
     * Load and display wallet list
     */
    async loadWalletList() {
        if (this.isLoadingWalletList) {
            return;
        }

        this.isLoadingWalletList = true;

        try {
            const walletManager = this.getWalletManager();
            if (!walletManager) {
                this.isLoadingWalletList = false;
                return;
            }

            const wallets = walletManager.getAllWallets();

            const container = document.getElementById('wallet-list-content');
            if (!container) {
                this.isLoadingWalletList = false;
                return;
            }
            container.innerHTML = '';

            if (!wallets || wallets.length === 0) {
                this.showEmptyWalletList(container);
                this.isLoadingWalletList = false;
                return;
            }
            this.renderWalletCards(container, wallets);
        } catch (error) {
            this.showMessage('Failed to load wallet list', 'error');
        }

        this.isLoadingWalletList = false;
    }

    /**
     * Show empty wallet list message
     */
    showEmptyWalletList(container) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No Wallets Found</h3>
                <p>Create a new wallet or import an existing one to get started.</p>
                <div class="button-group">
                    <button id="create-first-wallet" class="btn btn-primary">Create New Wallet</button>
                    <button id="import-first-wallet" class="btn btn-secondary">Import Wallet</button>
                </div>
            </div>
        `;
        this.addEventListenerSafe('create-first-wallet', 'click', () => this.showCreateWalletForm());
        this.addEventListenerSafe('import-first-wallet', 'click', () => this.showImportWalletForm());
    }

    /**
     * Render wallet cards
     */
    renderWalletCards(container, wallets) {
        const walletManager = this.getWalletManager();
        const activeWalletId = walletManager?.getActiveWallet()?.id;

        for (const wallet of wallets) {
            const isActive = wallet.id === activeWalletId;
            const walletCard = this.createWalletCard(wallet, isActive);
            container.appendChild(walletCard);
        }
    }

    /**
     * Create a wallet card element
     */
    createWalletCard(wallet, isActive) {
        const card = document.createElement('div');
        card.className = `wallet-card ${isActive ? 'active' : ''}`;
        card.dataset.walletId = wallet.id;

        card.innerHTML = `
            <div class="wallet-header">
                <div class="wallet-info">
                    <h3 class="wallet-name">${wallet.name || 'Unnamed Wallet'}</h3>
                    <p class="wallet-address copyable" title="Click to copy address">${wallet.address || 'No address'}</p>
                </div>
                <div class="wallet-menu">
                    <button class="menu-btn" data-wallet-id="${wallet.id}">⋮</button>
                    <div class="menu-dropdown" id="menu-${wallet.id}" style="display: none;">
                        <button class="menu-item" data-action="activate" data-wallet-id="${wallet.id}">
                            ${isActive ? 'Active Wallet' : 'Set as Active'}
                        </button>
                        <button class="menu-item" data-action="export" data-wallet-id="${wallet.id}">Export Wallet</button>
                        <button class="menu-item danger" data-action="delete" data-wallet-id="${wallet.id}">Delete Wallet</button>
                    </div>
                </div>
            </div>
        `;
        this.bindWalletCardEvents(card, wallet.id);

        return card;
    }

    /**
     * Bind events for wallet card
     */
    bindWalletCardEvents(card, walletId) {
        const menuBtn = card.querySelector('.menu-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleWalletMenu(walletId);
            });
        }
        const menuItems = card.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const action = item.dataset.action;
                const itemWalletId = item.dataset.walletId;
                this.handleWalletAction(action, itemWalletId);
                this.closeWalletMenu(itemWalletId);
            });
        });
        const addressElement = card.querySelector('.wallet-address');
        if (addressElement) {
            addressElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyAddressToClipboard(addressElement.textContent);
            });
        }
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('wallet-address') && !card.classList.contains('active')) {
                this.setActiveWallet(walletId);
            }
        });
    }

    /**
     * Toggle wallet menu
     */
    toggleWalletMenu(walletId) {
        this.currentWalletMenus.forEach((isOpen, id) => {
            if (id !== walletId && isOpen) {
                this.closeWalletMenu(id);
            }
        });

        const menu = document.getElementById(`menu-${walletId}`);
        const walletCard = document.querySelector(`[data-wallet-id="${walletId}"]`);
        
        if (menu && walletCard) {
            const isVisible = menu.style.display !== 'none';
            menu.style.display = isVisible ? 'none' : 'block';
            this.currentWalletMenus.set(walletId, !isVisible);
            if (isVisible) {
                walletCard.classList.remove('menu-open');
            } else {
                walletCard.classList.add('menu-open');
            }
        }
    }

    /**
     * Close wallet menu
     */
    closeWalletMenu(walletId) {
        const menu = document.getElementById(`menu-${walletId}`);
        const walletCard = document.querySelector(`[data-wallet-id="${walletId}"]`);
        
        if (menu) {
            menu.style.display = 'none';
            this.currentWalletMenus.set(walletId, false);
        }
        
        if (walletCard) {
            walletCard.classList.remove('menu-open');
        }
    }

    /**
     * Handle document click to close menus
     */
    handleDocumentClick(e) {
        if (!e.target.closest('.wallet-menu')) {
            this.currentWalletMenus.forEach((isOpen, walletId) => {
                if (isOpen) {
                    this.closeWalletMenu(walletId);
                }
            });
        }
    }

    /**
     * Handle wallet actions
     */
    async handleWalletAction(action, walletId) {
        switch (action) {
            case 'activate':
                await this.setActiveWallet(walletId);
                break;
            case 'export':
                await this.exportWallet(walletId);
                break;
            case 'delete':
                await this.deleteWallet(walletId);
                break;
            default:
                break;
        }
    }

    /**
     * Set active wallet
     */
    async setActiveWallet(walletId) {
        if (this.isWalletSwitching) {
            return;
        }

        this.isWalletSwitching = true;
        this.showLoading('Setting wallet as active...');

        try {
            const walletManager = this.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }

            const success = await walletManager.setActiveWallet(walletId);

            if (success) {
                this.showLoading('Refreshing wallet list...');
                await this.loadWalletList();

                this.showLoading('Refreshing wallet data...');
                if (this.uiManager.refreshWalletData) {
                    await this.uiManager.refreshWalletData();
                }

                this.showLoading('Synchronizing wallet instance...');
                if (this.uiManager.syncWalletInstance) {
                    await this.uiManager.syncWalletInstance();
                }

                this.hideLoading();
                this.showMessage('Wallet activated successfully', 'success');
            } else {
                this.hideLoading();
                this.showMessage('Failed to activate wallet', 'error');
            }
        } catch (error) {
            this.hideLoading();
            this.showMessage(`Failed to activate wallet: ${error.message}`, 'error');
        }

        this.isWalletSwitching = false;
    }

    /**
     * Show create wallet form
     */
    showCreateWalletForm() {
        if (this.uiManager.modules?.screenNavigator) {
            this.uiManager.modules.screenNavigator.showScreen('create-wallet');
        } else {
            const createScreen = document.getElementById('create-wallet-screen');
            if (createScreen) {
                createScreen.classList.remove('hidden');
            }
        }
    }

    /**
     * Show import wallet form
     */
    showImportWalletForm() {
        if (this.uiManager.modules?.screenNavigator) {
            this.uiManager.modules.screenNavigator.showScreen('import-wallet');
        } else {
            const importScreen = document.getElementById('import-wallet-screen');
            if (importScreen) {
                importScreen.classList.remove('hidden');
            }
        }
    }

    /**
     * Handle create wallet
     */
    async handleCreateWallet() {
        if (this.isImporting) {
            return;
        }

        this.isImporting = true;
        this.showLoading('Creating wallet...');

        try {
            const walletManager = this.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            const nameInput = document.getElementById('new-wallet-name');
            const walletName = nameInput?.value?.trim() || 'New Wallet';
            const walletData = await this.crypto.generateKeyPair();
            if (!walletData) {
                throw new Error('Failed to generate wallet');
            }
            const walletId = await walletManager.addWallet(
                walletData.address,
                walletData.private_key_b64,
                walletName,
                this.passwordManager.sessionKey
            );

            if (walletId) {
                this.hideLoading();
                this.showMessage(`Wallet "${walletName}" created successfully`, 'success');
                if (nameInput) nameInput.value = '';
                await this.loadWalletList();
                if (this.uiManager.modules?.screenNavigator) {
                    this.uiManager.modules.screenNavigator.showScreen('wallet-list');
                }
            } else {
                throw new Error('Failed to save wallet');
            }
        } catch (error) {
            this.hideLoading();
            this.showMessage(`Failed to create wallet: ${error.message}`, 'error');
        }

        this.isImporting = false;
    }

    /**
     * Handle import wallet
     */
    async handleImportWallet() {
        if (this.isImporting) {
            return;
        }

        this.isImporting = true;
        this.showLoading('Importing wallet...');

        try {
            const walletManager = this.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            const nameInput = document.getElementById('import-wallet-name');
            const privateKeyInput = document.getElementById('import-private-key');
            
            const walletName = nameInput?.value?.trim() || 'Imported Wallet';
            const privateKey = privateKeyInput?.value?.trim();

            if (!privateKey) {
                throw new Error('Private key is required');
            }
            const address = await this.crypto.getAddressFromPrivateKey(privateKey);
            if (!address) {
                throw new Error('Invalid private key');
            }
            const walletId = await walletManager.addWallet(
                address,
                privateKey,
                walletName,
                this.passwordManager.sessionKey
            );

            if (walletId) {
                this.hideLoading();
                this.showMessage(`Wallet "${walletName}" imported successfully`, 'success');
                if (nameInput) nameInput.value = '';
                if (privateKeyInput) privateKeyInput.value = '';
                await this.loadWalletList();
                if (this.uiManager.modules?.screenNavigator) {
                    this.uiManager.modules.screenNavigator.showScreen('wallet-list');
                }
            } else {
                throw new Error('Failed to save wallet');
            }
        } catch (error) {
            this.hideLoading();
            this.showMessage(`Failed to import wallet: ${error.message}`, 'error');
        }

        this.isImporting = false;
    }

    /**
     * Export wallet
     */
    async exportWallet(walletId) {
        const walletManager = this.getWalletManager();
        if (!walletManager) {
            this.showMessage('Wallet manager not available', 'error');
            return;
        }

        try {
            if (!this.passwordManager.sessionKey) {
                throw new Error('Password not available. Please unlock your wallet.');
            }

            const wallet = walletManager.exportWallet(walletId);
            
            if (wallet) {
                const exportData = {
                    name: wallet.name,
                    address: wallet.address,
                    privateKey: wallet.privateKey,
                    exportDate: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${wallet.name || 'wallet'}_export.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this.showMessage('Wallet exported successfully', 'success');
            } else {
                this.showMessage('Failed to export wallet', 'error');
            }
        } catch (error) {
            this.showMessage(`Failed to export wallet: ${error.message}`, 'error');
        }
    }

    /**
     * Delete wallet
     */
    async deleteWallet(walletId) {
        const walletManager = this.getWalletManager();
        if (!walletManager) {
            this.showMessage('Wallet manager not available', 'error');
            return;
        }

        const wallet = walletManager.getWalletById(walletId);
        if (!wallet) {
            this.showMessage('Wallet not found', 'error');
            return;
        }
        const confirmed = await showConfirmDialog(
            'Delete Wallet',
            `Are you sure you want to delete wallet "${wallet.name || 'Unnamed Wallet'}"?\n\nThis action cannot be undone.`,
            'Delete',
            'Cancel'
        );

        if (!confirmed) {
            return;
        }

        this.showLoading('Deleting wallet...');

        try {
            if (!this.passwordManager.sessionKey) {
                throw new Error('Password not available. Please unlock your wallet.');
            }

            const result = await walletManager.deleteWallet(walletId, this.passwordManager.sessionKey);

            if (result && result.success) {
                this.hideLoading();
                this.showMessage('Wallet deleted successfully', 'success');
                await this.loadWalletList();
                if (walletManager.getActiveWallet()?.id === walletId) {
                    if (this.uiManager.refreshWalletData) {
                        await this.uiManager.refreshWalletData();
                    }
                }
            } else {
                this.hideLoading();
                const errorMsg = result?.error || 'Failed to delete wallet';
                this.showMessage(errorMsg, 'error');
            }
        } catch (error) {
            this.hideLoading();
            this.showMessage(`Failed to delete wallet: ${error.message}`, 'error');
        }
    }

    /**
     * Show loading state
     */
    showLoading(message) {
        if (this.uiManager.showLoading) {
            this.uiManager.showLoading(message);
        }
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        if (this.uiManager.hideLoading) {
            this.uiManager.hideLoading();
        }
    }

    /**
     * Copy address to clipboard
     */
    async copyAddressToClipboard(address) {
        try {
            await navigator.clipboard.writeText(address);
            this.showMessage('Address copied to clipboard', 'success');
        } catch (error) {
            const textArea = document.createElement('textarea');
            textArea.value = address;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showMessage('Address copied to clipboard', 'success');
            } catch (fallbackError) {
                this.showMessage('Failed to copy address', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    /**
     * Show message to user
     */
    showMessage(message, type = 'info') {
        if (this.uiManager.showMessage) {
            this.uiManager.showMessage(message, type);
        }
    }
}
window.WalletListModule = WalletListModule;