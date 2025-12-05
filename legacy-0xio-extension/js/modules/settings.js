/**
 * Settings Module
 * Handles all settings functionality including network settings, password configuration, and UI updates
 */

class SettingsModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    /**
     * Initialize settings functionality
     */
    init() {
        this.setupEventListeners();
        this.initializeNetworkSettings();
        this.initializeCustomNetworkEvents();
    }

    /**
     * Set up event listeners for settings
     */
    setupEventListeners() {
        this.addEventListenerSafe('create-password-confirm-btn', 'click', () => this.createPasswordFromSettings());
        this.addEventListenerSafe('auto-lock-select', 'change', () => this.saveAutoLockSetting());
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
     * Update settings screen
     */
    async updateSettingsScreen() {
        try {
            const settingsAddressElement = document.getElementById('settings-address');
            const settingsBalanceElement = document.getElementById('settings-balance');
            
            if (settingsAddressElement && this.uiManager.wallet && this.uiManager.wallet.address) {
                settingsAddressElement.textContent = this.uiManager.wallet.address;
            }
            
            if (settingsBalanceElement && this.uiManager.wallet) {
                const balance = await this.uiManager.wallet.getBalance();
                if (balance !== null) {
                    settingsBalanceElement.textContent = `${balance.toFixed(2)} OCT`;
                }
            }
            await this.updatePasswordBasedUI();
            
        } catch (error) {
        }
    }

    /**
     * Update UI elements based on password state
     */
    async updatePasswordBasedUI() {
        try {
            const data = await chrome.storage.local.get(['hashedPassword', 'passwordSkipped']);
            const hasActualPassword = !!data.hashedPassword;
            const passwordSkipped = !!data.passwordSkipped;
            const isPasswordSet = hasActualPassword && !passwordSkipped;
            const autoLockSection = document.getElementById('auto-lock-section');
            const createPasswordBtn = document.getElementById('create-password-btn');
            const changePasswordBtn = document.getElementById('change-password-btn');
            const lockWalletBtn = document.getElementById('lock-wallet-btn');
            

            if (isPasswordSet) {
                if (autoLockSection) autoLockSection.classList.remove('hidden');
                if (createPasswordBtn) createPasswordBtn.classList.add('hidden');
                if (changePasswordBtn) changePasswordBtn.classList.remove('hidden');
                if (lockWalletBtn) lockWalletBtn.classList.remove('hidden');
            } else {
                if (autoLockSection) autoLockSection.classList.add('hidden');
                if (createPasswordBtn) createPasswordBtn.classList.remove('hidden');
                if (changePasswordBtn) changePasswordBtn.classList.add('hidden');
                if (lockWalletBtn) lockWalletBtn.classList.add('hidden');
            }
        } catch (error) {
        }
    }

    /**
     * Create password from settings screen
     */
    async createPasswordFromSettings() {
        try {
            const data = await chrome.storage.local.get(['hashedPassword', 'passwordSkipped']);
            const hasActualPassword = !!data.hashedPassword && !data.passwordSkipped;
            
            if (hasActualPassword) {
                this.uiManager.modules.uiFeedback.showMessage('Password is already set. Use "Change Password" instead.', 'info');
                return;
            }
            await this.uiManager.showScreen('create-password-screen');
            
        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Failed to open password setup', 'error');
        }
    }

    /**
     * Save auto-lock setting
     */
    async saveAutoLockSetting() {
        try {
            const autoLockSelect = document.getElementById('auto-lock-select');
            if (!autoLockSelect) return;

            const timeoutMinutes = parseInt(autoLockSelect.value);

            /*console.log('Saving auto-lock setting:', {
                value: timeoutMinutes,
                storageKey: 'autoLockDuration'
            }); */

            await chrome.storage.local.set({
                autoLockDuration: timeoutMinutes
            });
            const selectedOption = autoLockSelect.options[autoLockSelect.selectedIndex];
            const timeText = selectedOption ? selectedOption.textContent : `${timeoutMinutes} minutes`;

            this.uiManager.modules.uiFeedback.showMessage('Settings Saved', `Auto-lock timeout set to: ${timeText}`, 'success');
        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Error', 'Failed to save auto-lock setting', 'error');
        }
    }

    /**
     * Initialize network settings functionality
     */
    async initializeNetworkSettings() {
        try {
            const currentNetwork = await this.getCurrentNetwork();
            const settingsBtn = document.getElementById('settings-btn');
            if (settingsBtn) {
                const originalHandler = settingsBtn.onclick;
                settingsBtn.onclick = async () => {
                    if (originalHandler) originalHandler();
                    await this.populateNetworkOptions();
                };
            }
            await this.updateNetworkConfig(currentNetwork);
            
        } catch (error) {
        }
    }

    /**
     * Get current network from storage
     */
    async getCurrentNetwork() {
        try {
            const result = await chrome.storage.local.get([window.OctraConfig.STORAGE.KEYS.CURRENT_NETWORK]);
            const storedNetwork = result[window.OctraConfig.STORAGE.KEYS.CURRENT_NETWORK];
            return storedNetwork || 'testnet';
        } catch (error) {
            return 'testnet';
        }
    }

    /**
     * Update network configuration
     */
    async updateNetworkConfig(networkId) {
        try {
            const networkConfig = window.OctraConfig.NETWORKS[networkId];
            if (!networkConfig) {
                throw new Error(`Network configuration not found: ${networkId}`);
            }
            window.OctraConfig.NETWORK.RPC_URL = networkConfig.rpc_url;
            window.OctraConfig.NETWORK.EXPLORER_URL = networkConfig.explorer_url;
            window.OctraConfig.NETWORK.EXPLORER_ADDRESS_URL = networkConfig.explorer_address_url;

        } catch (error) {
        }
    }

    /**
     * Populate network options in the settings screen
     */
    async populateNetworkOptions() {
        try {
            const networkOptionsContainer = document.getElementById('network-options');
            if (!networkOptionsContainer) {
                return;
            }

            const currentNetwork = await this.getCurrentNetwork();
            const customConfig = await this.getCustomNetworkConfig();
            if (customConfig) {
                window.OctraConfig.NETWORKS.custom = {
                    ...window.OctraConfig.NETWORKS.custom,
                    ...customConfig,
                    color: '#8b5cf6',
                    editable: true
                };
            }
            networkOptionsContainer.innerHTML = '';
            Object.entries(window.OctraConfig.NETWORKS).forEach(([networkId, config]) => {
                
                const optionElement = document.createElement('div');
                const isCustomEmpty = networkId === 'custom' && !config.rpc_url;
                
                
                optionElement.className = `network-option ${currentNetwork === networkId ? 'active' : ''}`;
                optionElement.style.cursor = 'pointer';
                optionElement.style.pointerEvents = 'auto';
                optionElement.innerHTML = `
                    <div class="network-option-content">
                        <div class="network-indicator ${networkId}"></div>
                        <div class="network-details">
                            <div class="network-name">${config.name}</div>
                            <div class="network-url">${isCustomEmpty ? 'Click to configure' : config.rpc_url}</div>
                        </div>
                    </div>
                    <div class="network-status ${currentNetwork === networkId ? 'active' : ''}">
                        ${currentNetwork === networkId ? '● Active' : (isCustomEmpty ? 'Configure' : 'Select')}
                    </div>
                `;
                optionElement.addEventListener('click', (e) => {
                    const customFormContainer = document.getElementById('custom-network-config');
                    const isFormVisible = customFormContainer && !customFormContainer.classList.contains('hidden');
                    if (isFormVisible) {
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                    e.stopPropagation();
                    
                    if (networkId === 'custom' && !config.rpc_url) {
                        this.showCustomNetworkForm();
                    } else {
                        if (networkId === 'custom' && config.rpc_url) {
                            if (currentNetwork === 'custom') {
                                this.showCustomNetworkForm();
                            } else {
                                this.switchNetwork(networkId);
                            }
                        } else {
                            this.switchNetwork(networkId);
                        }
                    }
                });

                
                networkOptionsContainer.appendChild(optionElement);
            });
            await this.updateNetworkInfoDisplay(currentNetwork);

        } catch (error) {
        }
    }

    /**
     * Update network info display
     */
    async updateNetworkInfoDisplay(networkId) {
        try {
            const config = window.OctraConfig.NETWORKS[networkId];
            if (!config) return;

            const elements = {
                'current-network-name': config.name,
                'current-network-rpc': config.rpc_url,
                'current-network-explorer': new URL(config.explorer_url).hostname
            };

            Object.entries(elements).forEach(([elementId, value]) => {
                const element = document.getElementById(elementId);
                if (element) {
                    element.textContent = value;
                }
            });
        } catch (error) {
        }
    }

    /**
     * Switch to a different network
     */
    async switchNetwork(networkId) {
        try {
            
            const config = window.OctraConfig.NETWORKS[networkId];
            if (!config) {
                throw new Error(`Network configuration not found: ${networkId}`);
            }

            this.uiManager.modules.uiFeedback.showLoading(`Switching to ${config.name}...`);
            await chrome.storage.local.set({
                [window.OctraConfig.STORAGE.KEYS.CURRENT_NETWORK]: networkId
            });
            await this.updateNetworkConfig(networkId);

            this.uiManager.modules.uiFeedback.hideLoading();
            this.uiManager.modules.uiFeedback.showMessage(`Network switched to ${config.name}`, 'success');
            await this.populateNetworkOptions();
            setTimeout(() => {
                if (this.uiManager.updateWalletDisplay) {
                    this.uiManager.updateWalletDisplay();
                }
            }, 1000);

        } catch (error) {
            this.uiManager.modules.uiFeedback.hideLoading();
            this.uiManager.modules.uiFeedback.showMessage(`Failed to switch network: ${error.message}`, 'error');
        }
    }

    /**
     * Initialize custom network events
     */
    initializeCustomNetworkEvents() {
        this.addEventListenerSafe('custom-network-save-btn', 'click', () => this.saveCustomNetwork());
        this.addEventListenerSafe('custom-network-cancel-btn', 'click', () => this.hideCustomNetworkForm());
    }

    /**
     * Show custom network configuration form
     */
    async showCustomNetworkForm() {
        try {
            const customConfig = await this.getCustomNetworkConfig();
            const nameInput = document.getElementById('custom-network-name');
            const rpcInput = document.getElementById('custom-network-rpc');
            const explorerInput = document.getElementById('custom-network-explorer');

            if (nameInput) nameInput.value = customConfig?.name || '';
            if (rpcInput) rpcInput.value = customConfig?.rpc_url || '';
            if (explorerInput) explorerInput.value = customConfig?.explorer_url || '';
            const formContainer = document.getElementById('custom-network-config');
            if (formContainer) {
                formContainer.classList.remove('hidden');
            }
            const networkOptionsContainer = document.getElementById('network-options');
            if (networkOptionsContainer) {
                networkOptionsContainer.classList.add('form-active');
            }
            const customNetworkConfig = document.getElementById('custom-network-config');
            if (customNetworkConfig) {
                customNetworkConfig.addEventListener('click', (e) => {
                    if (e.target === customNetworkConfig) {
                        this.hideCustomNetworkForm();
                    }
                });
            }

        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Failed to load custom network form', 'error');
        }
    }

    /**
     * Hide custom network configuration form
     */
    hideCustomNetworkForm() {
        const formContainer = document.getElementById('custom-network-config');
        if (formContainer) {
            formContainer.classList.add('hidden');
        }
        const networkOptionsContainer = document.getElementById('network-options');
        if (networkOptionsContainer) {
            networkOptionsContainer.classList.remove('form-active');
        }
    }

    /**
     * Get custom network configuration from storage
     */
    async getCustomNetworkConfig() {
        try {
            const result = await chrome.storage.local.get(['customNetworkConfig']);
            return result.customNetworkConfig || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Save custom network configuration
     */
    async saveCustomNetwork() {
        try {
            const nameInput = document.getElementById('custom-network-name');
            const rpcInput = document.getElementById('custom-network-rpc');
            const explorerInput = document.getElementById('custom-network-explorer');

            if (!nameInput || !rpcInput || !explorerInput) {
                throw new Error('Form elements not found');
            }

            const name = nameInput.value.trim();
            const rpcUrl = rpcInput.value.trim();
            const explorerUrl = explorerInput.value.trim();
            if (!name || !rpcUrl || !explorerUrl) {
                this.uiManager.modules.uiFeedback.showMessage('Please fill in all fields', 'error');
                return;
            }
            try {
                new URL(rpcUrl);
                new URL(explorerUrl);
            } catch (urlError) {
                this.uiManager.modules.uiFeedback.showMessage('Please enter valid URLs', 'error');
                return;
            }

            this.uiManager.modules.uiFeedback.showLoading('Saving custom network...');
            const customConfig = {
                name,
                rpc_url: rpcUrl,
                explorer_url: explorerUrl,
                explorer_address_url: `${explorerUrl}/address/`
            };

            await chrome.storage.local.set({
                customNetworkConfig: customConfig
            });
            window.OctraConfig.NETWORKS.custom = {
                ...window.OctraConfig.NETWORKS.custom,
                ...customConfig,
                color: '#8b5cf6',
                editable: true
            };

            this.uiManager.modules.uiFeedback.hideLoading();
            this.uiManager.modules.uiFeedback.showMessage(`Custom network "${name}" saved successfully`, 'success');
            this.hideCustomNetworkForm();
            await this.populateNetworkOptions();

        } catch (error) {
            this.uiManager.modules.uiFeedback.hideLoading();
            this.uiManager.modules.uiFeedback.showMessage(`Failed to save custom network: ${error.message}`, 'error');
        }
    }
}
window.SettingsModule = SettingsModule;