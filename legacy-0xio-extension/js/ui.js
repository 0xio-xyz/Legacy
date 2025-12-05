/**
 * UI module for 0xio Wallet Extension
 * Handles all user interface interactions and screen management
 */

class UIManager {
    constructor() {
        this.wallet = new OctraWallet();
        this.passwordManager = new PasswordManager();
        this.modules = {}; 
        this.currentScreen = null;
        this.loadingOverlay = null;
        this.messageTimeout = null;
        this.sessionData = {
            lastActivity: Date.now(),
            autoLockDuration: 300,
            isLocked: false
        };
        this.isGeneratingWallet = false;
        this.isSettingUpPassword = false;
        this.isSettingUpInitial = false;
        this.isImportingWallet = false;
        this.initErrorHandling();
        this.initSessionManagement();
        this.initEventListeners();
        this.initContractTasks();
        this.initializeLoadingOverlay();
        
    }

    /**
     * Initialize error handling integration
     */
    initErrorHandling() {
        if (window.errorHandler) {
            window.errorHandler.addListener((errorInfo) => {
                this.handleError(errorInfo);
            });
            
        } else {
        }
    }
    
    /**
     * Handle errors reported by error handler
     * @param {Object} errorInfo
     */
    handleError(errorInfo) {
        if (errorInfo.type === 'promise' || errorInfo.type === 'javascript') {
            if (!this.lastErrorTime || Date.now() - this.lastErrorTime > 5000) {
                this.lastErrorTime = Date.now();
                const friendlyMessage = this.getFriendlyErrorMessage(errorInfo);
                this.showMessage(friendlyMessage, 'error');
            }
        }
    }
    
    /**
     * Convert technical error to user-friendly message
     * @param {Object} errorInfo
     * @returns {string}
     */
    getFriendlyErrorMessage(errorInfo) {
        const message = errorInfo.message?.toLowerCase() || '';
        
        if (message.includes('network') || message.includes('fetch')) {
            return 'Network connection issue. Please check your internet connection and try again.';
        } else if (message.includes('storage') || message.includes('quota')) {
            return 'Storage issue detected. You may need to clear some browser data.';
        } else if (message.includes('wallet') || message.includes('key')) {
            return 'Wallet operation failed. Please try again or contact support if the issue persists.';
        } else {
            return 'An unexpected error occurred. The application is attempting to recover automatically.';
        }
    }
    
    /**
     * Refresh current screen
     */
    refreshCurrentScreen() {
        if (this.currentScreen) {
            this.updateScreenContent(this.currentScreen);
        }
    }

    /**
     * Initialize session management
     */
    initSessionManagement() {
        chrome.storage.local.get(['sessionData'], (result) => {
            if (result.sessionData) {
                this.sessionData = {
                    ...this.sessionData,
                    ...result.sessionData,
                    lastActivity: Date.now() 
                };
            } else {
                this.sessionData.lastActivity = Date.now();
            }
        });
        this.passwordCheckCache = null;
        setInterval(() => this.checkSession(), 60000); 
    }

    /**
     * Update last activity timestamp
     */
    updateLastActivity() {
        this.sessionData.lastActivity = Date.now();
        chrome.storage.local.set({ sessionData: this.sessionData });
    }

    /**
     * Update user activity timestamp
     */
    updateActivity() {
        this.sessionData.lastActivity = Date.now();
        chrome.storage.local.set({ sessionData: this.sessionData });
        if (this.passwordManager && this.passwordManager.isWalletUnlocked()) {
            this.passwordManager.updateLastActivity();
        }
    }

    /**
     * Check session status
     */
    checkSession() {
        const now = Date.now();
        const timeSinceActivity = now - this.sessionData.lastActivity;
        if (this.sessionData.isLocked || this.sessionData.autoLockDuration === 0) {
            return; 
        }

        if (timeSinceActivity <= (this.sessionData.autoLockDuration * 1000)) {
            return; 
        }
        if (!this.passwordCheckCache || (now - this.passwordCheckCache.timestamp) > 30000) {
            chrome.storage.local.get(['hashedPassword', 'passwordSkipped']).then(data => {
                this.passwordCheckCache = {
                    hasPassword: !!data.hashedPassword && !data.passwordSkipped,
                    timestamp: now
                };
                
                if (this.passwordCheckCache.hasPassword) {
                    this.lockWallet();
                } else {
                }
            }).catch(error => {
            });
        } else {
            if (this.passwordCheckCache.hasPassword) {
                this.lockWallet();
            }
        }
    }

    /**
     * Initialize modules
     */
    async initializeModules() {
        try {
            if (window.moduleLoader) {
                if (!this.modules || Object.keys(this.modules).length === 0) {
                    this.modules = window.moduleLoader.initializeModules(this);
                } else {
                }
            } else {
                this.modules = {};
            }
        } catch (error) {
            this.modules = {}; 
        }
    }

    /**
     * Initialize the UI
     */
    async init() {
        try {
            await this.loadThemeSetting();
            await this.initializeModules();
            await this.debugStorageState();
            this.bindEvents();
            await this.passwordManager.waitForInitialization();
            await this.loadAutoLockSetting();
            const authStatus = await WalletService.getAuthStatus(this.passwordManager);
            
            if (!authStatus.isPasswordSet) {
                this.showScreen('first-time-setup');
            } else {
                const storage = await chrome.storage.local.get(['passwordSkipped']);
                const passwordSkipped = !!storage.passwordSkipped;
                
                if (passwordSkipped) {
                    const walletManager = this.passwordManager.getWalletManager();
                    if (!walletManager) {
                        this.showScreen('first-time-setup');
                        return;
                    }
                    if (!walletManager.isReady()) {
                        const sessionKey = this.passwordManager.sessionKey;
                        if (!sessionKey) {
                            this.showScreen('first-time-setup');
                            return;
                        }
                        const initSuccess = await walletManager.initialize(sessionKey);

                        if (!initSuccess) {
                            this.showScreen('first-time-setup');
                            return;
                        }
                    }
                    const walletCount = walletManager.getWalletCount();

                    if (walletCount === 0) {
                        this.showScreen('first-time-setup');
                    } else {
                        try {
                            await this.initializeWalletWithActiveData();
                        } catch (error) {
                        }

                        await this.showScreen('main-screen');
                    }
                } else {
                    const isUnlocked = this.passwordManager.isWalletUnlocked();
                    
                    if (!isUnlocked) {
                        this.showScreen('password-unlock-screen');
                    } else {
                        const walletManager = this.passwordManager.getWalletManager();
                        const isWalletManagerInitialized = walletManager?.isReady() || false;
                        

                        if (!isWalletManagerInitialized) {
                            this.showScreen('password-unlock-screen');
                        } else {
                            const walletCount = walletManager.getWalletCount();
                            
                            if (walletCount === 0) {
                                        this.showScreen('first-time-setup');
                            } else {
                                try {
                                    await this.initializeWalletWithActiveData();
                                        } catch (error) {
                                }
                                
                                await this.showScreen('main-screen');
                            }
                        }
                    }
                }
            }

            return true;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
        const addEventListenerSafe = (id, event, handler) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener(event, (e) => {
                    this.updateActivity(); 
                    handler(e);
                });
            } else {
            }
        };
        addEventListenerSafe('type-generate', 'change', () => this.updateWalletTypeDisplay());
        addEventListenerSafe('type-import', 'change', () => this.updateWalletTypeDisplay());
        this.setupNavigationListeners({
            'send-btn': 'send-screen',
            'receive-btn': 'receive-screen', 
            'wallets-btn': 'wallet-list-screen',
            'history-btn': 'history-screen',
            'settings-btn': 'settings-screen',
            'network-settings-btn': 'network-settings-screen',
            'encrypt-balance-btn': 'encrypt-balance-screen',
            'decrypt-balance-btn': 'decrypt-balance-screen',
            'claim-transfers-btn': 'claim-transfers-screen',
            'send-back': 'main-screen',
            'receive-back': 'main-screen',
            'history-back': 'main-screen',
            'settings-back': 'main-screen',
            'encrypt-balance-back': 'main-screen',
            'decrypt-balance-back': 'main-screen',
            'claim-transfers-back': 'main-screen',
            'network-settings-back': 'settings-screen',
            'wallet-list-back': 'main-screen',
            'add-wallet-btn': 'add-wallet-screen',
            'add-wallet-back': 'wallet-list-screen',
            'generate-wallet-back': 'add-wallet-screen',
            'import-wallet-back': 'add-wallet-screen',
            'password-setup-back': 'first-time-setup'
        });
        addEventListenerSafe('generate-wallet-option', 'click', () => this.createNewWallet());
        addEventListenerSafe('import-wallet-option', 'click', () => this.importWalletWithDifferentiation());
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.altKey && e.key === 'C') {
                this.handleEmergencyStorageClear();
            }
        });
        addEventListenerSafe('send-amount', 'input', () => this.updateTransactionSummary());
        addEventListenerSafe('send-address', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const sendAmount = document.getElementById('send-amount');
                if (sendAmount) sendAmount.focus();
            }
        });
        addEventListenerSafe('send-amount', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.sendTransaction();
            }
        });
        addEventListenerSafe('bulk-private-recipient-address', 'input', () => this.hideMessage());
        addEventListenerSafe('bulk-private-recipient-amount', 'input', () => this.hideMessage());
        addEventListenerSafe('address-display', 'click', () => this.copyAddress());
        addEventListenerSafe('receive-address-display', 'click', () => this.copyAddress());
        addEventListenerSafe('wallet-details-address', 'click', () => this.copyAddress());
        addEventListenerSafe('wallet-details-private-key', 'click', () => this.copyPrivateKey());
        addEventListenerSafe('wallet-details-mnemonic', 'click', () => this.copyMnemonic());
        addEventListenerSafe('address-display', 'contextmenu', (e) => this.handleAddressContextMenu(e));
        addEventListenerSafe('receive-address-display', 'contextmenu', (e) => this.handleAddressContextMenu(e));
        addEventListenerSafe('wallet-details-back', 'click', () => {
            const walletManager = this.getWalletManager();
            if (walletManager && this.tempWalletObject) {
                const index = walletManager.wallets.findIndex(w => w.id === this.tempWalletObject.id);
                if (index !== -1) {
                    walletManager.wallets.splice(index, 1);
                }
            }
            this.tempWalletData = null;
            this.tempWalletObject = null;
            this.currentWalletData = null;
            this.initialWalletSetup = null;
            this.showScreen('first-time-setup');
        });

        addEventListenerSafe('wallet-details-continue', 'click', async () => {
            try {
                const isWalletCreation = this.tempWalletData || this.tempWalletObject;

                if (isWalletCreation) {
                    this.showSimpleMnemonicVerification();
                } else {
                    await this.initializeWalletWithActiveData();
                    await this.showScreen('main-screen');
                    await this.updateWalletDisplay();
                }
            } catch (error) {
                this.showMessage('Failed to continue: ' + error.message, 'error');
            }
        });
        addEventListenerSafe('lock-wallet-btn', 'click', () => this.lockWallet());
        addEventListenerSafe('about-octra-btn', 'click', () => this.openAboutOctra());
        this.initializeNetworkSettings();
        this.initializeCustomNetworkEvents();
        this.initializeFloatingConnectionIndicator();
        addEventListenerSafe('setup-password', 'input', () => {
            this.updatePasswordStrength('setup-password', 'strength-bar', 'strength-text');
            this.toggleConfirmPasswordField();
        });
        addEventListenerSafe('setup-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const confirmPassword = document.getElementById('confirm-password');
                if (confirmPassword) confirmPassword.focus();
            }
        });
        addEventListenerSafe('confirm-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const form = document.getElementById('password-setup-form');
                if (form) form.requestSubmit();
            }
        });
        addEventListenerSafe('skip-password-btn', 'click', () => this.skipPasswordSetup());
        addEventListenerSafe('unlock-wallet-btn', 'click', () => this.unlockWallet());
        addEventListenerSafe('unlock-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.unlockWallet();
            }
        });
        addEventListenerSafe('reset-wallet-from-unlock', 'click', () => this.resetWallet());
        addEventListenerSafe('theme-toggle', 'change', () => this.updateThemeSetting());
        addEventListenerSafe('auto-lock-select', 'change', () => this.updateAutoLockSetting());
        addEventListenerSafe('create-password-btn', 'click', () => this.showCreatePasswordFlow());
        addEventListenerSafe('change-password-btn', 'click', () => this.showScreen('change-password-screen'));
        addEventListenerSafe('back-to-settings-from-change-password', 'click', () => this.showScreen('settings-screen'));
        addEventListenerSafe('create-password-back', 'click', () => this.showScreen('settings-screen'));
        addEventListenerSafe('create-password-confirm-btn', 'click', () => this.createPasswordFromSettings());
        addEventListenerSafe('create-new-password', 'input', () => this.updatePasswordStrength('create-new-password', 'create-strength-bar', 'create-strength-text'));
        addEventListenerSafe('create-new-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const confirmPassword = document.getElementById('create-confirm-password');
                if (confirmPassword) confirmPassword.focus();
            }
        });
        addEventListenerSafe('create-confirm-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createPasswordFromSettings();
            }
        });
        addEventListenerSafe('encrypt-balance-back', 'click', () => this.showScreen('main-screen'));
        addEventListenerSafe('decrypt-balance-back', 'click', () => this.showScreen('main-screen'));
        addEventListenerSafe('private-send-back', 'click', () => this.showScreen('main-screen'));
        addEventListenerSafe('claim-transfers-back', 'click', () => this.showScreen('main-screen'));
        addEventListenerSafe('bulk-send-back', 'click', () => this.showScreen('main-screen'));
        addEventListenerSafe('change-password-confirm-btn', 'click', () => this.changePassword());
        addEventListenerSafe('new-password', 'input', () => this.updatePasswordStrength('new-password', 'new-strength-bar', 'new-strength-text'));
        addEventListenerSafe('current-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const newPassword = document.getElementById('new-password');
                if (newPassword) newPassword.focus();
            }
        });
        addEventListenerSafe('new-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const confirmNewPassword = document.getElementById('confirm-new-password');
                if (confirmNewPassword) confirmNewPassword.focus();
            }
        });
        addEventListenerSafe('confirm-new-password', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.changePassword();
            }
        });
        addEventListenerSafe('message-close', 'click', () => this.hideMessage());
        addEventListenerSafe('refresh-balance-btn', 'click', () => this.refreshBalance());
        addEventListenerSafe('tasks-btn', 'click', () => this.showScreen('tasks-screen'));
        addEventListenerSafe('tasks-back-btn', 'click', () => this.showScreen('main-screen'));
        addEventListenerSafe('start-ocs01-task', 'click', () => this.startOCS01Task());
        addEventListenerSafe('view-ocs01-info', 'click', () => this.viewOCS01Info());
        let activityThrottle = null;
        const throttledActivityHandler = () => {
            if (activityThrottle) return;
            activityThrottle = setTimeout(() => {
                this.updateLastActivity();
                this.passwordManager.resetAutoLockTimer();
                activityThrottle = null;
            }, window.OctraConfig?.UI?.ACTIVITY_THROTTLE || 3000); 
        };
        
        document.addEventListener('click', throttledActivityHandler);
        document.addEventListener('keypress', throttledActivityHandler);
    }

    /**
     * Initialize contract tasks system
     */
    initContractTasks() {
        try {
            if (typeof window.ContractTasks !== 'undefined') {
                this.contractTasks = new window.ContractTasks(
                    this.wallet.network,
                    this
                );
                window.contractTasks = this.contractTasks;
                
            } else {
            }
        } catch (error) {
        }
    }

    /**
     * Check wallet status on startup
     */
    async checkWalletStatus() {
        try {
            const isPasswordSet = await this.passwordManager.isPasswordSet();
            
            if (isPasswordSet) {
                const isUnlocked = this.passwordManager.isWalletUnlocked();
                
                if (isUnlocked) {
                    await this.initializeWalletWithActiveData();
                    
                    await this.showScreen('main-screen');
                } else {
                    this.showScreen('password-unlock-screen');
                }
            } else {
                const walletData = await this.loadWalletFromStorage();
                
                if (walletData && walletData.privateKey && walletData.address) {
                    this.tempWalletData = walletData;
                    this.showScreen('password-setup-screen');
                } else {
                    this.showScreen('first-time-setup');
                }
            }
            
        } catch (error) {
            this.showScreen('first-time-setup');
        }
    }

    /**
     * Show specific screen
     * @param {string} screenId
     */
    async showScreen(screenId) {
        
        if (this.modules?.screenNavigator) {
            return this.modules.screenNavigator.showScreen(screenId);
        }
        try {
            await window.domUtils.safeShowScreen(screenId, this.currentScreen);
            this.currentScreen = screenId;
                this.hideConnectionIndicator();
            await this.updateScreenContent(screenId);
            
        } catch (error) {
            if (window.domUtils) {
                window.domUtils.debugDOMState();
            }
            try {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });

        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.remove('hidden');
            this.currentScreen = screenId;
                    await this.updateScreenContent(screenId);
                } else {
                    if (screenId !== 'main-screen') {
                        await this.showScreen('main-screen');
                    }
                }
            } catch (fallbackError) {
                throw new Error(`Critical: Could not show screen '${screenId}'. Extension may need to be reloaded.`);
            }
        }
    }

    /**
     * Update content for specific screens
     * @param {string} screenId
     */
    async updateScreenContent(screenId) {
        switch (screenId) {
            case 'main-screen':
                this.updateWalletDisplaySync();
                this.updateWalletDisplayAsync();
                break;
            case 'receive-screen':
                this.updateReceiveScreen();
                break;
            case 'send-screen':
                await this.updateSendScreen();
                break;
            case 'settings-screen':
                await this.updateSettingsScreen();
                break;
            case 'wallet-list-screen':
                if (this.modules?.walletList) {
                    await this.modules.walletList.loadWalletList();
                }
                break;
            case 'history-screen':
                break;
            case 'bulk-send-screen':
                if (this.modules?.bulkSend) {
                    await this.modules.bulkSend.updateBulkDisplay();
                }
                break;
            case 'bulk-private-send-screen':
                if (this.modules?.bulkPrivateSend) {
                    await this.modules.bulkPrivateSend.updateBulkPrivateDisplay();
                }
                break;
            case 'encrypt-balance-screen':
                await this.updateEncryptBalanceScreen();
                break;
            case 'decrypt-balance-screen':
                await this.updateDecryptBalanceScreen();
                break;
            case 'private-send-screen':
                await this.updatePrivateSendScreen();
                break;
            case 'claim-transfers-screen':
                await this.updateClaimTransfersScreen();
                break;
        }
    }

    /**
     * Generate new wallet from form
     */
    async generateNewWallet() {
        const startTime = performance.now();
        if (this.isGeneratingWallet) {
            return;
        }
        this.isGeneratingWallet = true;
        
        try {
            const form = document.getElementById('generate-wallet-form');
            if (!form) {
                throw new Error('Generate wallet form not found');
            }
            
            const formData = new FormData(form);
            const walletName = formData.get('wallet-name')?.trim();
            
            if (!walletName) {
                this.showMessage('Please enter a wallet name', 'error');
                return;
            }
            
            this.showLoading('Generating wallet...');
            if (!this.passwordManager) {
                throw new Error('Password manager not initialized');
            }
            let isPasswordSet = await this.passwordManager.isPasswordSet();
            if (!isPasswordSet) {
                await new Promise(resolve => setTimeout(resolve, 200));
                isPasswordSet = await this.passwordManager.isPasswordSet();
            }
            if (!isPasswordSet) {
                throw new Error('Password not set. Please go through the setup process.');
            }
            const walletData = await window.octraCrypto.generateWallet();
            if (!walletData) {
                throw new Error('Failed to generate wallet data');
            }
            const walletManager = this.passwordManager.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            const createResult = await walletManager.createWallet(walletName, this.passwordManager.sessionKey, true);
            if (!createResult.success) {
                throw new Error(createResult.error || 'Failed to create wallet');
            }
            const wallet = createResult.wallet;
            const setActiveResult = await walletManager.setActiveWallet(wallet.id);
            if (!setActiveResult) {
            }
            
            this.showMessage('Wallet created successfully', 'success');
            await this.showWalletDetails(wallet, 'created');
            
        } catch (error) {
            const errorMessage = error.message || 'Failed to generate wallet';
            
            if (errorMessage.includes('already exists')) {
                this.showWalletNameConflictError();
            } else {
                this.showMessage('Error', 'Failed to generate wallet: ' + errorMessage, 'error');
            }
        } finally {
            this.isGeneratingWallet = false;
            this.hideLoading();
            const endTime = performance.now();
        }
    }

    /**
     * Unlock the wallet
     */
    async unlockWallet() {
        try {
            const passwordInput = document.getElementById('unlock-password');
            if (!passwordInput) {
                throw new Error('Password input not found');
            }
            
            const password = passwordInput.value;
            if (!password) {
                this.showMessage('Please enter your password', 'error');
                return;
            }
            
            this.showLoading('Unlocking wallet...');
            const isValid = await this.passwordManager.verifyPassword(password);
            
            if (isValid) {
                this.showMessage('Wallet unlocked successfully', 'success');
                passwordInput.value = '';
                const walletManager = this.passwordManager.getWalletManager();
                if (walletManager) {
                    const initSuccess = await walletManager.initialize(password);
                    if (!initSuccess) {
                        throw new Error('Failed to initialize wallet manager');
                    }
                } else {
                    throw new Error('Wallet manager not available');
                }
                const walletCount = walletManager.getWalletCount();
                
                if (walletCount === 0) {
                    this.showScreen('first-time-setup');
                } else {
                    const recoveryInfo = walletManager.getRecoveryInfo();
                    if (recoveryInfo.recoveredFromCorruption) {
                        const corruptedCount = recoveryInfo.corruptedWallets.length;
                        let message;
                        
                        if (recoveryInfo.cleanedUpCorruptedData) {
                            message = `Extension recovered from corrupted wallet data. ${corruptedCount} incomplete wallet(s) were cleaned up. You can now create new wallets safely.`;
                        } else {
                            message = `Wallet unlocked successfully. ${corruptedCount} corrupted wallet(s) were automatically removed from storage.`;
                        }
                        
                        this.showMessage(message, 'warning');
                        walletManager.clearRecoveryInfo();
                    }
                    await this.initializeWalletWithActiveData();
                    
                    await this.showScreen('main-screen');
                    this.updateWalletDisplayAsync();
                }
            } else {
                this.showMessage('Invalid password', 'error');
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            if (error.message.includes('corrupted') || error.message.includes('decrypt')) {
                const message = 'Wallet storage appears to be corrupted. ' + error.message +
                    '\n\nWould you like to reset your wallet storage? This will clear all data.';
                const confirmed = await showConfirmDialog(
                    'Corrupted Wallet Storage',
                    message,
                    'Reset Wallet',
                    'Cancel'
                );
                if (confirmed) {
                    await this.resetWallet();
                } else {
                    this.showMessage('Wallet unlock failed due to corruption. Use Settings > Reset Wallet if you want to start fresh.', 'error');
                }
            } else {
                this.showMessage('Failed to unlock wallet: ' + error.message, 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Handle unlock form submission
     */
    async handleUnlockForm(event) {
        event.preventDefault();
        await this.unlockWallet();
    }

    /**
     * Lock the wallet (UI wrapper for PasswordManager)
     */
    async lockWallet() {
        try {
            const data = await chrome.storage.local.get(['hashedPassword', 'passwordSkipped']);
            const hasActualPassword = !!data.hashedPassword;
            const passwordSkipped = !!data.passwordSkipped;
            
            if (!hasActualPassword || passwordSkipped) {
                this.showMessage('Cannot lock wallet: No password is set. Create a password first to enable wallet locking.', 'error');
                return;
            }
            
            this.passwordManager.lockWallet();
            
            this.showScreen('password-unlock-screen');
            this.showMessage('Wallet locked successfully', 'success');
        } catch (error) {
            this.showMessage(`Failed to lock wallet: ${error.message}`, 'error');
        } finally {
        }
    }

    /**
     * Open About Octra documentation
     */
    openAboutOctra() {
        try {
            chrome.tabs.create({ url: 'https://docs.octra.org/' });
        } catch (error) {
            this.showMessage('Failed to open About Octra documentation', 'error');
        }
    }

    /**
     * Get wallet manager using centralized access pattern
     */
    getWalletManager() {
        return WalletService.getWalletManager(this.passwordManager);
    }

    /**
     * Create new wallet with progressive interface (like official wallet-gen)
     */
    async createNewWallet() {
        try {
        const walletManager = this.getWalletManager();
            const walletCount = walletManager?.getWalletCount() || 0;
            const isFirstWallet = walletCount === 0;
            
        
        if (isFirstWallet) {
            await this.showFirstTimeWalletSetup();
        } else {
            await this.showAdditionalWalletSetup();
            }
        } catch (error) {
        } finally {
        }
    }

    /**
     * Show first-time wallet setup (when wallet count = 0)
     * Requires password setup + wallet creation
     */
    async showFirstTimeWalletSetup() {
        try {
            const isPasswordSet = await this.passwordManager.isPasswordSet();
            if (isPasswordSet) {
                await this.showAdditionalWalletSetup();
                return;
            }
            this.pendingAction = 'generate-wallet';
            await this.showScreen('password-setup-screen');
            
        } catch (error) {
            this.showMessage('Failed to start wallet setup: ' + error.message, 'error');
        }
    }

    /**
     * Show additional wallet setup (when wallet count > 0)
     * Password already set, just need wallet creation
     */
    async showAdditionalWalletSetup() {
        try {
            const isPasswordSet = await this.passwordManager.isPasswordSet();
            if (!isPasswordSet) {
                await this.showFirstTimeWalletSetup();
                return;
            }

            const isUnlocked = this.passwordManager.isWalletUnlocked();
            if (!isUnlocked) {
                this.showMessage('Please unlock your wallet first', 'error');
                await this.showScreen('password-unlock-screen');
                return;
            }
            await this.showScreen('generate-wallet-screen');
            
        } catch (error) {
            this.showMessage('Failed to start additional wallet setup: ' + error.message, 'error');
        }
    }

    /**
     * Proceed with new wallet password
     */
    async proceedWithNewWalletPassword() {
        
        const name = document.getElementById('new-wallet-name').value;
        const password = document.getElementById('new-wallet-password').value;
        const confirmPassword = document.getElementById('new-wallet-confirm-password').value;
        
        
        if (!name || name.trim().length === 0) {
            this.showMessage('Error', 'Please enter a wallet name', 'error');
            return;
        }
        
        if (name.length > 8) {
            this.showMessage('Error', 'Wallet name must be 8 characters or less', 'error');
            return;
        }
        
        if (!password || password.length < 8) {
            this.showMessage('Error', 'Password must be at least 8 characters long', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showMessage('Error', 'Passwords do not match', 'error');
            return;
        }
        
        const strength = this.passwordManager.calculatePasswordStrength(password);
        
        if (strength.strength === 'weak') {
            this.showMessage('Error', 'Password is too weak. Please use a stronger password.', 'error');
            return;
        }
        
        try {
            this.showLoading('Creating your first wallet...');
            const setupSuccess = await this.passwordManager.setupPassword(password);
            
            if (!setupSuccess) {
                throw new Error('Failed to setup password protection');
            }
            const walletManager = this.getWalletManager();
            const result = await walletManager.createWallet(name, this.passwordManager.sessionKey, true);
            
            
            if (result.success) {
                this.hideMessage();
                await this.showFullWalletData(result.wallet);
            } else {
                throw new Error(result.error || 'Failed to create wallet');
            }
        } catch (error) {
            this.showError('Failed to create wallet: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Show full wallet data display for first-time creation
     */
    async showFullWalletData(wallet) {
        const content = document.getElementById('message-content');
        content.innerHTML = `
            <h3 style="font-size: 20px; margin: 0 0 20px 0; text-align: center;">Wallet Created Successfully!</h3>
            
            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 16px; margin: 16px 0; border-radius: 8px;">
                <h4 style="margin: 0 0 12px 0; color: #155724; font-size: 14px;">Your New Wallet</h4>
                <div style="background: white; padding: 16px; border-radius: 6px;">
                    <div style="margin-bottom: 16px;">
                        <strong style="font-size: 12px;">Wallet Name:</strong>
                        <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-top: 4px; font-size: 13px;">
                            ${this.escapeHtml(wallet.name)}
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <strong style="font-size: 12px;">Address:</strong>
                        <div class="wallet-data-field">
                            <input type="text" value="${this.escapeHtml(wallet.address)}" readonly style="font-size: 11px;">
                            <button class="copy-btn" data-copy-text="${this.escapeHtml(wallet.address)}">Copy</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <strong style="font-size: 12px;">Mnemonic Phrase:</strong>
                        <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 12px; border-radius: 4px; margin-top: 4px;">
                            <div style="font-family: monospace; font-size: 12px; line-height: 1.5; color: #856404; word-break: break-all;">
                                ${Array.isArray(wallet.mnemonic) ? wallet.mnemonic.join(' ') : wallet.mnemonic}
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <strong style="font-size: 12px;">Private Key:</strong>
                        <div class="wallet-data-field">
                            <input type="text" value="${this.escapeHtml(wallet.privateKey)}" readonly style="font-size: 11px;">
                            <button class="copy-btn" data-copy-text="${this.escapeHtml(wallet.privateKey)}">Copy</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="background: #fff3cd; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #ffeeba;">
                <h4 style="margin: 0 0 12px 0; color: #856404; font-size: 14px;">Important Security Notes</h4>
                <ul style="margin: 0; padding-left: 20px; color: #856404; font-size: 12px; line-height: 1.5;">
                    <li>Write down your mnemonic phrase on paper</li>
                    <li>Store it in a secure, offline location</li>
                    <li>Never share it with anyone</li>
                    <li>This is the only way to recover your wallet</li>
                </ul>
            </div>

            <div style="text-align: center; margin-top: 20px;">
                <button id="verify-mnemonic-btn" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; width: 100%;">
                    I've Saved My Recovery Phrase - Continue
                </button>
            </div>
        `;
        
        const overlay = document.getElementById('message-overlay');
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background: var(--bg-overlay-heavy) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 10000 !important;
            padding: 20px !important;
        `;
        overlay.classList.remove('hidden');
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const text = e.target.dataset.copyText;
                navigator.clipboard.writeText(text);
                const originalText = e.target.textContent;
                e.target.textContent = 'Copied!';
                setTimeout(() => {
                    e.target.textContent = originalText;
                }, 1500);
            });
        });
        document.getElementById('verify-mnemonic-btn').addEventListener('click', () => {
            this.showSimpleMnemonicVerification();
        });
    }

    /**
     * Show progressive wallet generation interface
     */
    async showWalletGenerationProgress() {
        const content = document.getElementById('message-content');
        content.innerHTML = `
            <h3 style="font-size: 16px; margin: 0 0 12px 0;">Generating Wallet</h3>
            
            <div style="background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 12px 0;">
                <div id="generation-status" style="margin-bottom: 12px; font-weight: bold; color: #2c3e50; font-size: 12px;">
                    Initializing...
                </div>
                
                <div style="background: #e9ecef; border-radius: 8px; height: 6px; overflow: hidden;">
                    <div id="progress-bar" style="background: linear-gradient(90deg, #28a745, #20c997); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                </div>
                
                <div id="technical-details" style="margin-top: 12px; font-size: 10px; color: #6c757d; display: none;">
                    <div id="entropy-info"></div>
                    <div id="mnemonic-info"></div>
                    <div id="keys-info"></div>
                    <div id="address-info"></div>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 16px;">
                <button id="cancel-generation" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    Cancel
                </button>
            </div>
        `;
        
        const overlay = document.getElementById('message-overlay');
        overlay.classList.remove('hidden');
        document.getElementById('cancel-generation').addEventListener('click', () => {
            this.hideMessage();
            this.showScreen('setup-screen');
        });
        await this.runWalletGeneration();
    }

    /**
     * Run wallet generation with progress updates
     */
    async runWalletGeneration() {
        try {
            const statusElement = document.getElementById('generation-status');
            const progressBar = document.getElementById('progress-bar');
            const technicalDetails = document.getElementById('technical-details');
            technicalDetails.style.display = 'block';
            statusElement.textContent = 'Generating entropy...';
            progressBar.style.width = '10%';
            document.getElementById('entropy-info').textContent = 'Creating secure random seed...';
            await this.sleep(300);
            statusElement.textContent = 'Creating mnemonic phrase...';
            progressBar.style.width = '25%';
            document.getElementById('mnemonic-info').textContent = 'Converting entropy to BIP39 mnemonic...';
            await this.sleep(300);
            statusElement.textContent = 'Deriving seed from mnemonic...';
            progressBar.style.width = '40%';
            await this.sleep(300);
            statusElement.textContent = 'Creating Ed25519 keypair...';
            progressBar.style.width = '60%';
            document.getElementById('keys-info').textContent = 'Generating cryptographic keys...';
            await this.sleep(300);
            statusElement.textContent = 'Generating Octra address...';
            progressBar.style.width = '80%';
            document.getElementById('address-info').textContent = 'Creating wallet address...';
            await this.sleep(300);
            statusElement.textContent = 'Testing signature functionality...';
            progressBar.style.width = '90%';
            await this.sleep(300);
            const walletData = await this.wallet.generateWallet();
            
            if (!walletData) {
                throw new Error('Failed to generate wallet data');
            }
            statusElement.textContent = 'Wallet generated successfully!';
            progressBar.style.width = '100%';
            await this.sleep(500);
            this.tempWalletData = walletData;
            this.showWalletData(walletData);
            
        } catch (error) {
            this.showMessage('Error', `Failed to generate wallet: ${error.message}`, 'error');
        }
    }

    /**
     * Show wallet data in a clean, organized way
     */
    showWalletData(walletData) {
        const content = document.getElementById('message-content');
        const overlay = document.getElementById('message-overlay');
        
        if (!content || !overlay) {
            return;
        }
        content.innerHTML = `
            <!-- Header Section -->
            <div class="verification-header" style="
                text-align: center;
                margin-bottom: var(--space-md);
            ">
                <div style="
                    width: 40px;
                    height: 40px;
                    background: var(--primary-gradient);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto var(--space-sm) auto;
                    box-shadow: var(--glass-shadow);
                ">
                    <span style="
                        color: var(--text-primary);
                        font-size: 18px;
                        font-weight: bold;
                    ">✓</span>
                </div>
                <h3 style="
                    font-size: 17px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0;
                    background: var(--primary-gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                ">Wallet Created Successfully</h3>
            </div>
                
            <!-- Info Section -->
            <div style="
                background: white;
                border: 1px solid var(--glass-border-light);
                border-radius: 10px;
                padding: var(--space-md);
                margin-bottom: var(--space-md);
            ">
                <h4 style="
                    margin: 0 0 var(--space-xs) 0;
                    color: var(--primary-color);
                    font-size: 13px;
                    font-weight: 600;
                ">Backup Required</h4>
                <p style="
                    margin: 0;
                    color: var(--text-primary);
                    font-size: 12px;
                    line-height: 1.4;
                ">Please save your recovery phrase safely before continuing.</p>
            </div>

            <!-- Wallet Details Section -->
            <div style="
                background: var(--glass-bg-subtle);
                backdrop-filter: blur(10px);
                border: 1px solid var(--glass-bg);
                border-radius: 10px;
                padding: var(--space-md);
                margin-bottom: var(--space-md);
            ">
                <div style="margin-bottom: var(--space-md);">
                    <label style="
                        display: block;
                        margin-bottom: var(--space-xs);
                        font-weight: 600;
                        color: var(--text-label);
                        font-size: 12px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    ">Wallet Address</label>
                    <div id="address-container" style="
                        background: var(--glass-bg);
                        backdrop-filter: blur(10px);
                        border: 1px solid var(--glass-border-light);
                        border-radius: 8px;
                        padding: 8px 12px;
                        font-family: 'Courier New', monospace;
                        font-size: 10px;
                        color: var(--text-secondary);
                        word-break: break-all;
                        line-height: 1.3;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    " title="Click to copy address">
                        ${walletData.address}
                    </div>
                </div>
                
                <div style="margin-bottom: 0;">
                    <label style="
                        display: block;
                        margin-bottom: var(--space-xs);
                        font-weight: 600;
                        color: var(--text-label);
                        font-size: 12px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    ">Recovery Phrase</label>
                    <div id="mnemonic-container" style="
                        position: relative;
                        background: linear-gradient(135deg, var(--button-secondary-bg), var(--button-secondary-bg));
                        border: 1px solid var(--glass-border-medium);
                        border-radius: 8px;
                        padding: var(--space-sm);
                        cursor: pointer;
                        transition: all 0.3s ease;
                    " title="Click to copy recovery phrase">
                        <div id="mnemonic-words" style="
                            display: grid;
                            grid-template-columns: repeat(3, 1fr);
                            gap: 4px;
                            font-family: 'Courier New', monospace;
                            font-size: 9px;
                            color: var(--text-secondary);
                            font-weight: 500;
                        ">
                            ${walletData.mnemonic.map((word, index) => 
                                `<div style="
                                    background: var(--text-secondary-dim);
                                    padding: 4px;
                                    border-radius: 4px;
                                    text-align: left;
                                    border: 1px solid var(--glass-border-light);
                                    line-height: 1.2;
                                ">
                                    <span style="color: var(--text-muted); font-size: 7px; opacity: 0.7;">${index + 1}.</span> <span style="font-weight: 600; font-size: 8px;">${word}</span>
                                </div>`
                            ).join('')}
                        </div>
                        <div id="blur-overlay" style="
                            position: absolute;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: var(--glass-border-light);
                            backdrop-filter: blur(8px);
                            border-radius: 8px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                        ">
                            <div style="text-align: center; color: var(--text-primary);">
                                <div style="font-size: 14px; margin-bottom: 2px; font-weight: bold;">HIDDEN</div>
                                <div style="font-weight: 600; margin-bottom: 2px; font-size: 11px;">Click to reveal</div>
                                <div style="font-size: 9px; opacity: 0.9;">Make sure no one is watching</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Warning Section -->
            <div style="
                background: linear-gradient(135deg, var(--warning-bg) 0%, var(--warning-bg) 100%);
                border: 1px solid var(--warning-box-border);
                border-radius: 8px;
                padding: var(--space-sm);
                margin-bottom: var(--space-md);
                text-align: center;
            ">
                <div style="
                    display: inline-flex;
                    align-items: center;
                    color: var(--warning-color);
                    font-size: 10px;
                    font-weight: 600;
                ">
                    <div style="
                        width: 12px;
                        height: 12px;
                        background: var(--warning-color);
                        border-radius: 50%;
                        margin-right: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 8px;
                        color: white;
                        font-weight: bold;
                    ">!</div>
                    Write down • Keep safe • Never share
                </div>
            </div>

            <!-- Button Section -->
            <div style="
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
            ">
                <button id="save-wallet-btn" class="glass-button primary-button" style="
                    background: var(--primary-gradient);
                    border: none;
                    color: var(--text-primary);
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: var(--glass-shadow);
                    width: 100%;
                ">
                    I've Saved My Recovery Phrase - Continue
                </button>
                
                <div style="display: flex; gap: var(--space-sm);">
                    <button id="show-advanced-btn" class="glass-button secondary-button" style="
                        background: var(--button-secondary-bg);
                        backdrop-filter: blur(10px);
                        border: 1px solid var(--button-secondary-border);
                        color: var(--primary-color);
                        padding: 8px 16px;
                        border-radius: 8px;
                        font-size: 11px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        flex: 1;
                    ">Advanced Details</button>
                    <button id="cancel-wallet-btn" class="glass-button secondary-button" style="
                        background: var(--button-secondary-bg);
                        backdrop-filter: blur(10px);
                        border: 1px solid var(--button-secondary-border);
                        color: var(--text-primary);
                        padding: 8px 16px;
                        border-radius: 8px;
                        font-size: 11px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        flex: 1;
                    ">Start Over</button>
                </div>
            </div>
        `;
        overlay.classList.remove('hidden');
        this.addCopyFunctionality(walletData);
        document.getElementById('save-wallet-btn').addEventListener('click', () => {
            this.proceedToMnemonicVerification();
        });
        
        document.getElementById('show-advanced-btn').addEventListener('click', () => {
            this.showAdvancedWalletDetails(walletData);
        });
        
        document.getElementById('cancel-wallet-btn').addEventListener('click', () => {
            this.hideMessage();
            this.showScreen('first-time-setup');
        });
        const blurOverlay = document.getElementById('blur-overlay');
        if (blurOverlay) {
            blurOverlay.addEventListener('click', () => {
                blurOverlay.style.display = 'none';
            });
        }
        const saveBtn = document.getElementById('save-wallet-btn');
        if (saveBtn) {
            saveBtn.addEventListener('mouseenter', () => {
                saveBtn.style.transform = 'translateY(-2px)';
                saveBtn.style.boxShadow = 'var(--glass-shadow-strong, 0 12px 40px rgba(0, 0, 0, 0.15))';
            });
            saveBtn.addEventListener('mouseleave', () => {
                saveBtn.style.transform = 'translateY(0)';
                saveBtn.style.boxShadow = 'var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.1))';
            });
        }
        
        const advancedBtn = document.getElementById('show-advanced-btn');
        if (advancedBtn) {
            advancedBtn.addEventListener('mouseenter', () => {
                advancedBtn.style.transform = 'translateY(-1px)';
                advancedBtn.style.background = 'var(--glass-bg-strong, rgba(255, 255, 255, 0.25))';
            });
            advancedBtn.addEventListener('mouseleave', () => {
                advancedBtn.style.transform = 'translateY(0)';
                advancedBtn.style.background = 'var(--glass-bg, var(--glass-bg))';
            });
        }
        
        const cancelBtn = document.getElementById('cancel-wallet-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.transform = 'translateY(-1px)';
                cancelBtn.style.background = 'var(--glass-bg-strong, rgba(255, 255, 255, 0.25))';
            });
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.transform = 'translateY(0)';
                cancelBtn.style.background = 'var(--glass-bg, var(--glass-bg))';
            });
        }
    }

    /**
     * Add copy functionality for wallet data
     */
    addCopyFunctionality(walletData) {
        const addressContainer = document.getElementById('address-container');
        if (addressContainer) {
            addressContainer.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(walletData.address);
                    const originalTitle = addressContainer.title;
                    addressContainer.title = 'Address copied!';
                    addressContainer.style.backgroundColor = 'var(--button-secondary-bg)';
                    addressContainer.style.borderColor = 'var(--input-focus-border)';
                    
                    setTimeout(() => {
                        addressContainer.title = originalTitle;
                        addressContainer.style.backgroundColor = '';
                        addressContainer.style.borderColor = '';
                    }, 2000);
                } catch (error) {
                    const originalTitle = addressContainer.title;
                    addressContainer.title = 'Failed to copy address';
                    addressContainer.style.backgroundColor = 'var(--button-secondary-bg)';
                    addressContainer.style.borderColor = 'var(--glass-border)';
                    
                    setTimeout(() => {
                        addressContainer.title = originalTitle;
                        addressContainer.style.backgroundColor = '';
                        addressContainer.style.borderColor = '';
                    }, 2000);
                }
            });
        }
        const mnemonicContainer = document.getElementById('mnemonic-container');
        if (mnemonicContainer) {
            mnemonicContainer.addEventListener('click', async () => {
                try {
                    const mnemonicText = walletData.mnemonic.join(' ');
                    await navigator.clipboard.writeText(mnemonicText);
                    const originalTitle = mnemonicContainer.title;
                    mnemonicContainer.title = 'Recovery phrase copied!';
                    mnemonicContainer.style.backgroundColor = 'var(--button-secondary-bg)';
                    mnemonicContainer.style.borderColor = 'var(--input-focus-border)';
                    
                    setTimeout(() => {
                        mnemonicContainer.title = originalTitle;
                        mnemonicContainer.style.backgroundColor = '';
                        mnemonicContainer.style.borderColor = '';
                    }, 2000);
                } catch (error) {
                    const originalTitle = mnemonicContainer.title;
                    mnemonicContainer.title = 'Failed to copy recovery phrase';
                    mnemonicContainer.style.backgroundColor = 'var(--button-secondary-bg)';
                    mnemonicContainer.style.borderColor = 'var(--glass-border)';
                    
                    setTimeout(() => {
                        mnemonicContainer.title = originalTitle;
                        mnemonicContainer.style.backgroundColor = '';
                        mnemonicContainer.style.borderColor = '';
                    }, 2000);
                }
            });
        }
    }

    /**
     * Show advanced wallet details
     */
    showAdvancedWalletDetails(walletData) {
        const content = document.getElementById('message-content');
        content.innerHTML = `
            <div style="text-align: center; margin-bottom: var(--space-xl, 18px);">
                <div style="width: 48px; height: 48px; background: var(--primary-gradient, linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%)); border-radius: 50%; margin: 0 auto var(--space-md, 10px); display: flex; align-items: center; justify-content: center; box-shadow: var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.1));">
                    <div style="font-size: var(--font-size-lg, 17px); color: white; font-weight: bold;">ADV</div>
                </div>
                <h3 style="font-size: var(--font-size-xl, 19px); margin: 0; color: var(--text-primary, #1a1a1a); font-weight: 600;">Advanced Wallet Details</h3>
                <p style="color: var(--text-secondary, #4a5568); margin: var(--space-sm, 6px) 0 0 0; font-size: var(--font-size-xs, 11px);">Technical information for developers and advanced users</p>
            </div>
            
            <div style="max-height: 350px; overflow-y: auto; background: var(--glass-bg, var(--glass-bg)); border: 2px solid var(--glass-border, var(--glass-border-light)); padding: var(--space-lg, 14px); border-radius: var(--radius-xl, 16px); margin: var(--space-lg, 14px) 0; backdrop-filter: blur(10px); box-shadow: var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.1));">
                <div style="margin-bottom: var(--space-lg, 14px);">
                    <div style="display: flex; align-items: center; margin-bottom: var(--space-sm, 6px);">
                        <div style="font-weight: 600; color: var(--text-primary, #1a1a1a); font-size: var(--font-size-xs, 11px);">Private Key (Base64)</div>
                        <button class="copy-detail-btn" data-copy="${walletData.private_key_b64}" style="background: none; border: none; margin-left: auto; padding: 4px 8px; border-radius: var(--radius-sm, 4px); cursor: pointer; color: var(--text-muted, #718096); font-size: var(--font-size-xs, 11px); transition: var(--transition-fast, 0.15s ease);" title="Copy to clipboard">Copy</button>
                    </div>
                    <div style="background: var(--glass-bg-strong, rgba(255, 255, 255, 0.25)); padding: var(--space-md, 10px); border-radius: var(--radius-md, 8px); font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; border: 1px solid var(--glass-border, var(--glass-border-light)); line-height: 1.3;">${walletData.private_key_b64}</div>
                </div>
                
                <div style="margin-bottom: var(--space-lg, 14px);">
                    <div style="display: flex; align-items: center; margin-bottom: var(--space-sm, 6px);">
                        <div style="font-weight: 600; color: var(--text-primary, #1a1a1a); font-size: var(--font-size-xs, 11px);">Public Key (Base64)</div>
                        <button class="copy-detail-btn" data-copy="${walletData.public_key_b64}" style="background: none; border: none; margin-left: auto; padding: 4px 8px; border-radius: var(--radius-sm, 4px); cursor: pointer; color: var(--text-muted, #718096); font-size: var(--font-size-xs, 11px); transition: var(--transition-fast, 0.15s ease);" title="Copy to clipboard">Copy</button>
                    </div>
                    <div style="background: var(--glass-bg-strong, rgba(255, 255, 255, 0.25)); padding: var(--space-md, 10px); border-radius: var(--radius-md, 8px); font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; border: 1px solid var(--glass-border, var(--glass-border-light)); line-height: 1.3;">${walletData.public_key_b64}</div>
                </div>
                
                <div style="margin-bottom: var(--space-lg, 14px);">
                    <div style="display: flex; align-items: center; margin-bottom: var(--space-sm, 6px);">
                        <div style="font-weight: 600; color: var(--text-primary, #1a1a1a); font-size: var(--font-size-xs, 11px);">Entropy (Hex)</div>
                        <button class="copy-detail-btn" data-copy="${walletData.entropy_hex}" style="background: none; border: none; margin-left: auto; padding: 4px 8px; border-radius: var(--radius-sm, 4px); cursor: pointer; color: var(--text-muted, #718096); font-size: var(--font-size-xs, 11px); transition: var(--transition-fast, 0.15s ease);" title="Copy to clipboard">Copy</button>
                    </div>
                    <div style="background: var(--glass-bg-strong, rgba(255, 255, 255, 0.25)); padding: var(--space-md, 10px); border-radius: var(--radius-md, 8px); font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; border: 1px solid var(--glass-border, var(--glass-border-light)); line-height: 1.3;">${walletData.entropy_hex}</div>
                </div>
                
                <div style="margin-bottom: var(--space-lg, 14px);">
                    <div style="display: flex; align-items: center; margin-bottom: var(--space-sm, 6px);">
                        <div style="font-weight: 600; color: var(--text-primary, #1a1a1a); font-size: var(--font-size-xs, 11px);">Seed (Hex)</div>
                        <button class="copy-detail-btn" data-copy="${walletData.seed_hex}" style="background: none; border: none; margin-left: auto; padding: 4px 8px; border-radius: var(--radius-sm, 4px); cursor: pointer; color: var(--text-muted, #718096); font-size: var(--font-size-xs, 11px); transition: var(--transition-fast, 0.15s ease);" title="Copy to clipboard">Copy</button>
                    </div>
                    <div style="background: var(--glass-bg-strong, rgba(255, 255, 255, 0.25)); padding: var(--space-md, 10px); border-radius: var(--radius-md, 8px); font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; border: 1px solid var(--glass-border, var(--glass-border-light)); line-height: 1.3;">${walletData.seed_hex}</div>
                </div>
                
                <div style="margin-bottom: 0;">
                    <div style="font-weight: 600; color: var(--text-primary, #1a1a1a); font-size: var(--font-size-xs, 11px); margin-bottom: var(--space-sm, 6px);">Signature Verification Test</div>
                    <div style="background: var(--glass-bg-strong, rgba(255, 255, 255, 0.25)); padding: var(--space-md, 10px); border-radius: var(--radius-md, 8px); border: 1px solid var(--glass-border, var(--glass-border-light));">
                        <div style="margin-bottom: var(--space-sm, 6px); font-size: var(--font-size-xs, 11px);"><strong>Test Message:</strong></div>
                        <div style="font-family: 'Courier New', monospace; font-size: 9px; background: rgba(255, 255, 255, 0.5); padding: var(--space-xs, 3px); border-radius: var(--radius-xs, 3px); margin-bottom: var(--space-sm, 6px); word-break: break-all;">${walletData.test_message}</div>
                        <div style="margin-bottom: var(--space-sm, 6px); font-size: var(--font-size-xs, 11px);"><strong>Test Signature:</strong></div>
                        <div style="font-family: 'Courier New', monospace; font-size: 9px; background: rgba(255, 255, 255, 0.5); padding: var(--space-xs, 3px); border-radius: var(--radius-xs, 3px); margin-bottom: var(--space-sm, 6px); word-break: break-all;">${walletData.test_signature}</div>
                        <div style="display: flex; align-items: center; font-size: var(--font-size-xs, 11px);">
                            <strong>Signature Valid:</strong>
                            <span style="margin-left: var(--space-sm, 6px); padding: var(--space-xs, 3px) var(--space-sm, 6px); border-radius: var(--radius-lg, 12px); font-size: 10px; font-weight: 600; ${walletData.signature_valid ? 'background: var(--success-bg, rgba(16, 185, 129, 0.1)); color: var(--success-color, #10b981);' : 'background: var(--error-bg, rgba(239, 68, 68, 0.1)); color: var(--error-color, #ef4444);'}">
                                ${walletData.signature_valid ? 'Yes' : 'No'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: var(--space-sm, 6px); margin-top: var(--space-xl, 18px);">
                <button id="back-to-wallet-btn" style="
                    background: var(--glass-bg, var(--glass-bg)); 
                    color: var(--text-secondary, #4a5568); 
                    border: 1px solid var(--glass-border, var(--glass-border-light)); 
                    padding: var(--space-md, 10px) var(--space-lg, 14px); 
                    border-radius: var(--radius-md, 8px); 
                    cursor: pointer; 
                    font-size: var(--font-size-xs, 11px); 
                    font-weight: 500;
                    flex: 1;
                    transition: var(--transition-fast, 0.15s ease);
                    backdrop-filter: blur(10px);
">
                    ← Back to Wallet Info
                </button>
                <button id="continue-advanced-btn" style="
                    background: var(--primary-gradient, linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%)); 
                    color: white; 
                    border: none; 
                    padding: var(--space-md, 10px) var(--space-lg, 14px); 
                    border-radius: var(--radius-md, 8px); 
                    cursor: pointer; 
                    font-size: var(--font-size-xs, 11px); 
                    font-weight: 500;
                    flex: 1;
                    transition: var(--transition-fast, 0.15s ease);
                    box-shadow: var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.1));
">
                    Continue Setup
                </button>
            </div>
        `;
        document.getElementById('back-to-wallet-btn').addEventListener('click', () => {
            this.showWalletData(walletData);
        });
        
        document.getElementById('continue-advanced-btn').addEventListener('click', () => {
            this.proceedToMnemonicVerification();
        });
        const backBtn = document.getElementById('back-to-wallet-btn');
        if (backBtn) {
            backBtn.addEventListener('mouseenter', () => {
                backBtn.style.transform = 'translateY(-1px)';
                backBtn.style.background = 'var(--glass-bg-strong, rgba(255, 255, 255, 0.25))';
            });
            backBtn.addEventListener('mouseleave', () => {
                backBtn.style.transform = 'translateY(0)';
                backBtn.style.background = 'var(--glass-bg, var(--glass-bg))';
            });
        }
        
        const continueBtn = document.getElementById('continue-advanced-btn');
        if (continueBtn) {
            continueBtn.addEventListener('mouseenter', () => {
                continueBtn.style.transform = 'translateY(-1px)';
                continueBtn.style.boxShadow = 'var(--glass-shadow-strong, 0 12px 40px rgba(0, 0, 0, 0.15))';
            });
            continueBtn.addEventListener('mouseleave', () => {
                continueBtn.style.transform = 'translateY(0)';
                continueBtn.style.boxShadow = 'var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.1))';
            });
        }
        document.querySelectorAll('.copy-detail-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const textToCopy = btn.getAttribute('data-copy');
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    btn.innerHTML = 'OK';
                    btn.style.color = '#28a745';
                    setTimeout(() => {
                        btn.innerHTML = 'Copy';
                        btn.style.color = '#6c757d';
                    }, 2000);
                } catch (error) {
                    btn.innerHTML = 'ERR';
                    btn.style.color = '#dc3545';
                    setTimeout(() => {
                        btn.innerHTML = 'Copy';
                        btn.style.color = '#6c757d';
                    }, 2000);
                }
            });
        });
    }

    /**
     * Proceed to mnemonic verification
     */
    proceedToMnemonicVerification() {
        this.showSimpleMnemonicVerification();
    }

    /**
     * Show simplified mnemonic verification
     */
    async showSimpleMnemonicVerification() {
        const walletManager = this.getWalletManager();
        const isFirstWallet = walletManager.getWalletCount() === 1;
        
        if (!this.tempWalletData) {
            this.showMessage('Error', 'No wallet data found. Please create a new wallet.', 'error');
            return;
        }

        const mnemonic = this.tempWalletData.mnemonic;
        const positions = [];
        const randomBytes = new Uint8Array(3);
        while (positions.length < 3) {
            crypto.getRandomValues(randomBytes);
            const pos = (randomBytes[positions.length] % mnemonic.length) + 1;
            if (!positions.includes(pos)) {
                positions.push(pos);
            }
        }
        positions.sort((a, b) => a - b);

        const content = document.getElementById('message-content');
        content.innerHTML = `
            <!-- Header Section -->
            <div class="verification-header" style="
                text-align: center;
                margin-bottom: var(--space-md);
            ">
                <div style="
                    width: 40px;
                    height: 40px;
                    background: var(--primary-gradient);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto var(--space-sm) auto;
                    box-shadow: var(--glass-shadow);
                ">
                    <span style="
                        color: var(--text-primary);
                        font-size: 18px;
                        font-weight: bold;
                    ">✓</span>
                </div>
                <h3 style="
                    font-size: 17px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0;
                    background: var(--primary-gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                ">Verify Your Recovery Phrase</h3>
            </div>
                
                <!-- Info Section -->
                <div style="
                    background: linear-gradient(135deg, var(--button-secondary-bg) 0%, var(--button-secondary-bg) 100%);
                    border: 1px solid var(--glass-border-light);
                    border-radius: 10px;
                    padding: var(--space-md);
                    margin-bottom: var(--space-md);
                ">
                    <h4 style="
                        margin: 0 0 var(--space-xs) 0;
                        color: var(--primary-color);
                        font-size: 13px;
                        font-weight: 600;
                    ">Verification Required</h4>
                    <p style="
                        margin: 0;
                        color: var(--text-secondary);
                        font-size: 12px;
                        line-height: 1.4;
                    ">Enter the requested words from your recovery phrase below.</p>
                </div>

                <!-- Input Section -->
                <div style="
                    background: var(--glass-bg-subtle);
                    backdrop-filter: blur(10px);
                    border: 1px solid var(--glass-bg);
                    border-radius: 10px;
                    padding: var(--space-md);
                    margin-bottom: var(--space-md);
                ">
                    ${positions.map((pos, index) => `
                        <div style="margin-bottom: ${index < positions.length - 1 ? '12px' : '0'};">
                            <label style="
                                display: block;
                                margin-bottom: var(--space-xs);
                                font-weight: 500;
                                color: var(--text-primary);
                                font-size: 12px;
                            ">Word #${pos}:</label>
                            <input type="text" 
                                   id="word-${pos}" 
                                   class="mnemonic-word-input glass-input"
                                   style="
                                       width: 100%;
                                       padding: 10px 14px;
                                       background: var(--glass-bg);
                                       backdrop-filter: blur(10px);
                                       border: 1px solid var(--glass-border-light);
                                       border-radius: 8px;
                                       font-size: 13px;
                                       color: var(--text-primary);
                                       box-sizing: border-box;
                                       transition: all 0.3s ease;
                                   "
                                   placeholder="Enter word #${pos}">
                        </div>
                    `).join('')}
                </div>

                <!-- Button Section -->
                <div style="
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-sm);
                    margin-top: var(--space-sm);
                ">
                    <button id="verify-words-btn" class="glass-button primary-button" style="
                        background: var(--primary-gradient);
                        border: none;
                        color: var(--text-primary);
                        padding: 10px 20px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        box-shadow: var(--glass-shadow);
                        width: 100%;
                    ">
                        ${isFirstWallet ? 'Verify & Complete Setup' : 'Verify Words'}
                    </button>
                    
                    <div style="display: flex; gap: var(--space-sm);">
                        <button id="back-to-phrase-btn" class="glass-button secondary-button" style="
                            background: var(--glass-bg);
                            backdrop-filter: blur(10px);
                            border: 1px solid var(--glass-border-light);
                            color: var(--text-primary);
                            padding: 8px 16px;
                            border-radius: 8px;
                            font-size: 11px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            flex: 1;
                        ">← Back to Phrase</button>
                        ${!isFirstWallet ? `
                            <button id="cancel-verification-btn" class="glass-button secondary-button" style="
                                background: var(--glass-bg);
                                backdrop-filter: blur(10px);
                                border: 1px solid var(--glass-border-light);
                                color: var(--text-secondary);
                                padding: 8px 16px;
                                border-radius: 8px;
                                font-size: 11px;
                                font-weight: 500;
                                cursor: pointer;
                                transition: all 0.3s ease;
                                flex: 1;
                            ">Cancel</button>
                        ` : ''}
                    </div>
                </div>
        `;
        
        const overlay = document.getElementById('message-overlay');
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background: linear-gradient(135deg, var(--button-secondary-bg) 0%, rgba(118, 75, 162, 0.15) 100%) !important;
            backdrop-filter: blur(20px) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: var(--z-modal) !important;
            padding: var(--space-lg) !important;
            overflow: hidden !important;
        `;
        overlay.classList.remove('hidden');
        document.getElementById('verify-words-btn').addEventListener('click', () => {
            this.verifyMnemonicWords(positions);
        });
        document.getElementById('back-to-phrase-btn').addEventListener('click', () => {
            this.hideMessage();
            this.showWalletDetails(this.currentWalletData, 'created');
        });
        if (!isFirstWallet) {
            document.getElementById('cancel-verification-btn').addEventListener('click', () => {
                this.hideMessage();
            });
        }
        document.querySelectorAll('.mnemonic-word-input').forEach((input, index, inputs) => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    } else {
                        this.verifyMnemonicWords(positions);
                    }
                }
            });
            input.addEventListener('input', (e) => {
                const value = e.target.value.trim();
                if (value.includes(' ') && index < inputs.length - 1) {
                    e.target.value = value.replace(' ', '');
                    inputs[index + 1].focus();
                }
            });
        });
        setTimeout(() => {
            const firstInput = document.querySelector('.mnemonic-word-input');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    /**
     * Verify mnemonic words
     */
    async verifyMnemonicWords(positions) {
        const walletManager = this.getWalletManager();
        const isFirstWallet = walletManager.getWalletCount() === 1;
        
        if (!this.tempWalletData || !this.tempWalletData.mnemonic) {
            this.showMessage('Error', 'No mnemonic data found', 'error');
            return;
        }

        const mnemonic = Array.isArray(this.tempWalletData.mnemonic) 
            ? this.tempWalletData.mnemonic 
            : this.tempWalletData.mnemonic.split(' ');
        let allCorrect = true;
        for (const pos of positions) {
            const input = document.getElementById(`word-${pos}`);
            const enteredWord = input.value.trim().toLowerCase();
            const correctWord = mnemonic[pos - 1].toLowerCase();
            
            if (enteredWord !== correctWord) {
                allCorrect = false;
                break;
            }
        }

        if (allCorrect) {
            this.showLoading('Finalizing wallet setup...');

            try {
                if (this.tempWalletObject) {
                    walletManager.wallets.push(this.tempWalletObject);
                    walletManager.activeWallet = this.tempWalletObject;
                    walletManager.activeWalletId = this.tempWalletObject.id;
                    this.tempWalletObject.isActive = true;
                    await walletManager.walletStorage.storeWallets(
                        walletManager.wallets,
                        this.passwordManager.sessionKey,
                        walletManager.activeWalletId
                    );
                    this.tempWalletObject = null;
                }

                if (isFirstWallet) {
                    await this.initializeWalletWithActiveData();
                    await this.showScreen('main-screen');
                    this.hideMessage();
                    await this.updateWalletDisplay();
                    setTimeout(() => {
                        this.showMessage('Wallet setup complete! Your recovery phrase has been verified.', 'success');
                    }, 500);
                } else {
                    await this.showScreen('wallet-list-screen');
                    this.hideMessage();

                    this.showMessage('New wallet added successfully! Recovery phrase verified.', 'success');
                }
            } catch (error) {
                this.showMessage('Failed to complete wallet setup: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        } else {
            this.showMessage('One or more words are incorrect. Please try again.', 'error');
        }
    }

    /**
     * Show comprehensive wallet creation data (like official wallet-gen)
     */
    showWalletCreationData(walletData) {
        this.showWalletData(walletData);
    }

    /**
     * Show mnemonic verification with random word positions
     */
    showMnemonicVerification() {
        this.showSimpleMnemonicVerification();
    }

    /**
     * Verify mnemonic words entered by user
     */
    async verifyMnemonic(positions) {
        return this.verifyMnemonicWords(positions);
    }

    /**
     * Sleep utility for delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Update wallet display
     */
    async updateWalletDisplay() {

        if (!this.wallet.isReady()) {
            const addressDisplayElement = document.getElementById('address-display');
            const balanceElement = document.getElementById('balance-display');
            const privateBalanceElement = document.getElementById('private-balance-display');

            if (addressDisplayElement) {
                addressDisplayElement.textContent = 'Loading...';
            }
            if (balanceElement) {
                balanceElement.textContent = 'Loading...';
            }
            if (privateBalanceElement) {
                privateBalanceElement.textContent = 'Loading...';
            }

            return;
        }
        const address = this.wallet.getAddress();
        
        const addressDisplayElement = document.getElementById('address-display');
        if (addressDisplayElement) {
            if (address && address.length > 16) {
                const shortAddress = `${address.slice(0, 8)}...${address.slice(-8)}`;
                addressDisplayElement.textContent = shortAddress;
                addressDisplayElement.title = `${address} (Click to copy)`;
                addressDisplayElement.dataset.fullAddress = address;
            } else {
                addressDisplayElement.textContent = 'Address Error';
                addressDisplayElement.title = address || 'No address available';
            }
        } else {
            const mainScreen = document.getElementById('main-screen');
        }
        await this.refreshBalance();
        
    }
    
    /**
     * Update wallet display synchronously (address only, no network calls)
     */
    updateWalletDisplaySync() {

        if (!this.wallet.isReady()) {
            const addressDisplayElement = document.getElementById('address-display');
            const balanceElement = document.getElementById('balance-display');
            const privateBalanceElement = document.getElementById('private-balance-display');

            if (addressDisplayElement) {
                addressDisplayElement.textContent = 'Loading...';
            }
            if (balanceElement) {
                balanceElement.textContent = 'Loading...';
            }
            if (privateBalanceElement) {
                privateBalanceElement.textContent = 'Loading...';
            }

            return;
        }
        const address = this.wallet.getAddress();
        
        const addressDisplayElement = document.getElementById('address-display');
        if (addressDisplayElement) {
            if (address && address.length > 16) {
                const shortAddress = `${address.slice(0, 8)}...${address.slice(-8)}`;
                addressDisplayElement.textContent = shortAddress;
                addressDisplayElement.title = `${address} (Click to copy)`;
                addressDisplayElement.dataset.fullAddress = address;
            } else {
                addressDisplayElement.textContent = 'Address Error';
                addressDisplayElement.title = address || 'No address available';
            }
        }
        const balanceElement = document.getElementById('balance-display');
        if (balanceElement) {
            balanceElement.textContent = 'Loading...';
        }
        const privateBalanceElement = document.getElementById('private-balance-display');
        if (privateBalanceElement) {
            privateBalanceElement.textContent = 'Loading...';
        }

    }
    
    /**
     * Update wallet display asynchronously (balance and history with network calls)
     */
    async updateWalletDisplayAsync() {
        
        if (!this.wallet.isReady()) {
            return;
        }
        
        try {
            await this.refreshBalance();
            
        } catch (error) {
        }
    }
    
    /**
     * Start OCS01 testing task
     */
    async startOCS01Task() {
        try {
            if (this.contractTasks) {
                await this.contractTasks.startOCS01Task();
            } else {
                this.showMessage('Error', 'Contract tasks system not initialized. Please refresh the extension.');
            }
        } catch (error) {
            this.showMessage('Error', `Failed to start contract task: ${error.message}`);
        }
    }
    
    /**
     * View OCS01 task information
     */
    viewOCS01Info() {
        try {
            if (this.contractTasks) {
                this.contractTasks.viewOCS01Info();
            } else {
                this.showMessage('Error', 'Contract tasks system not initialized. Please refresh the extension.');
            }
        } catch (error) {
            this.showMessage('Error', `Failed to view contract info: ${error.message}`);
        }
    }

    /**
     * Refresh balance display
     */
    async refreshBalance() {

        const balanceElement = document.getElementById('balance-display');
        const refreshBtn = document.getElementById('refresh-balance-btn');

        if (!balanceElement) {
            return;
        }
        balanceElement.textContent = 'Loading...';
        if (refreshBtn) {
            refreshBtn.classList.add('loading');
            refreshBtn.disabled = true;
        }

        try {
            const startTime = Date.now();
            const result = await this.wallet.getBalanceAndNonce(true);
            const endTime = Date.now();


            if (result.balance !== null) {
                balanceElement.textContent = result.balance.toFixed(2);
                if (result.retryAttempts > 0) {
                    balanceElement.title = `Balance loaded successfully after ${result.retryAttempts} retry attempts`;
                } else {
                    balanceElement.title = '';
                }
                await this.updateMainScreenPrivateBalance();
                } else {
                    throw new Error('Null balance response');
                }
            } catch (error) {
            let displayText = '0.00';
            let tooltipText = 'Failed to fetch balance';

            if (error.message && error.message.includes('Sender not found')) {
                tooltipText = 'New wallet - no transactions yet. Balance will appear after first transaction.';
            } else if (error.message && error.message.includes('403')) {
                tooltipText = 'Wallet not found on network. Balance will appear after first transaction.';
            } else if (error.message && (error.message.includes('network') || error.message.includes('fetch'))) {
                tooltipText = 'Network error - check internet connection';
            } else {
                tooltipText = `Error: ${error.message}`;
            }

            balanceElement.textContent = displayText;
            const retryInfo = error.retryAttempts > 0 ? ` (${error.retryAttempts} retries attempted)` : '';
            balanceElement.title = `${tooltipText}${retryInfo}`;
            if (this.wallet.network && this.wallet.network.getStats) {
            }
        } finally {
            if (refreshBtn) {
                refreshBtn.classList.remove('loading');
                refreshBtn.disabled = false;
            }
        }
        
    }

    /**
     * Update private balance display on main screen
     */
    async updateMainScreenPrivateBalance() {
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            if (!activeWallet) {
                return;
            }

            const privateBalanceEl = document.getElementById('private-balance-display');

            if (!privateBalanceEl) {
                return;
            }
            privateBalanceEl.textContent = 'Loading...';
            let encryptedBalance = 0;
            try {
                const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );
                if (encBalanceResult.success) {
                    encryptedBalance = encBalanceResult.encrypted || 0;
                }
            } catch (e) {
            }
            privateBalanceEl.textContent = encryptedBalance.toFixed(2);


        } catch (error) {
        }
    }

    /**
     * Handle refresh balance button click
     */
    async handleRefreshBalance() {
        
        try {
            if (!this.wallet || !this.wallet.isReady()) {
                this.showMessage('Wallet not ready', 'error');
                return;
            }

            await this.refreshBalance();
            this.showMessage('Balance refreshed successfully', 'success');
        } catch (error) {
            this.showMessage(`Failed to refresh balance: ${error.message}`, 'error');
        }
        
    }

    /**
     * Handle history refresh button click
     */
    async handleHistoryRefresh() {
        
        const historyRefreshBtn = document.getElementById('history-refresh-btn');
        
        try {
            if (!this.wallet || !this.wallet.isReady()) {
                this.showMessage('Wallet not ready', 'error');
                return;
            }
            if (historyRefreshBtn) {
                historyRefreshBtn.classList.add('loading');
                historyRefreshBtn.disabled = true;
            }
            if (this.modules?.transactionHistory) {
                await this.modules.transactionHistory.refreshTransactionHistory();
                this.showMessage('Transaction history refreshed', 'success');
            } else {
                await this.updateTransactionHistory();
                this.showMessage('Transaction history refreshed', 'success');
            }
        } catch (error) {
            this.showMessage(`Failed to refresh history: ${error.message}`, 'error');
        } finally {
            if (historyRefreshBtn) {
                historyRefreshBtn.classList.remove('loading');
                historyRefreshBtn.disabled = false;
            }
        }
        
    }

    /**
     * Update transaction history with enhanced UI/UX
     */
    async updateTransactionHistory() {
        
        const listElement = document.getElementById('transactions-list');
        if (!listElement) {
            return;
        }

        if (!this.wallet.isReady()) {
            listElement.innerHTML = `
                <div class="transaction-loading">
                    <div class="loading-spinner"></div>
                    <div>Loading wallet...</div>
                </div>
            `;
            return;
        }
        listElement.innerHTML = `
            <div class="transaction-loading">
                <div class="loading-spinner"></div>
                <div>Loading transactions...</div>
            </div>
        `;

        try {
            const startTime = Date.now();
            const transactions = await this.wallet.getTransactionHistory(true);
            const endTime = Date.now();

            if (transactions.length === 0) {
                listElement.innerHTML = `
                    <div class="no-transactions">
                        <div class="empty-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                        </div>
                        <div class="empty-title">No transactions yet</div>
                        <div class="empty-description">Your transaction history will appear here once you send or receive OCTRA tokens</div>
                    </div>
                `;
                return;
            }

            listElement.innerHTML = transactions.map(tx => {
                const isIncoming = tx.type === 'incoming';
                const displayAddress = tx.address && tx.address.length > 16 ? 
                    `${tx.address.slice(0, 8)}...${tx.address.slice(-8)}` : 
                    (tx.address || 'Unknown');
                const isPrivateTransaction = this.isPrivateTransaction(tx);
                
                return `
                    <div class="transaction-item clickable" data-tx-hash="${tx.hash}" title="Click to view on Octra Explorer (octrascan.io)">
                        <div class="transaction-icon ${tx.type}">
                            ${isIncoming ? 
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"></polyline><line x1="12" y1="18" x2="12" y2="6"></line></svg>' :
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"></polyline><line x1="12" y1="6" x2="12" y2="18"></line></svg>'
                            }
                        </div>
                        ${isPrivateTransaction ? '<div class="private-transaction-badge" title="Private Transaction">🔒</div>' : ''}
                        <div class="transaction-details">
                            <div class="transaction-main">
                                <div class="transaction-type ${tx.type}">${isIncoming ? 'Received from' : 'Sent to'}</div>
                                <div class="transaction-amount ${tx.type}">
                                    ${isIncoming ? '+' : '-'}${tx.amount.toFixed(2)} OCT
                                </div>
                            </div>
                            <div class="transaction-meta">
                                <div class="transaction-address clickable-address" data-address="${tx.address}" title="Click to view address in explorer: ${tx.address}">${displayAddress}</div>
                                <div class="transaction-time" title="${tx.timestamp.toLocaleString()}">${this.formatDate(tx.timestamp)}</div>
                                <div class="transaction-status ${tx.confirmed ? 'confirmed' : 'pending'}">
                                    ${tx.confirmed ? 'Confirmed' : 'Pending'}
                                </div>
                            </div>
                            ${tx.message ? `<div class="transaction-message" title="${tx.message}">${tx.message.length > 40 ? tx.message.slice(0, 40) + '...' : tx.message}</div>` : ''}
                        </div>
                        <div class="transaction-arrow">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15,3 21,3 21,9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </div>
                    </div>
                `;
            }).join('');
            this.bindTransactionClickEvents();
            this.bindAddressClickEvents();
            
        } catch (error) {
            listElement.innerHTML = `
                <div class="transaction-error">
                    <div class="error-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                    </div>
                    <div class="error-title">Failed to load transactions</div>
                    <div class="error-description">${error.message || 'Network error - please try again'}</div>
                    <button class="btn btn-secondary ui-retry-btn">
                        Retry
                    </button>
                </div>
            `;
            const retryBtn = listElement.querySelector('.ui-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    const refreshBtn = document.querySelector('#history-refresh-btn');
                    if (refreshBtn) {
                        refreshBtn.click();
                    } else {
                        location.reload();
                    }
                });
            }
        }
        
    }

    /**
     * Update send screen
     */
    async updateSendScreen() {
        const recipientElement = document.getElementById('recipient-address');
        const amountElement = document.getElementById('send-amount');
        const messageElement = document.getElementById('send-message');
        const summaryElement = document.getElementById('transaction-summary');
        
        if (recipientElement) recipientElement.value = '';
        if (amountElement) amountElement.value = '';
        if (messageElement) messageElement.value = '';
        if (summaryElement) summaryElement.classList.add('hidden');
        const sendBalanceElement = document.getElementById('send-balance-display');
        if (sendBalanceElement && this.wallet.isReady()) {
            try {
                const result = await this.wallet.getBalanceAndNonce();
                if (result.balance !== null) {
                    sendBalanceElement.textContent = result.balance.toFixed(2);
                } else {
                    sendBalanceElement.textContent = '0.000000';
                }
            } catch (error) {
                sendBalanceElement.textContent = '0.000000';
            }
        } else if (sendBalanceElement) {
            sendBalanceElement.textContent = '0.000000';
        }
    }

    /**
     * Update transaction summary
     */
    updateTransactionSummary() {
        const amountElement = document.getElementById('send-amount');
        const summaryElement = document.getElementById('transaction-summary');
        
        if (!amountElement || !summaryElement) return;
        
        const amount = parseFloat(amountElement.value) || 0;
        
        if (amount > 0) {
            const fee = this.wallet.network.calculateFee(amount);
            const total = amount + fee;

            const summaryAmountElement = document.getElementById('summary-amount');
            const summaryFeeElement = document.getElementById('summary-fee');
            const summaryTotalElement = document.getElementById('summary-total');
            
            if (summaryAmountElement) summaryAmountElement.textContent = `${amount.toFixed(2)} OCT`;
            if (summaryFeeElement) summaryFeeElement.textContent = `${fee.toFixed(2)} OCT`;
            if (summaryTotalElement) summaryTotalElement.textContent = `${total.toFixed(2)} OCT`;
            summaryElement.classList.remove('hidden');
        } else {
            summaryElement.classList.add('hidden');
        }
    }

    /**
     * Send transaction
     */
    async sendTransaction() {
        if (this.modules?.walletOperations) {
            return this.modules.walletOperations.handleSend();
        }
        this.showMessage('Transaction module not loaded', 'error');
    }

    /**
     * Encrypt balance (official client implementation)
     */
    async encryptBalance() {
        
        try {
            const amountInput = document.getElementById('encrypt-amount');
            const amount = parseFloat(amountInput?.value || '0');
            
            if (!amount || amount <= 0) {
                this.showMessage('Error', 'Please enter a valid amount', 'error');
                return;
            }
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            
            this.showLoading('Getting encrypted balance info...');
            const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                activeWallet.address, 
                activeWallet.privateKey
            );
            
            if (!encBalanceResult.success) {
                this.hideLoading();
                this.showMessage('Error', 'Cannot get encrypted balance info', 'error');
                return;
            }
            
            const encData = encBalanceResult;
            const maxEncrypt = encData.publicRaw / 1000000 - 1.0; 
            
            if (maxEncrypt <= 0) {
                this.hideLoading();
                this.showMessage('Error', 'Insufficient public balance (need > 1 OCT for fees)', 'error');
                return;
            }
            
            if (amount > maxEncrypt) {
                this.hideLoading();
                this.showMessage('Error', `Amount too large (max: ${maxEncrypt.toFixed(2)} OCT)`, 'error');
                return;
            }
            
            this.showLoading('Encrypting balance...');
            const currentEncryptedRaw = encData.encryptedRaw;
            const newEncryptedRaw = currentEncryptedRaw + Math.trunc(amount * 1000000);
            const encryptedValue = this.wallet.crypto.encryptClientBalance(newEncryptedRaw, activeWallet.privateKey);
            const result = await this.wallet.network.encryptBalance(
                activeWallet.address,
                String(Math.trunc(amount * 1000000)),
                activeWallet.privateKey,
                encryptedValue
            );
            
            this.hideLoading();
            
            if (result.success) {
                this.showMessage('Success', `Balance encryption submitted! Amount: ${amount.toFixed(2)} OCT`, 'success');
                if (amountInput) amountInput.value = '';
                setTimeout(() => this.showScreen('main-screen'), 2000);
            } else {
                this.showMessage('Error', `Encryption failed: ${result.error || result.result}`, 'error');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Error', 'Failed to encrypt balance', 'error');
        }
    }

    /**
     * Decrypt balance (official client implementation)
     */
    async decryptBalance() {
        
        try {
            const amountInput = document.getElementById('decrypt-amount');
            const amount = parseFloat(amountInput?.value || '0');
            
            if (!amount || amount <= 0) {
                this.showMessage('Error', 'Please enter a valid amount', 'error');
                return;
            }
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            
            this.showLoading('Getting encrypted balance info...');
            const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                activeWallet.address, 
                activeWallet.privateKey
            );
            
            if (!encBalanceResult.success) {
                this.hideLoading();
                this.showMessage('Error', 'Cannot get encrypted balance info', 'error');
                return;
            }
            
            const encData = encBalanceResult;
            const maxDecrypt = encData.encryptedRaw / 1000000;
            
            if (maxDecrypt <= 0) {
                this.hideLoading();
                this.showMessage('Error', 'No encrypted balance to decrypt', 'error');
                return;
            }
            
            if (amount > maxDecrypt) {
                this.hideLoading();
                this.showMessage('Error', `Amount too large (max: ${maxDecrypt.toFixed(2)} OCT)`, 'error');
                return;
            }
            
            this.showLoading('Decrypting balance...');
            const currentEncryptedRaw = encData.encryptedRaw;
            const newEncryptedRaw = currentEncryptedRaw - Math.trunc(amount * 1000000);
            const encryptedValue = this.wallet.crypto.encryptClientBalance(newEncryptedRaw, activeWallet.privateKey);
            const result = await this.wallet.network.decryptBalance(
                activeWallet.address,
                String(Math.trunc(amount * 1000000)),
                activeWallet.privateKey,
                encryptedValue
            );
            
            this.hideLoading();
            
            if (result.success) {
                this.showMessage('Success', `Balance decryption submitted! Amount: ${amount.toFixed(2)} OCT`, 'success');
                if (amountInput) amountInput.value = '';
                setTimeout(() => this.showScreen('main-screen'), 2000);
            } else {
                this.showMessage('Error', `Decryption failed: ${result.error || result.result}`, 'error');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Error', 'Failed to decrypt balance', 'error');
        }
    }

    /**
     * Private send (official client implementation)
     */
    async privateSend() {
        
        try {
            const toAddressInput = document.getElementById('private-send-to');
            const amountInput = document.getElementById('private-send-amount');
            
            const toAddress = toAddressInput?.value?.trim();
            const amount = parseFloat(amountInput?.value || '0');
            
            if (!toAddress) {
                this.showMessage('Error', 'Please enter recipient address', 'error');
                return;
            }
            
            if (!amount || amount <= 0) {
                this.showMessage('Error', 'Please enter a valid amount', 'error');
                return;
            }
            if (!this.wallet.network.isValidAddress(toAddress)) {
                this.showMessage('Error', 'Invalid recipient address', 'error');
                return;
            }
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            
            if (toAddress === activeWallet.address) {
                this.showMessage('Error', 'Cannot send to yourself', 'error');
                return;
            }
            
            this.showLoading('Checking encrypted balance...');
            const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                activeWallet.address, 
                activeWallet.privateKey
            );
            
            if (!encBalanceResult.success || encBalanceResult.encryptedRaw === 0) {
                this.hideLoading();
                this.showMessage('Error', 'No encrypted balance available. Encrypt some balance first.', 'error');
                return;
            }
            
            const maxSend = encBalanceResult.encryptedRaw / 1000000;
            
            if (amount > maxSend) {
                this.hideLoading();
                this.showMessage('Error', `Insufficient encrypted balance (max: ${maxSend.toFixed(2)} OCT)`, 'error');
                return;
            }
            
            this.showLoading('Checking recipient...');
            const addressInfoResult = await this.wallet.network.getAddressInfo(toAddress);
            
            if (!addressInfoResult.success) {
                this.hideLoading();
                this.showMessage('Error', 'Recipient address not found on blockchain', 'error');
                return;
            }
            
            if (!addressInfoResult.info.has_public_key) {
                this.hideLoading();
                this.showMessage('Error', 'Recipient has no public key. They need to make a transaction first.', 'error');
                return;
            }
            const pubKeyResult = await this.wallet.network.getPublicKey(toAddress);
            
            if (!pubKeyResult.success) {
                this.hideLoading();
                this.showMessage('Error', 'Cannot get recipient public key', 'error');
                return;
            }
            
            this.showLoading('Creating private transfer...');
            const result = await this.wallet.network.createPrivateTransfer(
                activeWallet.address,
                toAddress,
                String(Math.trunc(amount * 1000000)),
                activeWallet.privateKey,
                pubKeyResult.publicKey
            );
            
            this.hideLoading();
            
            if (result.success) {
                this.showMessage('Success', `Private transfer submitted! Amount: ${amount.toFixed(2)} OCT to ${toAddress}`, 'success');
                if (toAddressInput) toAddressInput.value = '';
                if (amountInput) amountInput.value = '';
                setTimeout(() => this.showScreen('main-screen'), 2000);
            } else {
                this.showMessage('Error', `Private transfer failed: ${result.error || result.result}`, 'error');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Error', 'Failed to send private transfer', 'error');
        }
    }

    /**
     * Claim private transfers (official client implementation)
     */
    async claimTransfers() {
        
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            
            this.showLoading('Loading pending transfers...');
            const transfersResult = await this.wallet.network.getPendingPrivateTransfers(
                activeWallet.address, 
                activeWallet.privateKey
            );
            
            if (!transfersResult.success) {
                this.hideLoading();
                this.showMessage('Error', 'Failed to load pending transfers', 'error');
                return;
            }
            const transfers = transfersResult.transfers || [];
            
            if (transfers.length === 0) {
                this.hideLoading();
                this.showMessage('Info', 'No pending transfers to claim', 'info');
                return;
            }
            
            this.hideLoading();
            let transfersHtml = `
                <div style="max-width: 350px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 20px 0; color: #333;">Claimable Transfers</h3>
                    <div style="margin-bottom: 20px;">
                        <p style="margin: 0 0 10px 0; color: #666;">Found ${transfers.length} transfer(s):</p>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px;">
            `;
            
            for (let index = 0; index < transfers.length; index++) {
                const transfer = transfers[index];
                
                let amountStr = '[encrypted]';
                if (transfer.encrypted_data && transfer.ephemeral_key) {
                    try {
                        const sharedSecret = this.wallet.crypto.deriveSharedSecretForClaim(
                            activeWallet.privateKey, 
                            transfer.ephemeral_key
                        );
                        const decryptedAmount = await this.wallet.crypto.decryptPrivateAmount(
                            transfer.encrypted_data, 
                            sharedSecret
                        );
                        if (decryptedAmount !== null) {
                            amountStr = `${(decryptedAmount / 1000000).toFixed(2)} OCT`;
                        }
                    } catch (e) {
                    }
                }
                const senderId = transfer.sender || 'Unknown';
                const transferId = transfer.id || `transfer_${index}`;
                
                
                transfersHtml += `
                    <div class="claimable-transfer" data-transfer-id="${transferId}" style="margin-bottom: 10px; padding: 8px; border: 1px solid #eee; border-radius: 4px; cursor: pointer; background: #f9f9f9;">
                        <div style="font-weight: bold; color: #333;">#${index + 1}: ${amountStr}</div>
                        <div style="font-size: 12px; color: #666;">From: ${senderId && senderId !== 'Unknown' ? senderId.substring(0, 20) + '...' : 'Unknown'}</div>
                        <div style="font-size: 12px; color: #666;">ID: ${transferId}</div>
                    </div>
                `;
            }
            
            transfersHtml += `
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <button id="cancel-claim-btn" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">Cancel</button>
                        <button id="claim-all-btn" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Claim All</button>
                    </div>
                </div>
            `;
            
            this.showMessage('', transfersHtml, 'info', 0); 
            setTimeout(() => {
                document.querySelectorAll('.claimable-transfer').forEach(transferEl => {
                    transferEl.addEventListener('click', () => {
                        const transferId = transferEl.getAttribute('data-transfer-id');
                        this.claimSpecificTransfer(transferId);
                    });
                });
                const cancelBtn = document.getElementById('cancel-claim-btn');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => {
                        this.hideMessage();
                    });
                }
                
                const claimAllBtn = document.getElementById('claim-all-btn');
                if (claimAllBtn) {
                    claimAllBtn.addEventListener('click', () => {
                        this.claimAllTransfers();
                    });
                }
            }, 100);
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Error', 'Failed to load transfers', 'error');
        }
    }

    /**
     * Claim a specific transfer
     */
    async claimSpecificTransfer(transferId) {
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            
            this.showLoading('Claiming transfer...');
            
            const result = await this.wallet.network.claimPrivateTransfer(
                activeWallet.address,
                activeWallet.privateKey,
                transferId
            );
            
            this.hideLoading();
            
            if (result.success) {
                this.showMessage('Success', `Transfer claimed successfully! Your encrypted balance has been updated.`, 'success');
                setTimeout(() => this.updateWalletDisplay(), 1000);
            } else {
                this.showMessage('Error', `Failed to claim transfer: ${result.error || result.result}`, 'error');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Error', 'Failed to claim transfer', 'error');
        }
    }

    /**
     * Claim all pending transfers
     */
    async claimAllTransfers() {
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            
            this.showLoading('Getting pending transfers...');
            const transfersResult = await this.wallet.network.getPendingPrivateTransfers(
                activeWallet.address, 
                activeWallet.privateKey
            );
            
            if (!transfersResult.success) {
                this.hideLoading();
                this.showMessage('Error', 'Failed to load pending transfers', 'error');
                return;
            }
            const transfers = transfersResult.transfers || [];
            
            if (transfers.length === 0) {
                this.hideLoading();
                this.showMessage('Info', 'No pending transfers to claim', 'info');
                return;
            }
            
            this.showLoading(`Claiming ${transfers.length} transfers...`);
            
            let successful = 0;
            let failed = 0;
            for (const transfer of transfers) {
                try {
                    const result = await this.wallet.network.claimPrivateTransfer(
                        activeWallet.address,
                        activeWallet.privateKey,
                        transfer.id
                    );
                    
                    if (result.success) {
                        successful++;
                    } else {
                        failed++;
                    }
                } catch (error) {
                    failed++;
                }
            }
            
            this.hideLoading();
            
            if (successful > 0) {
                this.showMessage('Success', `Claimed ${successful} transfers successfully!${failed > 0 ? ` (${failed} failed)` : ''}`, 'success');
                setTimeout(() => this.updateWalletDisplay(), 1000);
            } else {
                this.showMessage('Error', `Failed to claim any transfers (${failed} failed)`, 'error');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Error', 'Failed to claim transfers', 'error');
        }
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        document.addEventListener('click', (event) => {
            const action = event.target.getAttribute('data-action');
            const recipientId = event.target.getAttribute('data-recipient-id');
            if (recipientId && event.target.classList.contains('remove-recipient-btn')) {
                if (this.modules?.bulkSend) {
                    this.modules.bulkSend.removeRecipient(parseFloat(recipientId));
                }
                return;
            }
            if (!action) return;
            
            
            switch (action) {
                case 'close-message':
                    this.hideMessage();
                    break;
                case 'reload':
                    window.location.reload();
                    break;
                case 'clear-and-reload':
                    window.location.reload();
                    break;
                case 'contract-start-task':
                case 'contract-back-to-methods':
                case 'contract-close-dialog':
                case 'contract-confirm-transaction':
                case 'execute-method':
                case 'submit-parameters':
                case 'cancel-parameters':
                    break;
                default:
            }
        });
        document.addEventListener('submit', (event) => {
            const formId = event.target.id;
            
            if (!formId) {
                return;
            }
            
            event.preventDefault();
            
            switch (formId) {
                case 'unlock-form':
                    this.handleUnlockForm(event);
                    break;
                case 'initial-setup-form':
                    this.handleInitialSetup(event);
                    break;
                case 'password-setup-form':
                    this.handleFirstTimeSetup(event);
                    break;
                case 'change-password-form':
                    this.changePassword();
                    break;
                case 'generate-wallet-form':
                    this.generateNewWallet();
                    break;
                case 'import-wallet-form':
                    this.importWallet();
                    break;
                case 'send-form':
                    this.sendTransaction();
                    break;
                case 'encrypt-balance-form':
                    this.handleEncryptBalance();
                    break;
                case 'decrypt-balance-form':
                    this.handleDecryptBalance();
                    break;
                case 'private-send-form':
                    this.handlePrivateSend();
                    break;
                case 'claim-transfers-form':
                    this.claimTransfers();
                    break;
                case 'add-recipient-form':
                    if (this.modules?.bulkSend) {
                        this.modules.bulkSend.addRecipient();
                    }
                    break;
                case 'add-private-recipient-form':
                    if (this.modules?.bulkPrivateSend) {
                        this.modules.bulkPrivateSend.addPrivateRecipient();
                    }
                    break;
                default:
            }
        });
        const initialPasswordInput = document.getElementById('initial-password');
        if (initialPasswordInput) {
            initialPasswordInput.addEventListener('input', (e) => {
                this.handleInitialPasswordInput(e);
            });
        }
        const generateRadio = document.getElementById('type-generate');
        const importRadio = document.getElementById('type-import');
        
        if (generateRadio) {
            generateRadio.addEventListener('change', () => {
                this.updateWalletTypeDisplay();
            });
        }
        
        if (importRadio) {
            importRadio.addEventListener('change', () => {
                this.updateWalletTypeDisplay();
            });
        }
        const encryptBtn = document.getElementById('encrypt-balance-btn');
        if (encryptBtn) {
            encryptBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showScreen('encrypt-balance-screen');
            });
        } else {
        }
        const decryptBtn = document.getElementById('decrypt-balance-btn');
        if (decryptBtn) {
            decryptBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showScreen('decrypt-balance-screen');
            });
        } else {
        }
        const privateSendBtn = document.getElementById('private-send-btn');
        if (privateSendBtn) {
            privateSendBtn.addEventListener('click', () => {
                this.showScreen('private-send-screen');
            });
        }
        const claimBtn = document.getElementById('claim-transfers-btn');
        if (claimBtn) {
            claimBtn.addEventListener('click', () => {
                this.showScreen('claim-transfers-screen');
            });
        }
        const refreshBtn = document.getElementById('refresh-balance-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleRefreshBalance();
            });
        } else {
        }
        const historyRefreshBtn = document.getElementById('history-refresh-btn');
        if (historyRefreshBtn) {
            historyRefreshBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleHistoryRefresh();
            });
        } else {
        }
        
    }

    /**
     * Initialize loading overlay
     */
    initializeLoadingOverlay() {
        if (!this.loadingOverlay) {
            this.loadingOverlay = document.createElement('div');
            this.loadingOverlay.id = 'loading-overlay';
            this.loadingOverlay.classList.add('loading-overlay', 'hidden');
            this.loadingOverlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-message">Loading...</div>
            `;
            document.body.appendChild(this.loadingOverlay);
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...') {
        if (this.modules?.uiFeedback) {
            return this.modules.uiFeedback.showLoading(message);
        }
        if (this.loadingOverlay) {
            const messageEl = this.loadingOverlay.querySelector('#loading-text');
            if (messageEl) {
                messageEl.textContent = message;
            }
            this.loadingOverlay.classList.remove('hidden');
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        if (this.modules?.uiFeedback) {
            return this.modules.uiFeedback.hideLoading();
        }
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show message to user
     * @param {string} message
     * @param {string} type
     */
    showMessage(message, type = 'info') {
        if (this.modules?.uiFeedback) {
            return this.modules.uiFeedback.showMessage(message, type);
        }
        try {
            const messageContainer = document.getElementById('message-container');
            if (!messageContainer) {
            return;
        }
            if (this.messageTimeout) {
                clearTimeout(this.messageTimeout);
            }
            const validTypes = ['info', 'error', 'success', 'warning'];
            const messageType = validTypes.includes(type) ? type : 'info';
            const messageEl = document.createElement('div');
            messageEl.className = 'message'; 
            messageEl.classList.add(messageType);
            if (typeof message === 'string' && message.includes('<') && message.includes('>')) {
                messageEl.innerHTML = message;
            } else {
                const sanitizedMessage = String(message).replace(/[\r\n]+/g, ' ').trim();
                messageEl.textContent = sanitizedMessage;
            }
            messageContainer.innerHTML = '';
            messageContainer.appendChild(messageEl);
            const timeout = window.OctraConfig?.UI?.MESSAGE_AUTO_HIDE_TIMEOUT || 5000;
            this.messageTimeout = setTimeout(() => {
                try {
                    if (messageEl.parentNode === messageContainer) {
                        messageContainer.removeChild(messageEl);
                    }
                } catch (removeError) {
                }
            }, timeout);
        } catch (error) {
        }
    }

    /**
     * Handle error for user experience
     */
    handleError(error) {
        this.showMessage(error.message || 'An unexpected error occurred', 'error');
                this.hideLoading();
        if (this.currentScreen) {
            this.showScreen(this.currentScreen);
        }
    }

    /**
     * Setup initial password for first-time users (delegates to PasswordManager)
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    async setupPassword(password) {
        try {
            
            if (!this.passwordManager) {
                throw new Error('Password manager not initialized');
            }
            const success = await this.passwordManager.setupPassword(password);
            if (success) {
                await chrome.storage.local.remove(['passwordSkipped']);
                this.passwordManager.resetAutoLockTimer();
                await this.updatePasswordBasedUI();
                
                this.showMessage('Password set successfully', 'success');
        } else {
                this.showMessage('Failed to set password', 'error');
            }
            
            return success;
        } catch (error) {
            this.showMessage('Failed to set password: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Handle first-time setup form submission
     * @param {Event} event
     */
    async handleFirstTimeSetup(event) {
        event.preventDefault();
        if (this.isSettingUpPassword) {
            return;
        }
        this.isSettingUpPassword = true;
        
        const password = document.getElementById('setup-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        if (password) {
            if (password !== confirmPassword) {
                this.showMessage('Passwords do not match', 'error');
                this.isSettingUpPassword = false;
                return;
            }
            if (password.length < 8) {
                this.showMessage('Password must be at least 8 characters long', 'error');
                this.isSettingUpPassword = false;
                return;
            }
        }
        
        this.showLoading('Setting up your wallet...');
        
        try {
            let success;
            if (password) {
                success = await this.setupPassword(password);
            } else {
                success = await this.skipPasswordSetup();
            }
            
            if (success) {
                
                if (this.initialWalletSetup) {
                    let walletResult;
                    
                    if (this.initialWalletSetup.type === 'generate') {
                        walletResult = await this.createInitialWallet(this.initialWalletSetup.name);
                    } else if (this.initialWalletSetup.type === 'import' && this.tempImportData) {
                        walletResult = await this.importInitialWallet(
                            this.initialWalletSetup.name,
                            this.tempImportData.privateKey,
                            this.tempImportData.walletAddress
                        );
                    }
                    
                    if (walletResult && walletResult.success) {
                        const action = this.initialWalletSetup.type === 'import' ? 'imported' : 'created';
                        this.showWalletDetails(walletResult.wallet, action);
                        this.initialWalletSetup = null;
                        this.tempImportData = null;
                        this.pendingAction = null;
                    } else {
                        throw new Error(walletResult?.error || 'Failed to create wallet');
                    }
                } else {
                    if (this.pendingAction === 'generate-wallet') {
                        await this.showScreen('generate-wallet-screen');
                        this.pendingAction = null;
                    } else if (this.pendingAction === 'import-wallet') {
                        await this.showScreen('import-wallet-screen');
                        this.pendingAction = null;
                    } else {
                        await this.showScreen('generate-wallet-screen');
                    }
                }
            }
        } catch (error) {
            this.showMessage('Setup failed: ' + error.message, 'error');
        } finally {
            this.isSettingUpPassword = false;
            this.hideLoading();
        }
    }

    /**
     * Skip password setup and continue with no password protection
     */
    async skipPasswordSetup() {
        try {
            const success = await this.passwordManager.skipPasswordSetup();

            if (!success) {
                throw new Error('Failed to initialize wallet manager with device encryption');
            }

            this.showMessage('Password setup skipped - wallet will be accessible without password', 'info');

            return true;
        } catch (error) {
            this.showMessage('Failed to skip password setup: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Toggle confirm password field visibility based on password input
     */
    toggleConfirmPasswordField() {
        const passwordInput = document.getElementById('setup-password');
        const confirmPasswordGroup = document.getElementById('confirm-password-group');
        const confirmPasswordInput = document.getElementById('confirm-password');
        
        if (passwordInput && confirmPasswordGroup && confirmPasswordInput) {
            const hasPassword = passwordInput.value.length > 0;
            
            if (hasPassword) {
                confirmPasswordGroup.style.display = 'block';
                confirmPasswordInput.required = true;
            } else {
                confirmPasswordGroup.style.display = 'none';
                confirmPasswordInput.required = false;
                confirmPasswordInput.value = ''; 
            }
        }
    }

    /**
     * Handle initial setup form submission
     * @param {Event} event
     */
    async handleInitialSetup(event) {
        event.preventDefault();
        if (this.isSettingUpInitial) {
            return;
        }
        this.isSettingUpInitial = true;
        
        
        try {
            const form = document.getElementById('initial-setup-form');
            const formData = new FormData(form);
            const walletType = formData.get('wallet-type');
            const walletName = formData.get('wallet-name')?.trim();
            const password = formData.get('password')?.trim();
            const confirmPassword = formData.get('confirm-password')?.trim();
            if (!walletName) {
                this.showMessage('Please enter a wallet name', 'error');
                this.isSettingUpInitial = false;
                return;
            }
            if (password) {
                if (password.length < 4) {
                    this.showMessage('Password must be at least 4 characters long', 'error');
                    this.isSettingUpInitial = false;
                    return;
                }
                
                if (password !== confirmPassword) {
                    this.showMessage('Passwords do not match', 'error');
                    this.isSettingUpInitial = false;
                    return;
                }
            }
            if (walletType === 'import') {
                const privateKey = formData.get('private-key')?.trim();
                const walletAddress = formData.get('wallet-address')?.trim();
                
                if (!privateKey || !walletAddress) {
                    this.showMessage('Please enter both private key and wallet address for import', 'error');
                    this.isSettingUpInitial = false;
                    return;
                }
                this.tempImportData = {
                    privateKey: privateKey,
                    walletAddress: walletAddress
                };
            }
            this.initialWalletSetup = {
                type: walletType,
                name: walletName,
                password: password || null 
            };
            if (walletType === 'generate') {
                await this.createInitialWallet();
            } else {
                await this.importInitialWallet();
            }
            
        } catch (error) {
            this.showMessage('Setup failed: ' + error.message, 'error');
        } finally {
            this.isSettingUpInitial = false;
        }
        
    }
    
    /**
     * Update wallet type display based on radio button selection
     */
    updateWalletTypeDisplay() {
        const generateRadio = document.getElementById('type-generate');
        const importRadio = document.getElementById('type-import');
        const importFields = document.getElementById('import-fields');
        const submitButtonText = document.getElementById('submit-button-text');
        
        if (importRadio.checked) {
            importFields.style.display = 'block';
            submitButtonText.textContent = 'Import Wallet';
            document.getElementById('initial-private-key').required = true;
            document.getElementById('initial-wallet-address').required = true;
        } else {
            importFields.style.display = 'none';
            submitButtonText.textContent = 'Create Wallet';
            document.getElementById('initial-private-key').required = false;
            document.getElementById('initial-wallet-address').required = false;
        }
    }
    
    /**
     * Handle password input for initial setup
     */
    handleInitialPasswordInput(event) {
        const password = event.target.value;
        const confirmGroup = document.getElementById('initial-confirm-password-group');
        const strengthBar = document.getElementById('initial-strength-bar');
        const strengthText = document.getElementById('initial-strength-text');
        if (password.length > 0) {
            confirmGroup.style.display = 'block';
            const strength = this.calculatePasswordStrength(password);
            this.updatePasswordStrengthDisplay(strengthBar, strengthText, strength);
        } else {
            confirmGroup.style.display = 'none';
            strengthBar.style.display = 'none';
            strengthText.style.display = 'none';
        }
    }
    
    /**
     * Calculate password strength (reuse existing method)
     */
    calculatePasswordStrength(password) {
        let score = 0;
        let feedback = [];
        if (password.length >= 8) score += 2;
        else if (password.length >= 6) score += 1;
        else feedback.push('Use at least 6 characters');
        if (/[a-z]/.test(password)) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^A-Za-z0-9]/.test(password)) score += 1;
        let level = 'weak';
        if (score >= 6) level = 'strong';
        else if (score >= 4) level = 'medium';
        
        return { score, level, feedback };
    }
    
    /**
     * Update password strength display
     */
    updatePasswordStrengthDisplay(strengthBar, strengthText, strength) {
        strengthBar.style.display = 'block';
        strengthText.style.display = 'block';
        const cssLevel = strength.level === 'medium' ? 'fair' : strength.level;
        const displayText = strength.level.charAt(0).toUpperCase() + strength.level.slice(1);
        strengthBar.className = 'strength-bar ' + cssLevel;
        strengthText.textContent = displayText;
        strengthText.className = 'strength-text ' + cssLevel;
    }
    
    /**
     * Create initial wallet (reverted to working approach)
     */
    async createInitialWallet() {
        
        try {
            if (this.initialWalletSetup.password) {
                await this.passwordManager.setPassword(this.initialWalletSetup.password);
            } else {
                await this.passwordManager.skipPasswordSetup();
            }
            const walletData = await window.crypto.generateWallet();
            
            if (!walletData || !walletData.mnemonic) {
                throw new Error('Failed to generate wallet with mnemonic');
            }
            this.tempWalletData = {
                ...walletData,
                name: this.initialWalletSetup.name
            };
            const walletManager = this.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            const isAddressUnique = await walletManager.walletStorage.isWalletAddressUnique(walletData.address);
            if (!isAddressUnique) {
                throw new Error('Generated wallet address already exists (very unlikely)');
            }
            const wallet = walletManager.walletStorage.createWalletObject(walletData, this.initialWalletSetup.name);
            this.tempWalletObject = wallet;

            this.showMessage('Wallet generated successfully! Please backup your recovery phrase.', 'success');
            this.currentWalletData = {
                ...wallet,
                mnemonic: walletData.mnemonic,
                mnemonicWords: walletData.mnemonicWords
            };
            this.showWalletDetails(this.currentWalletData, 'created');
            
        } catch (error) {
            this.showMessage('Failed to create wallet: ' + error.message, 'error');
        }
    }
    
    /**
     * Import initial wallet
     */
    async importInitialWallet() {
        
        try {
            if (this.initialWalletSetup.password) {
                await this.passwordManager.setPassword(this.initialWalletSetup.password);
            } else {
                await this.passwordManager.skipPasswordSetup();
            }
            const walletManager = this.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            const result = await walletManager.importWallet(
                this.initialWalletSetup.name,
                this.tempImportData.privateKey,
                this.tempImportData.walletAddress,
                this.passwordManager.sessionKey,
                true 
            );
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to import wallet');
            }
            
            this.showMessage('Wallet imported successfully!', 'success');
            await this.initializeWalletWithActiveData();
            await this.showScreen('main-screen');
            
        } catch (error) {
            this.showMessage('Failed to import wallet: ' + error.message, 'error');
        }
    }
    

    /**
     * Generate a unique wallet ID using cryptographically secure random values
     * @returns {string}
     */
    generateWalletId() {
        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const randomHex = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return 'wallet_' + Date.now() + '_' + randomHex.substr(0, 9);
    }

    /**
     * Show wallet details after creation or import
     * @param {Object} wallet
     * @param {string} action
     */
    async showWalletDetails(wallet, action = 'created') {
        try {
            this.currentWalletData = wallet;
            const headerEl = document.querySelector('#wallet-details-screen h2');
            const descriptionEl = document.querySelector('#wallet-details-screen p');
            if (headerEl) {
                headerEl.textContent = action === 'imported' ? 'Wallet Imported' : 'Wallet Created';
            }
            if (descriptionEl) {
                descriptionEl.textContent = action === 'imported' 
                    ? 'Your wallet has been imported successfully. Please verify your recovery information is secure.'
                    : 'Your wallet has been created successfully. Please save your recovery information securely.';
            }
            const nameEl = document.getElementById('wallet-details-name');
            const addressEl = document.getElementById('wallet-details-address');
            const privateKeyEl = document.getElementById('wallet-details-private-key');
            const mnemonicEl = document.getElementById('wallet-details-mnemonic');
            
            if (nameEl) nameEl.textContent = wallet.name || 'Unknown';
            if (addressEl) addressEl.textContent = wallet.address || 'Loading...';
            if (privateKeyEl) privateKeyEl.textContent = wallet.privateKey || 'Loading...';
            if (mnemonicEl) {
                const mnemonicText = Array.isArray(wallet.mnemonic) 
                    ? wallet.mnemonic.join(' ') 
                    : wallet.mnemonic || 'N/A';
                mnemonicEl.textContent = mnemonicText;
            }
            await this.showScreen('wallet-details-screen');
            
        } catch (error) {
            await this.showScreen('main-screen');
        }
    }

    /**
     * Import wallet with differentiation (first vs additional)
     */
    async importWalletWithDifferentiation() {
        if (this.modules?.walletIO) {
            return this.modules.walletIO.importWalletWithDifferentiation();
        }
        try {
            const walletManager = this.getWalletManager();
            const walletCount = walletManager?.getWalletCount() || 0;
            const isFirstWallet = walletCount === 0;
            
            
            if (isFirstWallet) {
                await this.showFirstTimeWalletImport();
            } else {
                await this.showAdditionalWalletImport();
            }
        } catch (error) {
        } finally {
        }
    }

    /**
     * Show first-time wallet import (when wallet count = 0)
     * Requires password setup + wallet import
     */
    async showFirstTimeWalletImport() {
        if (this.modules?.walletIO) {
            return this.modules.walletIO.showFirstTimeWalletImport();
        }
        try {
            const isPasswordSet = await this.passwordManager.isPasswordSet();
            if (isPasswordSet) {
                await this.showAdditionalWalletImport();
                return;
            }
            this.pendingAction = 'import-wallet';
            await this.showScreen('password-setup-screen');
            
        } catch (error) {
            this.showMessage('Failed to start wallet import: ' + error.message, 'error');
        }
    }

    /**
     * Show additional wallet import (when wallet count > 0)
     * Password already set, just need wallet import
     */
    async showAdditionalWalletImport() {
        if (this.modules?.walletIO) {
            return this.modules.walletIO.showAdditionalWalletImport();
        }
        try {
            const isPasswordSet = await this.passwordManager.isPasswordSet();
            if (!isPasswordSet) {
                await this.showFirstTimeWalletImport();
                return;
            }
        
            const isUnlocked = this.passwordManager.isWalletUnlocked();
            if (!isUnlocked) {
                this.showMessage('Please unlock your wallet first', 'error');
                await this.showScreen('password-unlock-screen');
                return;
            }
            await this.showScreen('import-wallet-screen');
            
        } catch (error) {
            this.showMessage('Failed to start additional wallet import: ' + error.message, 'error');
        }
    }

    /**
     * Import existing wallet
     */
    async importWallet() {
        if (this.modules?.walletIO) {
            return this.modules.walletIO.importWallet();
        }
        if (this.isImportingWallet) {
            return;
        }
        this.isImportingWallet = true;
        
        const startTime = performance.now();
        
        try {
            const form = document.getElementById('import-wallet-form');
            if (!form) {
                throw new Error('Import wallet form not found');
            }
            
            const formData = new FormData(form);
            const walletName = formData.get('wallet-name')?.trim();
            const privateKey = formData.get('private-key')?.trim();
            const walletAddress = formData.get('wallet-address')?.trim();
            
            if (!walletName) {
                this.showMessage('Please enter a wallet name', 'error');
            return;
        }
        
            if (!privateKey) {
                this.showMessage('Please enter the private key', 'error');
            return;
        }
        
            if (!walletAddress) {
                this.showMessage('Please enter the wallet address', 'error');
            return;
        }

        this.showLoading('Importing wallet...');
            if (!this.passwordManager) {
                throw new Error('Password manager not initialized');
            }
            
            const isPasswordSet = await this.passwordManager.isPasswordSet();
            if (!isPasswordSet) {
                throw new Error('Password not set. Please go through the setup process.');
            }
            const walletManager = this.passwordManager.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            const importResult = await walletManager.importWallet(walletName, privateKey, walletAddress, '', true);
            if (!importResult.success) {
                throw new Error(importResult.error || 'Failed to import wallet');
            }
            const wallet = importResult.wallet;
            const setActiveResult = await walletManager.setActiveWallet(wallet.id);
            if (!setActiveResult) {
            }
            await this.initializeWalletWithActiveData();

            this.showMessage('Wallet imported successfully', 'success');
            await this.showScreen('main-screen');
            await this.updateWalletDisplay();
            
        } catch (error) {
            const errorMessage = error.message || 'Failed to import wallet';
            this.showMessage('Failed to import wallet: ' + errorMessage, 'error');
        } finally {
            this.isImportingWallet = false;
            this.hideLoading();
            const endTime = performance.now();
        }
    }

    /**
     * Update password strength indicator
     * @param {string} passwordInputId
     * @param {string} strengthBarId
     * @param {string} strengthTextId
     */
    updatePasswordStrength(passwordInputId, strengthBarId, strengthTextId) {
        try {
            const passwordInput = document.getElementById(passwordInputId);
            const strengthBar = document.getElementById(strengthBarId);
            const strengthText = document.getElementById(strengthTextId);

            if (!passwordInput || !strengthBar || !strengthText) {
            return;
        }
        
            const password = passwordInput.value;
            const strengthData = this.passwordManager.calculatePasswordStrength(password);
            const strength = this.convertPasswordStrengthToUI(strengthData);
            strengthBar.classList.remove('weak', 'fair', 'good', 'strong');
            if (password.length === 0) {
                strengthText.textContent = '';
                return;
            }

            strengthBar.classList.add(strength.level);
            strengthText.textContent = strength.text;
            strengthText.style.color = strength.color;
            
        } catch (error) {
        }
    }

    /**
     * Convert PasswordManager strength format to UI format
     * @param {object} strengthData
     * @returns {object} UI format {level, text, color}
     */
    convertPasswordStrengthToUI(strengthData) {
        if (!strengthData || !strengthData.strength) {
            return { level: '', text: '', color: 'transparent' };
        }

        const { strength, feedback } = strengthData;
        
        switch (strength) {
            case 'strong':
                return {
                    level: 'strong',
                    text: 'Strong password',
                    color: '#10b981' 
                };
            case 'medium':
                return {
                    level: 'fair',
                    text: 'Medium password',
                    color: '#f59e0b' 
                };
            case 'weak':
                return {
                    level: 'weak',
                    text: feedback.length > 0 ? feedback.join(', ') : 'Weak password',
                    color: '#ef4444' 
                };
            default:
                return {
                    level: 'fair',
                    text: 'Fair password - consider adding more complexity',
                    color: '#f59e0b' 
                };
        }
    }

    /**
     * Update receive screen
     */
    updateReceiveScreen() {
        try {
            const addressElement = document.getElementById('receive-address-display');
            if (addressElement && this.wallet && this.wallet.address) {
                addressElement.textContent = this.wallet.address;
            }
        } catch (error) {
        }
    }

    /**
     * Update settings screen
     */
    async updateSettingsScreen() {
        if (this.modules?.settings) {
            return this.modules.settings.updateSettingsScreen();
        }
        try {
            const settingsAddressElement = document.getElementById('settings-address');
            const settingsBalanceElement = document.getElementById('settings-balance');
            
            if (settingsAddressElement && this.wallet && this.wallet.address) {
                settingsAddressElement.textContent = this.wallet.address;
            }
            
            if (settingsBalanceElement && this.wallet) {
                const balance = await this.wallet.getBalance();
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
                if (autoLockSection) {
                    autoLockSection.classList.remove('hidden');
                    autoLockSection.style.display = '';
                }
                if (createPasswordBtn) {
                    createPasswordBtn.classList.add('hidden');
                } else {
                }
                if (changePasswordBtn) {
                    changePasswordBtn.classList.remove('hidden');
                    changePasswordBtn.style.display = '';
                }
                if (lockWalletBtn) {
                    lockWalletBtn.classList.remove('hidden');
                    lockWalletBtn.style.display = '';
                    lockWalletBtn.disabled = false;
                }
            } else {
                if (autoLockSection) {
                    autoLockSection.classList.add('hidden');
                    autoLockSection.style.display = 'none';
                }
                if (createPasswordBtn) {
                    createPasswordBtn.classList.remove('hidden');
                    createPasswordBtn.style.display = '';
                }
                if (changePasswordBtn) {
                    changePasswordBtn.classList.add('hidden');
                    changePasswordBtn.style.display = 'none';
                }
                if (lockWalletBtn) {
                    lockWalletBtn.classList.add('hidden');
                    lockWalletBtn.style.display = 'none';
                    lockWalletBtn.disabled = true;
                }
            }
            
            
        } catch (error) {
        }
    }

    /**
     * Show create password flow for users without password
     */
    async showCreatePasswordFlow() {
        try {
            const data = await chrome.storage.local.get(['hashedPassword', 'passwordSkipped']);
            const hasActualPassword = !!data.hashedPassword;
            const passwordSkipped = !!data.passwordSkipped;
            const isPasswordSet = hasActualPassword && !passwordSkipped;
            
            if (isPasswordSet) {
                this.showMessage('Password is already set. Use "Change Password" instead.', 'info');
                return;
            }
            this.showScreen('create-password-screen');
            
        } catch (error) {
            this.showMessage('Failed to open password setup', 'error');
        }
    }

    /**
     * Create password from settings screen
     */
    async createPasswordFromSettings() {
        try {
            const newPasswordField = document.getElementById('create-new-password');
            const confirmPasswordField = document.getElementById('create-confirm-password');
            
            const newPassword = newPasswordField?.value || '';
            const confirmPassword = confirmPasswordField?.value || '';
            if (!newPassword) {
                this.showMessage('Please enter a password', 'error');
                newPasswordField?.focus();
                return;
            }
            
            if (newPassword !== confirmPassword) {
                this.showMessage('Passwords do not match', 'error');
                confirmPasswordField?.focus();
                return;
            }
            
            if (newPassword.length < 1) {
                this.showMessage('Password cannot be empty', 'error');
                newPasswordField?.focus();
                return;
            }
            this.showLoading('Creating password and securing existing wallets...');
            const walletStorage = new WalletStorage();
            let existingWallets = [];
            try {
                const deviceKey = await this.passwordManager.getDeviceEncryptionKey();
                const loadResult = await walletStorage.loadWallets(deviceKey);
                existingWallets = loadResult.wallets || [];
            } catch (error) {
            }
            const success = await this.passwordManager.setupPassword(newPassword);
            
            if (!success) {
                this.hideLoading();
                this.showMessage('Failed to create password', 'error');
                return;
            }
            if (existingWallets.length > 0) {
                try {
                    const sessionKey = this.passwordManager.sessionKey;
                    const currentActiveWalletId = existingWallets.find(w => w.isActive)?.id || existingWallets[0]?.id;
                    await walletStorage.storeWallets(existingWallets, sessionKey, currentActiveWalletId);
                    
                } catch (reencryptError) {
                    this.hideLoading();
                    this.showMessage('Failed to secure existing wallets. Please try again.', 'error');
                    return;
                }
            }
            
            this.hideLoading();
            await chrome.storage.local.remove(['passwordSkipped']);
            if (newPasswordField) newPasswordField.value = '';
            if (confirmPasswordField) confirmPasswordField.value = '';
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.updatePasswordBasedUI();
            const walletCount = existingWallets.length;
            const message = walletCount > 0 
                ? `Password created successfully! ${walletCount} existing wallet(s) have been secured with your new password.`
                : 'Password created successfully! Security features are now enabled.';
            this.showMessage(message, 'success');
            this.showScreen('settings-screen');
            
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to create password: ' + error.message, 'error');
        }
    }

    /**
     * Change password functionality
     */
    async changePassword() {
        try {
            const currentPasswordField = document.getElementById('current-password');
            const newPasswordField = document.getElementById('new-password');
            const confirmNewPasswordField = document.getElementById('confirm-new-password');
            
            const currentPassword = currentPasswordField?.value || '';
            const newPassword = newPasswordField?.value || '';
            const confirmNewPassword = confirmNewPasswordField?.value || '';
            if (!currentPassword) {
                this.showMessage('Please enter your current password', 'error');
                currentPasswordField?.focus();
                return;
            }
            const isRemovingPassword = newPassword === '' && confirmNewPassword === '';
            if (!isRemovingPassword && newPassword !== confirmNewPassword) {
                this.showMessage('New passwords do not match', 'error');
                confirmNewPasswordField?.focus();
                return;
            }
            if ((newPassword === '' && confirmNewPassword !== '') || (newPassword !== '' && confirmNewPassword === '')) {
                this.showMessage('Both password fields must be filled or both must be empty', 'error');
                return;
            }
            if (newPassword === '') {
                const confirmed = await showConfirmDialog(
                    '⚠️ Remove Password Protection?',
                    'This will:\n• Disable auto-lock and wallet locking\n• Convert your encrypted wallet to minimal encryption\n• Allow immediate access without password\n\n⚠️ WARNING: Due to encryption changes, there is a small risk of wallet corruption. Make sure you have your wallet backup!\n\nContinue?',
                    'Remove Password',
                    'Cancel'
                );

                if (!confirmed) {
                    return;
                }
                const hasBackup = await showConfirmDialog(
                    '🔐 Backup Check',
                    'Do you have your wallet private key or mnemonic phrase saved?\n\nClick OK if you have your backup ready.\nClick Cancel to go back and create a backup first.',
                    'I Have Backup',
                    'Go Back'
                );

                if (!hasBackup) {
                    this.showMessage('Please backup your wallet first! Go to Settings → Export Wallet or copy your private key.', 'warning');
                    return;
                }
            }
            this.showLoading(newPassword === '' ? 'Removing password...' : 'Changing password...');
            const result = await this.passwordManager.changePassword(currentPassword, newPassword);

            this.hideLoading();

            if (result.success) {
                if (newPassword === '') {
                    const verification = await chrome.storage.local.get(['hashedPassword', 'salt', 'passwordSkipped', 'walletUnlocked']);
                    await chrome.storage.local.set({ passwordSkipped: true });
                } else {
                    await chrome.storage.local.remove(['passwordSkipped']);
                }
                if (currentPasswordField) currentPasswordField.value = '';
                if (newPasswordField) newPasswordField.value = '';
                if (confirmNewPasswordField) confirmNewPasswordField.value = '';
                await new Promise(resolve => setTimeout(resolve, 100));
                const leftoverOverlays = document.querySelectorAll('.dialog-overlay');
                leftoverOverlays.forEach(overlay => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                });
                if (newPassword === '') {
                    this.showMessage('Password protection removed successfully', 'success');
                } else {
                    this.showMessage('Password changed successfully', 'success');
                }
                await this.updatePasswordBasedUI();
                await this.showScreen('settings-screen');
                
            } else {
                this.showMessage(result.error || 'Failed to change password', 'error');
                currentPasswordField?.focus();
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to change password: ' + error.message, 'error');
        }
    }


    /**
     * Show wallet name conflict error with reset option
     */
    showWalletNameConflictError() {
        this.showMessage(
            'Wallet Name Conflict',
            `<div style="text-align: left;">
                <p>A wallet with this name already exists, but it appears to be orphaned data from a previous session.</p>
                <p><strong>Options:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Try a different wallet name</li>
                    <li>Clear all wallet data and start fresh</li>
                </ul>
                <div style="margin-top: 20px;">
                    <button id="clear-wallet-data-btn" style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                        Clear All Data
                    </button>
                    <button id="try-different-name-btn" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        Try Different Name
                    </button>
                </div>
            </div>`,
            'warning'
        );
        setTimeout(() => {
            const clearBtn = document.getElementById('clear-wallet-data-btn');
            const tryDiffBtn = document.getElementById('try-different-name-btn');
            
            if (clearBtn) {
                clearBtn.addEventListener('click', async () => {
                    this.hideMessage();
                    await this.clearAllWalletData();
                });
            }
            
            if (tryDiffBtn) {
                tryDiffBtn.addEventListener('click', () => {
                    this.hideMessage();
                    const nameInput = document.getElementById('wallet-name');
                    if (nameInput) {
                        nameInput.focus();
                        nameInput.select();
                    }
                });
            }
        }, 100);
    }

    /**
     * Clear all wallet data with confirmation
     */
    async clearAllWalletData() {
        try {
            this.showLoading('Clearing wallet data...');
            const walletManager = this.passwordManager?.getWalletManager();
            if (walletManager && walletManager.walletStorage) {
                const cleared = await walletManager.walletStorage.clearAllWallets();
                if (cleared) {
                    walletManager.wallets = [];
                    walletManager.activeWalletId = null;
                    
                    this.showMessage(
                        'Success',
                        'All wallet data has been cleared. You can now create a new wallet.',
                        'success'
                    );
                } else {
                    throw new Error('Failed to clear wallet data');
                }
            } else {
                throw new Error('Wallet manager not available');
            }
        } catch (error) {
            this.showMessage('Error', 'Failed to clear wallet data: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Initialize wallet instance with active wallet data from wallet manager
     */
    async initializeWalletWithActiveData() {
        
        try {
            const walletManager = this.passwordManager.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            
            const activeWallet = walletManager.getActiveWallet();
            if (!activeWallet) {
                throw new Error('No active wallet found');
            }
            const initialized = this.wallet.initialize(activeWallet.privateKey, activeWallet.address);
            if (!initialized) {
                throw new Error('Failed to initialize wallet instance');
            }
            
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Re-initialize wallet instance (used after wallet switching)
     */
    async reinitializeWalletInstance() {
        
        try {
            await this.initializeWalletWithActiveData();
            await this.updateWalletDisplay();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Quick update active wallet (optimized version)
     * Updates only the necessary UI elements without full reinitialization
     */
    async quickUpdateActiveWallet() {
        const startTime = Date.now();
        
        try {
            const walletManager = this.getWalletManager();
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            
            const activeWallet = walletManager.getActiveWallet();
            if (!activeWallet) {
                throw new Error('No active wallet found');
            }
            const currentAddress = this.wallet ? this.wallet.getAddress() : null;
            if (currentAddress !== activeWallet.address) {
                this.wallet = new OctraWallet();
                const initialized = this.wallet.initialize(activeWallet.privateKey, activeWallet.address);
                
                if (!initialized) {
                    throw new Error('Failed to initialize wallet with new active data');
                }
                
            } else {
            }
            this.quickUpdateWalletDisplay(activeWallet);
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Quick update wallet display elements (optimized)
     */
    quickUpdateWalletDisplay(activeWallet) {
        
        try {
            const addressElements = document.querySelectorAll('.wallet-address, #wallet-address');
            addressElements.forEach(element => {
                if (element) {
                    element.textContent = activeWallet.address;
                }
            });
            const nameElements = document.querySelectorAll('.wallet-name, #wallet-name');
            nameElements.forEach(element => {
                if (element) {
                    element.textContent = activeWallet.name;
                }
            });
            if (this.wallet && typeof this.updateWalletDisplay === 'function') {
                this.updateWalletDisplay().catch(error => {
                });
            }
            
        } catch (error) {
        }
    }

    /**
     * Reset wallet (clear all data)
     */
    async resetWallet() {

        try {
            const confirmed = await showConfirmDialog(
                'Reset Wallet',
                'Are you sure you want to reset your wallet?\n\nThis will delete all stored wallets and cannot be undone.',
                'Reset Wallet',
                'Cancel'
            );

            if (!confirmed) {
                return;
            }
            
            this.showLoading('Resetting wallet...');
            let walletManager = null;
            if (this.walletListManager) {
                walletManager = this.walletListManager.getWalletManager();
            }
            if (!walletManager && this.passwordManager) {
                walletManager = this.passwordManager.getWalletManager();
            }
            if (walletManager) {
                const success = await walletManager.clearAllWallets();
                if (success) {
                } else {
                }
            } else {
            }
            if (this.passwordManager) {
                if (typeof this.passwordManager.clearSensitiveData === 'function') {
                    await this.passwordManager.clearSensitiveData();
                } else {
                }
            }
            await chrome.storage.local.clear();
            this.sessionData = {
                lastActivity: Date.now(),
                autoLockDuration: 300,
                isLocked: false
            };
            this.showScreen('first-time-setup');
            
            this.showMessage(
                'Success',
                'Wallet has been reset successfully. You can now create a new wallet.',
                'success'
            );
        } catch (error) {
            this.showMessage('Error', 'Failed to reset wallet: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Clear corrupted wallet data (emergency recovery)
     */
    async clearCorruptedWalletData() {

        const confirmed = await showConfirmDialog(
            'Clear Corrupted Wallet Data',
            'This will delete all wallet data and cannot be undone.\n\nAre you sure?',
            'Clear Data',
            'Cancel'
        );

        if (!confirmed) {
            return;
        }
        
        try {
            await chrome.storage.local.clear();
            if (this.passwordManager) {
                this.passwordManager.clearSensitiveData();
            }
            this.wallet = new OctraWallet();
            
            this.showMessage('All wallet data cleared. Please create a new wallet.', 'success');
            await this.showScreen('first-time-setup');
            
        } catch (error) {
            this.showMessage('Failed to clear wallet data: ' + error.message, 'error');
        }
    }

    /**
     * Copy wallet address to clipboard
     */
    async copyAddress() {
        try {
            let address = null;
            if (this.wallet && this.wallet.getAddress) {
                address = this.wallet.getAddress();
            }
            if (!address && this.currentWalletData && this.currentWalletData.address) {
                address = this.currentWalletData.address;
            }
            if (!address) {
                const addressElement = document.getElementById('wallet-details-address') ||
                                     document.getElementById('address-display') ||
                                     document.getElementById('receive-address-display');
                if (addressElement && addressElement.textContent && addressElement.textContent !== 'Loading...') {
                    address = addressElement.textContent.trim();
                }
            }

            if (!address) {
                this.showMessage('No wallet address available', 'error');
                return;
            }
            await navigator.clipboard.writeText(address);
            this.showMessage('Address copied to clipboard', 'success');
        } catch (error) {
            this.showMessage('Failed to copy address', 'error');
        }
    }

    /**
     * Copy private key to clipboard
     */
    async copyPrivateKey() {
        try {
            const privateKeyElement = document.getElementById('wallet-details-private-key');
            if (!privateKeyElement || !privateKeyElement.value) {
                this.showMessage('No private key available', 'error');
                return;
            }
            await navigator.clipboard.writeText(privateKeyElement.value);
            this.showMessage('Private key copied to clipboard', 'success');
        } catch (error) {
            this.showMessage('Failed to copy private key', 'error');
        }
    }

    /**
     * Copy mnemonic phrase to clipboard
     */
    async copyMnemonic() {
        try {
            const mnemonicElement = document.getElementById('wallet-details-mnemonic');
            if (!mnemonicElement || !mnemonicElement.value) {
                this.showMessage('No recovery phrase available', 'error');
                return;
            }
            await navigator.clipboard.writeText(mnemonicElement.value);
            this.showMessage('Recovery phrase copied to clipboard', 'success');
        } catch (error) {
            this.showMessage('Failed to copy recovery phrase', 'error');
        }
    }

    /**
     * Handle right-click context menu for address elements
     */
    handleAddressContextMenu(event) {
        event.preventDefault(); 
        
        try {
            const address = this.wallet.getAddress();
            if (!address) {
                this.showMessage('No wallet address available', 'error');
                return;
            }
            const explorerUrl = `${window.OctraConfig?.NETWORK?.EXPLORER_ADDRESS_URL || 'https://octrascan.io/addr'}/${address}`;
            window.open(explorerUrl, '_blank');
            this.showMessage('Address opened in explorer', 'success');
        } catch (error) {
            this.showMessage('Failed to open address in explorer', 'error');
        }
    }

    /**
     * Escape HTML characters for safe display
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format date for transaction display
     */
    formatDate(timestamp) {
        try {
            const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = diffMs / (1000 * 60 * 60);
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            if (diffHours < 1) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                return diffMinutes <= 1 ? 'Just now' : `${diffMinutes}m ago`;
            } else if (diffHours < 24) {
                return `${Math.floor(diffHours)}h ago`;
            } else if (diffDays < 7) {
                return `${Math.floor(diffDays)}d ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Decrypt private amount using exact CLI logic
     */
    async decryptPrivateAmountCLIStyle(encryptedData, myPrivateKey, ephemeralPublicKey) {
        try {
            if (!encryptedData || !encryptedData.startsWith("v2|")) {
                return null;
            }
            const myPrivateKeyBytes = this.wallet.crypto.base64ToBytes(myPrivateKey);
            const signingKey = nacl.sign.keyPair.fromSeed(myPrivateKeyBytes);
            const myPublicKeyBytes = signingKey.publicKey;
            const ephemeralPublicKeyBytes = this.wallet.crypto.base64ToBytes(ephemeralPublicKey);
            let smaller, larger;
            if (this.compareBytes(ephemeralPublicKeyBytes, myPublicKeyBytes)) {
                smaller = ephemeralPublicKeyBytes;
                larger = myPublicKeyBytes;
            } else {
                smaller = myPublicKeyBytes;
                larger = ephemeralPublicKeyBytes;
            }
            const combined = new Uint8Array(smaller.length + larger.length);
            combined.set(smaller);
            combined.set(larger, smaller.length);
            const round1Buffer = await crypto.subtle.digest('SHA-256', combined);
            const round1 = new Uint8Array(round1Buffer);
            
            const symmetricBytes = new TextEncoder().encode("OCTRA_SYMMETRIC_V1");
            
            const round2Input = new Uint8Array(round1.length + symmetricBytes.length);
            round2Input.set(round1);
            round2Input.set(symmetricBytes, round1.length);
            
            const round2Buffer = await crypto.subtle.digest('SHA-256', round2Input);
            const round2 = new Uint8Array(round2Buffer);
            const sharedSecret = round2.slice(0, 32);
            const rawData = this.wallet.crypto.base64ToBytes(encryptedData.slice(3));
            if (rawData.length < 28) {
                return null;
            }
            
            const nonce = rawData.slice(0, 12);
            const ciphertext = rawData.slice(12);
            const key = await crypto.subtle.importKey(
                'raw',
                sharedSecret,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );
            
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: nonce },
                key,
                ciphertext
            );
            
            const decryptedAmount = parseInt(new TextDecoder().decode(plaintext), 10);
            return decryptedAmount;
            
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Helper to compare bytes arrays
     */
    compareBytes(a, b) {
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (a[i] !== b[i]) {
                return a[i] < b[i];
            }
        }
        return a.length < b.length;
    }

    /**
     * Check if a transaction is a private transaction
     */
    isPrivateTransaction(tx) {
        if (tx.message === 'PRIVATE_TRANSFER') {
            return true;
        }
        if (tx.amount === 0) {
            return true;
        }
        if (tx.message) {
            const msg = tx.message.toLowerCase();
            if (msg.includes('private') || msg.includes('encrypt') || msg.includes('decrypt') || msg.includes('claim')) {
                return true;
            }
        }
        const privateAddresses = [
        ];
        
        if (privateAddresses.includes(tx.address)) {
            return true;
        }
        
        return false;
    }

    /**
     * Setup navigation listeners from a mapping object
     */
    setupNavigationListeners(navigationMap) {
        Object.entries(navigationMap).forEach(([elementId, targetScreen]) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.addEventListener('click', () => this.showScreen(targetScreen));
            } else {
            }
        });
    }

    /**
     * Hide message immediately
     */
    hideMessage() {
        if (this.modules?.uiFeedback) {
            return this.modules.uiFeedback.hideMessage();
        }
        try {
            const messageOverlay = document.getElementById('message-overlay');
            if (messageOverlay) {
                messageOverlay.classList.add('hidden');
                messageOverlay.style.cssText = '';
            }
            const messageContainer = document.getElementById('message-container');
            if (messageContainer) {
                messageContainer.innerHTML = '';
            }
            if (this.messageTimeout) {
                clearTimeout(this.messageTimeout);
                this.messageTimeout = null;
            }
        } catch (error) {
        }
    }

    /**
     * Bind click events for transaction items
     */
    bindTransactionClickEvents() {
        try {
            const transactionItems = document.querySelectorAll('.transaction-item');
            transactionItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    const txHash = e.currentTarget.dataset.txHash;
                    if (txHash) {
                        const explorerUrl = `${window.OctraConfig?.NETWORK?.EXPLORER_URL || 'https://octrascan.io/tx'}/${txHash}`;
                        window.open(explorerUrl, '_blank');
                    }
                });
            });
        } catch (error) {
        }
    }

    /**
     * Bind click events for clickable addresses in transactions
     */
    bindAddressClickEvents() {
        try {
            const addressElements = document.querySelectorAll('.clickable-address');
            addressElements.forEach(element => {
                element.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    const address = e.currentTarget.dataset.address;
                    if (address) {
                        const explorerUrl = `${window.OctraConfig?.NETWORK?.EXPLORER_ADDRESS_URL || 'https://octrascan.io/addr'}/${address}`;
                        window.open(explorerUrl, '_blank');
                    }
                });
            });
        } catch (error) {
        }
    }

    /**
     * Update auto-lock setting when dropdown changes
     */
    async updateAutoLockSetting() {
        try {
            const autoLockSelect = document.getElementById('auto-lock-select');
            if (!autoLockSelect) {
                return;
            }

            const selectedValue = parseInt(autoLockSelect.value);

            /* console.log('Auto-lock timer changed:', {
                newValue: selectedValue,
                formatted: this.formatAutoLockTime(selectedValue)
            }); */
            this.sessionData.autoLockDuration = selectedValue;
            await chrome.storage.local.set({
                autoLockDuration: selectedValue
            });
            if (this.passwordManager) {
                this.passwordManager.updateAutoLockDuration(selectedValue);
            }
            const timeText = selectedValue === 0 ? 'Never' : this.formatAutoLockTime(selectedValue);
            this.showMessage('Settings Saved', `Auto-lock timeout set to: ${timeText}`, 'success');

        } catch (error) {
            this.showMessage('Error', 'Failed to save auto-lock setting', 'error');
        }
    }

    /**
     * Update theme setting
     */
    async updateThemeSetting() {
        try {
            const themeToggle = document.getElementById('theme-toggle');
            if (!themeToggle) {
                return;
            }

            const selectedTheme = themeToggle.checked ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', selectedTheme);
            await chrome.storage.local.set({
                theme: selectedTheme
            });
            const themeName = selectedTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
            this.showMessage(`Theme changed to ${themeName}`, 'success');

        } catch (error) {
            this.showMessage('Failed to save theme setting', 'error');
        }
    }

    /**
     * Load theme setting on startup
     */
    async loadThemeSetting() {
        try {
            const result = await chrome.storage.local.get(['theme']);
            const theme = result.theme || 'dark'; 
            document.documentElement.setAttribute('data-theme', theme);
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.checked = (theme === 'light');
            }

        } catch (error) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    /**
     * Load auto-lock setting from storage and update UI
     */
    async loadAutoLockSetting() {
        try {
            const storage = await chrome.storage.local.get(['autoLockDuration']);
            const savedDuration = storage.autoLockDuration !== undefined ? storage.autoLockDuration : 300; 
            this.sessionData.autoLockDuration = savedDuration;
            const autoLockSelect = document.getElementById('auto-lock-select');
            if (autoLockSelect) {
                autoLockSelect.value = savedDuration.toString();
            }
            if (this.passwordManager) {
                this.passwordManager.updateAutoLockDuration(savedDuration);
            }

        } catch (error) {
            this.sessionData.autoLockDuration = 300;
        }
    }

    /**
     * Format auto-lock time for display
     */
    formatAutoLockTime(seconds) {
        if (seconds === 0) return 'Never';
        if (seconds < 60) return `${seconds} seconds`;
        if (seconds < 3600) return `${seconds / 60} minutes`;
        return `${seconds / 3600} hour${seconds / 3600 > 1 ? 's' : ''}`;
    }
    /**
     * Show encrypt balance dialog
     */
    async showEncryptBalanceDialog() {
        
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            const balanceResult = await this.wallet.getBalanceAndNonce();
            const publicBalance = balanceResult.balance || 0;
            let encryptedInfo = '';
            try {
                const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );
                
                if (encBalanceResult.success) {
                    const maxEncrypt = Math.max(0, encBalanceResult.publicRaw / 1000000 - 1.0); 
                    encryptedInfo = `
                        <div style="background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px;">
                            <div><strong>Current Balance Info:</strong></div>
                            <div>Public: ${encBalanceResult.public.toFixed(2)} OCT</div>
                            <div>Encrypted: ${encBalanceResult.encrypted.toFixed(2)} OCT</div>
                            <div>Total: ${encBalanceResult.total.toFixed(2)} OCT</div>
                            <div style="color: #666; margin-top: 5px;">Max encryptable: ${maxEncrypt.toFixed(2)} OCT</div>
                        </div>
                    `;
                }
            } catch (e) {
                encryptedInfo = `<div style="color: #666; margin: 10px 0;">Public balance: ${publicBalance.toFixed(2)} OCT</div>`;
            }
            
            const dialog = `
                <div style="max-width: 450px; margin: 0 auto;">
                    <h3>Encrypt Balance</h3>
                    <p>Convert your public balance to encrypted (private) balance:</p>
                    ${encryptedInfo}
                    <form id="encrypt-balance-form">
                        <div class="form-group">
                            <label for="encrypt-amount" class="form-label">Amount to Encrypt (OCT)</label>
                            <input type="number" id="encrypt-amount" class="form-input" step="0.000001" min="0" placeholder="0.000000" required>
                            <small style="color: #666;">Note: 1 OCT will be reserved for transaction fees</small>
                        </div>
                        <div class="form-group">
                            <button type="submit" class="btn btn-primary">Encrypt Balance</button>
                            <button type="button" class="btn btn-secondary" data-action="close-message">Cancel</button>
                        </div>
                    </form>
                </div>
            `;
            this.showMessage("Encrypt Balance", dialog, "info");
        } catch (error) {
            this.showMessage('Error', 'Failed to load balance information', 'error');
        }
    }

    /**
     * Show decrypt balance dialog
     */
    async showDecryptBalanceDialog() {
        
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            let encryptedInfo = '';
            try {
                const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );
                
                if (encBalanceResult.success) {
                    const maxDecrypt = encBalanceResult.encryptedRaw / 1000000;
                    
                    if (maxDecrypt <= 0) {
                        this.showMessage('Error', 'No encrypted balance available to decrypt', 'error');
                        return;
                    }
                    
                    encryptedInfo = `
                        <div style="background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px;">
                            <div><strong>Current Balance Info:</strong></div>
                            <div>Public: ${encBalanceResult.public.toFixed(2)} OCT</div>
                            <div>Encrypted: ${encBalanceResult.encrypted.toFixed(2)} OCT</div>
                            <div>Total: ${encBalanceResult.total.toFixed(2)} OCT</div>
                            <div style="color: #666; margin-top: 5px;">Max decryptable: ${maxDecrypt.toFixed(2)} OCT</div>
                        </div>
                    `;
                } else {
                    this.showMessage('Error', 'Cannot get encrypted balance info', 'error');
                    return;
                }
            } catch (e) {
                this.showMessage('Error', 'Failed to load encrypted balance information', 'error');
                return;
            }
            
            const dialog = `
                <div style="max-width: 450px; margin: 0 auto;">
                    <h3>Decrypt Balance</h3>
                    <p>Convert your encrypted (private) balance back to public balance:</p>
                    ${encryptedInfo}
                    <form id="decrypt-balance-form">
                        <div class="form-group">
                            <label for="decrypt-amount" class="form-label">Amount to Decrypt (OCT)</label>
                            <input type="number" id="decrypt-amount" class="form-input" step="0.000001" min="0" placeholder="0.000000" required>
                            <small style="color: #666;">This will make the balance public and visible</small>
                        </div>
                        <div class="form-group">
                            <button type="submit" class="btn btn-primary">Decrypt Balance</button>
                            <button type="button" class="btn btn-secondary" data-action="close-message">Cancel</button>
                        </div>
                    </form>
                </div>
            `;
            this.showMessage("Decrypt Balance", dialog, "info");
        } catch (error) {
            this.showMessage('Error', 'Failed to load balance information', 'error');
        }
    }

    /**
     * Show private send dialog
     */
    showPrivateSendDialog() {
        const dialog = `
            <div style="max-width: 400px; margin: 0 auto;">
                <h3>Private Send</h3>
                <p>Send encrypted balance privately to another wallet:</p>
                <form id="private-send-form">
                    <div class="form-group">
                        <label for="private-send-to" class="form-label">Recipient Address</label>
                        <input type="text" id="private-send-to" class="form-input" placeholder="oct..." required>
                    </div>
                    <div class="form-group">
                        <label for="private-send-amount" class="form-label">Amount (OCT)</label>
                        <input type="number" id="private-send-amount" class="form-input" step="0.000001" min="0" placeholder="0.000000" required>
                    </div>
                    <div class="form-group">
                        <button type="submit" class="btn btn-primary">Send Privately</button>
                        <button type="button" class="btn btn-secondary" data-action="close-message">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        this.showMessage("Private Send", dialog, "info");
    }

    /**
     * Show claim transfers dialog
     */
    showClaimTransfersDialog() {
        const dialog = `
            <div style="max-width: 400px; margin: 0 auto;">
                <h3>Claim Private Transfers</h3>
                <p>Check for and claim any pending private transfers sent to your wallet:</p>
                <form id="claim-transfers-form">
                    <div class="form-group">
                        <button type="submit" class="btn btn-primary">Check & Claim Transfers</button>
                        <button type="button" class="btn btn-secondary" data-action="close-message">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        this.showMessage("Claim Transfers", dialog, "info");
    }

    /**
     * Handle encrypt balance form submission
     */
    async handleEncryptBalance() {
        
        try {
            const amount = parseFloat(document.getElementById('encrypt-amount')?.value || '0');
            
            if (amount <= 0) {
                this.showMessage('Please enter a valid amount', 'error');
                return;
            }
            
            if (isNaN(amount) || !isFinite(amount)) {
                this.showMessage('Please enter a valid numeric amount', 'error');
                return;
            }
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('No active wallet found', 'error');
                return;
            }

            this.showLoading('Encrypting balance...');
            const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                activeWallet.address, 
                activeWallet.privateKey
            );

            if (!encBalanceResult.success) {
                throw new Error('Failed to get encrypted balance: ' + encBalanceResult.error);
            }
            const currentEncryptedRaw = encBalanceResult.encryptedRaw || 0;
            const currentPublicRaw = encBalanceResult.publicRaw || 0;
            const amountRaw = Math.trunc(amount * 1000000); // Convert to microOCT
            if (amountRaw > currentPublicRaw) {
                this.showMessage(`Insufficient balance. You have ${(currentPublicRaw / 1000000).toFixed(2)} OCT available.`, 'error');
                return;
            }
            
            const newEncryptedRaw = currentEncryptedRaw + amountRaw;
            const crypto = new window.CryptoManager();
            const encryptedValue = await crypto.encryptClientBalance(newEncryptedRaw, activeWallet.privateKey);
            
            const result = await this.wallet.network.encryptBalance(
                activeWallet.address,
                amountRaw.toString(),
                activeWallet.privateKey,
                encryptedValue
            );
            

            this.hideLoading();

            if (result.success) {
                const encryptAmountInput = document.getElementById('encrypt-amount');
                if (encryptAmountInput) {
                    encryptAmountInput.value = '';
                }

                this.showMessage('Balance encrypted successfully!', 'success');
                setTimeout(() => {
                    this.updateWalletDisplay();
                    this.updateEncryptBalanceScreen();
                }, 1000);
                this.showScreen('main-screen');
            } else {
                throw new Error(result.error || 'Failed to encrypt balance');
            }

        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to encrypt balance: ' + error.message, 'error');
        }
    }
    
    /**
     * Handle decrypt balance form submission  
     */
    async handleDecryptBalance() {
        
        try {
            const amount = parseFloat(document.getElementById('decrypt-amount')?.value || '0');
            
            if (amount <= 0) {
                this.showMessage('Please enter a valid amount', 'error');
                return;
            }
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('No active wallet found', 'error');
                return;
            }

            this.showLoading('Decrypting balance...');
            const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                activeWallet.address, 
                activeWallet.privateKey
            );

            if (!encBalanceResult.success) {
                throw new Error('Failed to get encrypted balance: ' + encBalanceResult.error);
            }
            const currentEncryptedRaw = encBalanceResult.encryptedRaw || 0;
            const amountRaw = Math.trunc(amount * 1000000); // Convert to microOCT
            
            if (currentEncryptedRaw < amountRaw) {
                throw new Error(`Insufficient encrypted balance. You have ${(currentEncryptedRaw / 1000000).toFixed(2)} OCT encrypted, but tried to decrypt ${amount} OCT`);
            }

            const newEncryptedRaw = currentEncryptedRaw - amountRaw;
            const crypto = new window.CryptoManager();
            const encryptedValue = await crypto.encryptClientBalance(newEncryptedRaw, activeWallet.privateKey);
            const result = await this.wallet.network.decryptBalance(
                activeWallet.address,
                amountRaw.toString(),
                activeWallet.privateKey,
                encryptedValue
            );

            this.hideLoading();

            if (result.success) {
                const decryptAmountInput = document.getElementById('decrypt-amount');
                if (decryptAmountInput) {
                    decryptAmountInput.value = '';
                }

                this.showMessage('Balance decrypted successfully!', 'success');
                setTimeout(() => {
                    this.updateWalletDisplay();
                    this.updateDecryptBalanceScreen();
                }, 1000);
                this.showScreen('main-screen');
            } else {
                throw new Error(result.error || 'Failed to decrypt balance');
            }

        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to decrypt balance: ' + error.message, 'error');
        }
    }
    
    /**
     * Handle private send form submission
     */
    async handlePrivateSend() {
        
        try {
            const recipientAddress = document.getElementById('private-recipient')?.value?.trim() || '';
            const amount = parseFloat(document.getElementById('private-amount')?.value || '0');
            
            if (!recipientAddress || amount <= 0) {
                this.showMessage('Please enter valid recipient address and amount', 'error');
                return;
            }
            if (!this.wallet.network.isValidAddress(recipientAddress)) {
                this.showMessage('Invalid recipient address format', 'error');
                return;
            }
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('No active wallet found', 'error');
                return;
            }

            this.showLoading('Sending private transfer...');
            const publicKeyResult = await this.wallet.network.getPublicKey(recipientAddress);
            
            if (!publicKeyResult || !publicKeyResult.success || !publicKeyResult.publicKey) {
                throw new Error('Recipient public key not found. The recipient needs to have sent at least one transaction to be able to receive private transfers.');
            }
            
            const recipientPublicKey = publicKeyResult.publicKey;
            const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                activeWallet.address, 
                activeWallet.privateKey
            );

            if (!encBalanceResult.success) {
                throw new Error('Failed to get encrypted balance: ' + encBalanceResult.error);
            }

            const availableEncrypted = encBalanceResult.encrypted || 0;
            if (availableEncrypted < amount) {
                throw new Error(`Insufficient encrypted balance. You have ${availableEncrypted.toFixed(2)} OCT encrypted, but tried to send ${amount} OCT`);
            }
            const amountRaw = Math.trunc(amount * 1000000); // Convert to microOCT
            const result = await this.wallet.network.createPrivateTransfer(
                activeWallet.address,
                recipientAddress,
                amountRaw.toString(),
                activeWallet.privateKey,
                recipientPublicKey
            );

            this.hideLoading();

            if (result.success) {
                this.showMessage(`Private transfer sent successfully!`, 'success');
                setTimeout(() => {
                    this.updateWalletDisplay();
                    this.updatePrivateSendScreen();
                }, 1000);
                this.showScreen('main-screen');
            } else {
                if (result.error && !result.error.includes('HTTP 400') && !result.error.includes('Request failed')) {
                    throw new Error(result.error);
                } else {
                    this.showMessage(`Private transfer submitted!`, 'success');
                    setTimeout(() => {
                        this.updateWalletDisplay();
                        this.updatePrivateSendScreen();
                    }, 1000);
                    this.showScreen('main-screen');
                }
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to send private transfer: ' + error.message, 'error');
        }
    }

    /**
     * Debug storage state for troubleshooting
     */
    async debugStorageState() {
        try {
            const storage = await chrome.storage.local.get(null);
            return storage;
        } catch (error) {
            return {};
        }
    }

    /**
     * Clear all extension storage (for debugging)
     */
    async clearAllStorage() {
        try {
            await chrome.storage.local.clear();
            if (this.passwordManager) {
                await this.passwordManager.clearSensitiveData();
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Handle emergency storage clear with user confirmation
     */
    async handleEmergencyStorageClear() {
        const confirmed = await showConfirmDialog(
            '⚠️ Emergency Storage Clear',
            'This will delete ALL wallet data and settings.\nMake sure you have your wallet backup (private key or mnemonic)!\n\nAre you sure you want to continue?',
            'Clear All Data',
            'Cancel'
        );

        if (confirmed) {
            const success = await this.clearAllStorage();
            if (success) {
                alert('Storage cleared successfully. The extension will reload.');
                window.location.reload();
            } else {
                alert('Failed to clear storage.');
            }
        }
    }

    /**
     * Update encrypt balance screen with current balance info
     */
    async updateEncryptBalanceScreen() {
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            const balanceResult = await this.wallet.getBalanceAndNonce();
            const publicBalance = balanceResult.balance || 0;
            let encryptedBalance = 0;
            try {
                const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );
                if (encBalanceResult.success) {
                    encryptedBalance = encBalanceResult.encrypted || 0;
                }
            } catch (e) {
            }
            const publicBalanceEl = document.getElementById('encrypt-public-balance');
            const privateBalanceEl = document.getElementById('encrypt-private-balance');
            const totalBalanceEl = document.getElementById('encrypt-total-balance');
            const totalBalance = publicBalance + encryptedBalance;

            if (publicBalanceEl) {
                publicBalanceEl.textContent = `${publicBalance.toFixed(2)} OCT`;
            }

            if (privateBalanceEl) {
                privateBalanceEl.textContent = `${encryptedBalance.toFixed(2)} OCT`;
            }

            if (totalBalanceEl) {
                totalBalanceEl.textContent = `${totalBalance.toFixed(2)} OCT`;
            }

        } catch (error) {
        }
    }

    /**
     * Update decrypt balance screen with current balance info
     */
    async updateDecryptBalanceScreen() {
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            const balanceResult = await this.wallet.getBalanceAndNonce();
            const publicBalance = balanceResult.balance || 0;
            let encryptedBalance = 0;
            try {
                const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );
                if (encBalanceResult.success) {
                    encryptedBalance = encBalanceResult.encrypted || 0;
                }
            } catch (e) {
            }
            const publicBalanceEl = document.getElementById('decrypt-public-balance');
            const privateBalanceEl = document.getElementById('decrypt-private-balance');
            const totalBalanceEl = document.getElementById('decrypt-total-balance');
            const totalBalance = publicBalance + encryptedBalance;

            if (publicBalanceEl) {
                publicBalanceEl.textContent = `${publicBalance.toFixed(2)} OCT`;
            }

            if (privateBalanceEl) {
                privateBalanceEl.textContent = `${encryptedBalance.toFixed(2)} OCT`;
            }

            if (totalBalanceEl) {
                totalBalanceEl.textContent = `${totalBalance.toFixed(2)} OCT`;
            }

        } catch (error) {
        }
    }

    /**
     * Update private send screen with current balance info
     */
    async updatePrivateSendScreen() {
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            const balanceResult = await this.wallet.getBalanceAndNonce();
            const publicBalance = balanceResult.balance || 0;
            let encryptedBalance = 0;
            try {
                const encBalanceResult = await this.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );
                if (encBalanceResult.success) {
                    encryptedBalance = encBalanceResult.encrypted || 0;
                }
            } catch (e) {
            }
            const publicBalanceEl = document.getElementById('private-send-public-balance');
            const privateBalanceEl = document.getElementById('private-send-balance');
            const totalBalanceEl = document.getElementById('private-send-total-balance');
            const totalBalance = publicBalance + encryptedBalance;
            
            if (publicBalanceEl) publicBalanceEl.textContent = `${publicBalance.toFixed(2)} OCT`;
            if (privateBalanceEl) privateBalanceEl.textContent = `${encryptedBalance.toFixed(2)} OCT`;
            if (totalBalanceEl) totalBalanceEl.textContent = `${totalBalance.toFixed(2)} OCT`;

        } catch (error) {
        }
    }

    /**
     * Update claim transfers screen with pending transfers
     */
    async updateClaimTransfersScreen() {
        try {
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            if (!activeWallet) {
                this.showMessage('Error', 'No active wallet found', 'error');
                return;
            }
            let pendingTransfers = [];
            try {
                const transfersResult = await this.wallet.network.getPendingPrivateTransfers(
                    activeWallet.address,
                    activeWallet.privateKey
                );
                if (transfersResult.success) {
                    pendingTransfers = transfersResult.transfers || [];
                }
            } catch (e) {
            }
            const transfersListEl = document.getElementById('pending-transfers-list');
            if (transfersListEl) {
                if (pendingTransfers.length === 0) {
                    transfersListEl.innerHTML = '';
                    const noTransfersEl = document.getElementById('no-transfers-message');
                    if (noTransfersEl) {
                        noTransfersEl.classList.remove('hidden');
                    }
                } else {
                    const noTransfersEl = document.getElementById('no-transfers-message');
                    if (noTransfersEl) {
                        noTransfersEl.classList.add('hidden');
                    }
                    let transfersHtml = '';
                    
                    for (let index = 0; index < pendingTransfers.length; index++) {
                        const transfer = pendingTransfers[index];
                        let amountStr = '[encrypted]';
                        
                        if (transfer.encrypted_data && transfer.ephemeral_key) {
                            try {
                                const cliAmount = await this.decryptPrivateAmountCLIStyle(
                                    transfer.encrypted_data,
                                    activeWallet.privateKey,
                                    transfer.ephemeral_key
                                );
                                
                                if (cliAmount !== null && !isNaN(cliAmount) && cliAmount !== undefined) {
                                    amountStr = `${(cliAmount / 1000000).toFixed(2)} OCT`;
                                } else {
                                    const sharedSecret = this.wallet.crypto.deriveSharedSecretForClaim(
                                        activeWallet.privateKey, 
                                        transfer.ephemeral_key
                                    );
                                    
                                    const decryptedAmount = await this.wallet.crypto.decryptPrivateAmount(
                                        transfer.encrypted_data, 
                                        sharedSecret
                                    );
                                    
                                    if (decryptedAmount !== null && !isNaN(decryptedAmount) && decryptedAmount !== undefined) {
                                        amountStr = `${(decryptedAmount / 1000000).toFixed(2)} OCT`;
                                    }
                                }
                            } catch (e) {
                            }
                        } else {
                        }
                        const senderAddress = transfer.sender || 'Unknown';
                        const truncatedSender = senderAddress.length > 20 ? 
                            senderAddress.substring(0, 10) + '...' + senderAddress.substring(senderAddress.length - 6) : 
                            senderAddress;
                        const isEncrypted = amountStr.includes('[encrypted]');
                        const amountColor = isEncrypted ? '#a855f7' : '#22c55e';
                        
                        transfersHtml += `
                            <div class="transfer-item" style="
                                background: var(--glass-bg);
                                backdrop-filter: blur(15px);
                                border: 1px solid var(--glass-border);
                                border-radius: var(--radius-md);
                                padding: var(--space-md);
                                margin-bottom: var(--space-sm);
                                transition: all var(--transition-fast);
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                min-height: 60px;
                            ">
                                <!-- Left side: Sender info -->
                                <div style="flex: 1; min-width: 0;">
                                    <div style="
                                        font-size: var(--font-size-xs);
                                        color: rgba(255, 255, 255, 0.7);
                                        margin-bottom: 2px;
                                    ">From</div>
                                    <div style="
                                        font-family: 'SF Mono', Consolas, monospace;
                                        font-size: var(--font-size-sm);
                                        color: var(--text-primary);
                                        font-weight: 500;
                                        cursor: pointer;
                                    " 
                                    class="transfer-sender-address"
                                    data-address="${transfer.sender}"
                                    title="Click to copy: ${transfer.sender}">
                                        ${truncatedSender}
                                    </div>
                                    <div style="
                                        font-size: var(--font-size-xs);
                                        color: rgba(255, 255, 255, 0.5);
                                        margin-top: 2px;
                                    ">Epoch: ${transfer.epoch_id || '?'}</div>
                                </div>
                                
                                <!-- Center: Amount -->
                                <div style="
                                    text-align: center;
                                    margin: 0 var(--space-sm);
                                    min-width: 80px;
                                ">
                                    <div style="
                                        font-size: var(--font-size-sm);
                                        font-weight: 600;
                                        color: ${amountColor};
                                        font-family: 'SF Mono', Consolas, monospace;
                                    ">${amountStr}</div>
                                </div>
                                
                                <!-- Right side: Claim button -->
                                <button class="btn btn-primary claim-transfer-btn" 
                                        data-transfer-id="${transfer.id}" 
                                        data-transfer-index="${index}"
                                        style="
                                            padding: 6px 12px;
                                            background: linear-gradient(135deg, #8b5cf6, #a855f7);
                                            border: none;
                                            border-radius: var(--radius-sm);
                                            color: white;
                                            font-size: var(--font-size-xs);
                                            font-weight: 600;
                                            cursor: pointer;
                                            transition: all var(--transition-fast);
                                            white-space: nowrap;
                                        ">
                                    Claim
                                </button>
                            </div>
                        `;
                    }
                    
                    transfersListEl.innerHTML = transfersHtml;
                    const claimButtonsContainer = document.getElementById('claim-buttons-container');
                    if (claimButtonsContainer && pendingTransfers.length > 1) {
                        claimButtonsContainer.classList.remove('hidden');
                        claimButtonsContainer.innerHTML = `
                            <button id="claim-all-transfers-btn" class="btn btn-primary" 
                                    style="
                                        width: 100%;
                                        padding: var(--space-md);
                                        background: linear-gradient(135deg, #8b5cf6, #a855f7);
                                        border: none;
                                        border-radius: var(--radius-md);
                                        color: white;
                                        font-size: var(--font-size-sm);
                                        font-weight: 600;
                                        cursor: pointer;
                                        transition: all var(--transition-fast);
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        gap: var(--space-sm);
                                    ">
                                Claim All ${pendingTransfers.length} Transfers
                            </button>
                        `;
                        const claimAllBtn = document.getElementById('claim-all-transfers-btn');
                        if (claimAllBtn) {
                            claimAllBtn.addEventListener('click', () => {
                                claimAllBtn.disabled = true;
                                claimAllBtn.style.opacity = '0.6';
                                claimAllBtn.style.cursor = 'not-allowed';
                                claimAllBtn.innerHTML = `
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M12 2a10 10 0 0 1 10 10"/>
                                    </svg>
                                    Processing...
                                `;
                                
                                this.claimAllPrivateTransfers(pendingTransfers);
                            });
                            claimAllBtn.addEventListener('mouseover', (e) => {
                                e.target.style.transform = 'scale(1.02)';
                                e.target.style.background = 'linear-gradient(135deg, #7c3aed, #8b5cf6)';
                            });
                            claimAllBtn.addEventListener('mouseout', (e) => {
                                e.target.style.transform = 'scale(1)';
                                e.target.style.background = 'linear-gradient(135deg, #8b5cf6, #a855f7)';
                            });
                        }
                    } else if (claimButtonsContainer) {
                        claimButtonsContainer.classList.add('hidden');
                    }
                    setTimeout(() => {
                        document.querySelectorAll('.claim-transfer-btn').forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                const transferId = e.target.getAttribute('data-transfer-id');
                                this.claimPrivateTransfer(transferId);
                            });
                            btn.addEventListener('mouseover', (e) => {
                                e.target.style.transform = 'scale(1.05)';
                            });
                            btn.addEventListener('mouseout', (e) => {
                                e.target.style.transform = 'scale(1)';
                            });
                        });
                        document.querySelectorAll('.transfer-sender-address').forEach(addressEl => {
                            addressEl.addEventListener('click', (e) => {
                                const address = e.target.getAttribute('data-address');
                                navigator.clipboard.writeText(address);
                                e.target.style.color = '#22c55e';
                                setTimeout(() => {
                                    e.target.style.color = 'var(--text-inverse)';
                                }, 1000);
                            });
                        });
                    }, 100);
                }
            }

        } catch (error) {
        }
    }

    /**
     * Claim all pending private transfers
     * @param {Array} transfers
     */
    async claimAllPrivateTransfers(transfers) {
        if (!transfers || transfers.length === 0) {
            this.showMessage('No transfers to claim', 'info');
            return;
        }

        try {
            
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('No active wallet found', 'error');
                return;
            }

            this.showLoading(`Claiming ${transfers.length} transfers...`);

            let successful = 0;
            let failed = 0;
            const errors = [];
            for (let i = 0; i < transfers.length; i++) {
                const transfer = transfers[i];
                
                try {
                    this.showLoading(`Claiming transfer ${i + 1}/${transfers.length}...`);
                    
                    const result = await this.wallet.network.claimPrivateTransfer(
                        activeWallet.address,
                        activeWallet.privateKey,
                        transfer.id
                    );
                    
                    if (result.success) {
                        successful++;
                    } else {
                        failed++;
                        const error = result.error || 'Unknown error';
                        errors.push(`Transfer ${i + 1}: ${error}`);
                    }
                    if (i < transfers.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                } catch (error) {
                    failed++;
                    errors.push(`Transfer ${i + 1}: ${error.message || error}`);
                }
            }

            this.hideLoading();
            if (successful === transfers.length) {
                this.showMessage(`Successfully claimed all ${successful} transfers!`, 'success');
            } else if (successful > 0) {
                const message = `Claimed ${successful} transfers successfully. ${failed} failed.`;
                this.showMessage(message, 'warning');
                if (errors.length > 0) {
                }
            } else {
                this.showMessage(`Failed to claim any transfers. ${errors[0] || 'Unknown error'}`, 'error');
            }
            const claimButtonsContainer = document.getElementById('claim-buttons-container');
            if (claimButtonsContainer) {
                claimButtonsContainer.classList.add('hidden');
            }
            setTimeout(() => {
                this.updateClaimTransfersScreen();
            }, 1000);

        } catch (error) {
            this.hideLoading();
            this.showMessage(`Failed to claim transfers: ${error.message}`, 'error');
            const claimAllBtn = document.getElementById('claim-all-transfers-btn');
            if (claimAllBtn) {
                claimAllBtn.disabled = false;
                claimAllBtn.style.opacity = '1';
                claimAllBtn.style.cursor = 'pointer';
                claimAllBtn.innerHTML = `
                    Claim All ${transfers.length} Transfers
                `;
            }
        }
    }

    /**
     * Claim a specific private transfer (called from HTML onclick)
     * @param {string} transferId
     */
    async claimPrivateTransfer(transferId) {
        try {
            
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.showMessage('No active wallet found', 'error');
                return;
            }
            
            
            this.showLoading('Claiming transfer...');
            
            const result = await this.wallet.network.claimPrivateTransfer(
                activeWallet.address,
                activeWallet.privateKey,
                transferId
            );
            
            this.hideLoading();
            
            if (result.success) {
                this.showMessage('Transfer claimed successfully! Your encrypted balance has been updated.', 'success');
                setTimeout(() => {
                    this.updateWalletDisplay();
                    this.updateClaimTransfersScreen();
                }, 1000);
            } else {
                this.showMessage('Failed to claim transfer: ' + (result.error || result.result), 'error');
            }
            
        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to claim transfer: ' + error.message, 'error');
        }
    }

    /**
     * Initialize network settings functionality
     */
    async initializeNetworkSettings() {
        if (this.modules?.settings) {
            return this.modules.settings.initializeNetworkSettings();
        }
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
                optionElement.addEventListener('click', () => {
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

            this.showLoading(`Switching to ${config.name}...`);
            await chrome.storage.local.set({
                [window.OctraConfig.STORAGE.KEYS.CURRENT_NETWORK]: networkId
            });
            await this.updateNetworkConfig(networkId);
            if (this.wallet && this.wallet.network) {
                this.wallet.network.baseUrl = config.rpc_url;
                await this.updateWalletDisplay();
            }
            await this.populateNetworkOptions();

            this.hideLoading();
            this.showMessage(`Successfully switched to ${config.name}`, 'success');

        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to switch network: ' + error.message, 'error');
        }
    }

    /**
     * Initialize custom network form events
     */
    initializeCustomNetworkEvents() {
        try {
            const customNetworkForm = document.getElementById('custom-network-form');
            if (customNetworkForm) {
                customNetworkForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveCustomNetwork();
                });
            }
            const cancelBtn = document.getElementById('cancel-custom-network');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    this.hideCustomNetworkForm();
                });
            }

        } catch (error) {
        }
    }

    /**
     * Show custom network configuration form
     */
    async showCustomNetworkForm() {
        try {
            const configSection = document.getElementById('custom-network-config');
            if (configSection) {
                configSection.classList.remove('hidden');
                const customConfig = await this.getCustomNetworkConfig();
                if (customConfig) {
                    this.populateCustomNetworkForm(customConfig);
                }
            }
        } catch (error) {
        }
    }

    /**
     * Hide custom network configuration form
     */
    hideCustomNetworkForm() {
        try {
            const configSection = document.getElementById('custom-network-config');
            if (configSection) {
                configSection.classList.add('hidden');
            }
        } catch (error) {
        }
    }

    /**
     * Get custom network configuration from storage
     */
    async getCustomNetworkConfig() {
        try {
            const result = await chrome.storage.local.get([window.OctraConfig.STORAGE.KEYS.CUSTOM_NETWORK_CONFIG]);
            return result[window.OctraConfig.STORAGE.KEYS.CUSTOM_NETWORK_CONFIG] || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Populate custom network form with existing config
     */
    populateCustomNetworkForm(config) {
        try {
            const elements = {
                'custom-network-name': config.name || 'Custom Network',
                'custom-rpc-url': config.rpc_url || '',
                'custom-explorer-url': config.explorer_url || '',
                'custom-explorer-address-url': config.explorer_address_url || ''
            };

            Object.entries(elements).forEach(([elementId, value]) => {
                const element = document.getElementById(elementId);
                if (element) {
                    element.value = value;
                }
            });
        } catch (error) {
        }
    }

    /**
     * Save custom network configuration
     */
    async saveCustomNetwork() {
        try {
            const formData = {
                name: document.getElementById('custom-network-name').value.trim() || 'Custom Network',
                rpc_url: document.getElementById('custom-rpc-url').value.trim(),
                explorer_url: document.getElementById('custom-explorer-url').value.trim(),
                explorer_address_url: document.getElementById('custom-explorer-address-url').value.trim()
            };
            if (!formData.rpc_url) {
                this.showMessage('RPC URL is required for custom network', 'error');
                return;
            }
            try {
                new URL(formData.rpc_url);
                if (formData.explorer_url) new URL(formData.explorer_url);
                if (formData.explorer_address_url) new URL(formData.explorer_address_url);
            } catch (error) {
                this.showMessage('Please enter valid URLs', 'error');
                return;
            }

            this.showLoading('Saving custom network...');
            await chrome.storage.local.set({
                [window.OctraConfig.STORAGE.KEYS.CUSTOM_NETWORK_CONFIG]: formData
            });
            window.OctraConfig.NETWORKS.custom = {
                ...window.OctraConfig.NETWORKS.custom,
                ...formData,
                color: '#8b5cf6',
                editable: true
            };
            this.hideCustomNetworkForm();
            await this.populateNetworkOptions();

            this.hideLoading();
            this.showMessage('Custom network saved successfully', 'success');

        } catch (error) {
            this.hideLoading();
            this.showMessage('Failed to save custom network: ' + error.message, 'error');
        }
    }

    /**
     * Initialize floating connection indicator
     */
    async initializeFloatingConnectionIndicator() {
        try {
            const indicator = document.getElementById('floating-connection-indicator');
            if (!indicator) {
                return;
            }
            this.hideConnectionIndicator();
            const toggleBtn = document.getElementById('connection-toggle-btn');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    this.toggleCurrentTabConnection();
                });
            }
            this.setupSlideReveal(indicator);
            
        } catch (error) {
        }
    }

    /**
     * Get current active tab information
     */
    async updateActiveTabInfo() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                return null;
            }
            const url = new URL(tab.url);
            if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
                this.currentTabInfo = null;
                return null;
            }

            const tabInfo = {
                id: tab.id,
                title: tab.title || 'Untitled',
                url: tab.url,
                origin: url.origin,
                hostname: url.hostname,
                favicon: tab.favIconUrl || null
            };

            this.currentTabInfo = tabInfo;
            this.showConnectionIndicator();
            this.updateConnectionIndicatorUI(tabInfo);
            
            return tabInfo;
        } catch (error) {
            this.hideConnectionIndicator();
            return null;
        }
    }

    /**
     * Update connection indicator UI with tab info
     */
    updateConnectionIndicatorUI(tabInfo) {
        try {
            const faviconImg = document.getElementById('connection-site-favicon');
            const fallbackIcon = document.getElementById('connection-fallback-icon');
            
            if (faviconImg && tabInfo.favicon) {
                faviconImg.src = tabInfo.favicon;
                faviconImg.onerror = () => {
                    faviconImg.src = '';
                };
            } else if (faviconImg) {
                faviconImg.src = '';
            }
            const titleElement = document.getElementById('connection-site-title');
            const urlElement = document.getElementById('connection-site-url');
            
            if (titleElement) {
                titleElement.textContent = tabInfo.title;
            }
            
            if (urlElement) {
                urlElement.textContent = tabInfo.hostname;
            }

        } catch (error) {
        }
    }

    /**
     * Update connection status and button state
     */
    async updateConnectionIndicator() {
        try {
            await this.updateActiveTabInfo();
            
            if (!this.currentTabInfo) {
                return;
            }
            const isConnected = await this.isTabConnected(this.currentTabInfo.origin);
            const hasSDKIntegration = await this.checkTabSDKIntegration(this.currentTabInfo.id);
            const statusDot = document.getElementById('connection-status-dot');
            const toggleBtn = document.getElementById('connection-toggle-btn');
            const btnText = document.getElementById('connection-btn-text');

            if (statusDot) {
                if (!hasSDKIntegration) {
                    statusDot.className = 'status-dot no-sdk';
                } else {
                    statusDot.className = `status-dot ${isConnected ? 'connected' : 'disconnected'}`;
                }
            }

            if (toggleBtn) {
                if (!hasSDKIntegration) {
                    toggleBtn.className = 'connection-btn disabled';
                    toggleBtn.disabled = true;
                } else {
                    toggleBtn.className = `connection-btn ${isConnected ? 'connected' : 'disconnected'}`;
                    toggleBtn.disabled = false;
                }
            }

            if (btnText) {
                if (!hasSDKIntegration) {
                    btnText.textContent = 'No SDK';
                } else {
                    btnText.textContent = isConnected ? 'Disconnect' : 'Connect';
                }
            }

        } catch (error) {
        }
    }

    /**
     * Check if a tab/origin is connected
     */
    async isTabConnected(origin) {
        try {
            const result = await chrome.storage.local.get([`dapp_connection_${origin}`]);
            const connection = result[`dapp_connection_${origin}`];
            return connection && connection.connected;
        } catch (error) {
            return false;
        }
    }

    /**
     * Toggle connection for current tab
     */
    async toggleCurrentTabConnection() {
        try {
            if (!this.currentTabInfo) {
                this.showMessage('No valid tab detected', 'error');
                return;
            }

            const isConnected = await this.isTabConnected(this.currentTabInfo.origin);
            
            if (isConnected) {
                await this.disconnectFromTab(this.currentTabInfo.origin);
            } else {
                await this.connectToTab(this.currentTabInfo);
            }
            await this.updateConnectionIndicator();

        } catch (error) {
            this.showMessage('Failed to toggle connection: ' + error.message, 'error');
        }
    }

    /**
     * Check if a tab has Octra SDK integration
     */
    async checkTabSDKIntegration(tabId) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    function hasOctraSDKIntegration() {
                        const sdkScripts = document.querySelectorAll('script[src*="octra-wallet-sdk"], script[src*="@octra/wallet-sdk"]');
                        if (sdkScripts.length > 0) {
                            return { detected: true, method: 'SDK script imports', confidence: 'high' };
                        }
                        const octraMeta = document.querySelector('meta[name="octra-wallet"], meta[name="octra-dapp"]');
                        if (octraMeta && octraMeta.content) {
                            try {
                                const metaData = JSON.parse(octraMeta.content);
                                if (metaData.name || metaData.version) {
                                    return { detected: true, method: 'Octra meta tags', confidence: 'high' };
                                }
                            } catch (e) {
                            }
                        }
                        if (typeof window.OctraWalletSDK !== 'undefined') {
                            return { detected: true, method: 'SDK window object', confidence: 'medium' };
                        }
                        if (typeof window.__OCTRA_APP__ !== 'undefined') {
                            return { detected: true, method: 'Legacy app marker', confidence: 'low' };
                        }
                        
                        return { detected: false, method: 'none', confidence: 'none' };
                    }
                    
                    return hasOctraSDKIntegration();
                }
            });
            
            const result = results[0]?.result;
            return result?.detected || false;
            
        } catch (error) {
            return false; 
        }
    }

    /**
     * Connect to a specific tab
     */
    async connectToTab(tabInfo) {
        try {
            const hasSDK = await this.checkTabSDKIntegration(tabInfo.id);
            if (!hasSDK) {
                this.showMessage(`Cannot connect to ${tabInfo.hostname}: No Octra SDK integration detected`, 'error');
                return;
            }
            const walletManager = this.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            if (!activeWallet) {
                this.showMessage('No active wallet found. Please create or import a wallet first.', 'error');
                return;
            }
            await chrome.storage.local.set({
                [`dapp_connection_${tabInfo.origin}`]: {
                    connected: true,
                    hostname: tabInfo.hostname,
                    connectedAt: Date.now()
                }
            });

            this.showMessage(`Connected to ${tabInfo.hostname}`, 'success');

        } catch (error) {
            throw error;
        }
    }

    /**
     * Disconnect from a specific tab
     */
    async disconnectFromTab(origin) {
        try {
            await chrome.storage.local.remove([`dapp_connection_${origin}`]);
            try {
                const tabs = await chrome.tabs.query({url: `${origin}/*`});
                for (const tab of tabs) {
                    try {
                        await chrome.tabs.sendMessage(tab.id, {
                            source: 'octra-wallet-disconnect',
                            type: 'disconnect',
                            data: { reason: 'user_action' }
                        });
                    } catch (tabError) {
                    }
                }
            } catch (notificationError) {
            }
            let hostname;
            try {
                hostname = new URL(origin).hostname;
            } catch (urlError) {
                hostname = origin;
            }
            
            this.showMessage(`Disconnected from ${hostname}`, 'success');

        } catch (error) {
            throw error;
        }
    }

    /**
     * Show connection indicator
     */
    showConnectionIndicator() {
        const indicator = document.getElementById('floating-connection-indicator');
        if (indicator) {
            indicator.classList.remove('hidden');
        }
    }

    /**
     * Hide connection indicator
     */
    hideConnectionIndicator() {
        const indicator = document.getElementById('floating-connection-indicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
    }

    /**
     * Show connection indicator specifically for main screen
     */
    async showConnectionIndicatorOnMainScreen() {
        try {
            const tabInfo = await this.updateActiveTabInfo();
            if (!tabInfo) {
                this.hideConnectionIndicator();
                return;
            }
            this.showConnectionIndicator();
            await this.updateConnectionIndicator();
            
        } catch (error) {
            this.hideConnectionIndicator();
        }
    }

    /**
     * Setup slide-to-reveal functionality for connection indicator
     */
    setupSlideReveal(indicator) {
        try {
            const slideHandle = document.getElementById('connection-slide-handle');
            if (!slideHandle) {
                return;
            }

            let isExpanded = false;
            let expandTimeout;

            const expand = () => {
                if (!isExpanded) {
                    indicator.classList.add('expanded');
                    isExpanded = true;
                }
            };

            const collapse = () => {
                if (isExpanded) {
                    indicator.classList.remove('expanded');
                    isExpanded = false;
                }
            };

            const scheduleCollapse = () => {
                clearTimeout(expandTimeout);
                expandTimeout = setTimeout(collapse, 3000); 
            };
            slideHandle.addEventListener('mouseenter', expand);
            slideHandle.addEventListener('mouseleave', scheduleCollapse);
            indicator.addEventListener('mouseenter', () => {
                clearTimeout(expandTimeout);
                expand();
            });

            indicator.addEventListener('mouseleave', scheduleCollapse);
            slideHandle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isExpanded) {
                    collapse();
                } else {
                    expand();
                }
            });

        } catch (error) {
        }
    }

    /**
     * Get password manager for modules
     */
    getPasswordManager() {
        return this.passwordManager;
    }

    /**
     * Get wallet manager for modules
     */
    getWalletManager() {
        return this.passwordManager?.getWalletManager();
    }

    /**
     * Refresh wallet data after changes
     */
    async refreshWalletData() {
        try {
            if (this.wallet?.isReady()) {
                await this.updateWalletDisplay();
            }
        } catch (error) {
        }
    }

    /**
     * Sync wallet instance with active wallet
     */
    async syncWalletInstance() {
        try {
            const walletManager = this.getWalletManager();
            if (walletManager) {
                const activeWallet = walletManager.getActiveWallet();
                if (activeWallet && this.wallet) {
                    const success = this.wallet.initialize(activeWallet.privateKey, activeWallet.address);
                    if (success) {
                    }
                }
            }
        } catch (error) {
        }
    }
}
window.UIManager = UIManager; 