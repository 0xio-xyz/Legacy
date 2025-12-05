/**
 * Wallet Import/Export Module
 * Handles wallet import and export functionality, including first-time vs additional wallet differentiation
 */

class WalletIOModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.isImportingWallet = false;
        this.tempImportData = null;
        this.pendingAction = null;
    }

    /**
     * Initialize wallet I/O functionality
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for wallet import/export
     */
    setupEventListeners() {
        this.addEventListenerSafe('import-wallet-option', 'click', () => this.importWalletWithDifferentiation());
        this.addEventListenerSafe('import-wallet-btn', 'click', () => this.importWallet());
        this.addEventListenerSafe('export-wallet-btn', 'click', () => this.exportWallet());
        this.addEventListenerSafe('export-private-key-btn', 'click', () => this.exportPrivateKey());
        this.addEventListenerSafe('export-recovery-phrase-btn', 'click', () => this.exportRecoveryPhrase());
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
     * Import wallet with differentiation (first vs additional)
     */
    async importWalletWithDifferentiation() {
        try {
            const walletManager = this.uiManager.getWalletManager();
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
        try {
            const isPasswordSet = await this.uiManager.passwordManager.isPasswordSet();
            if (isPasswordSet) {
                await this.showAdditionalWalletImport();
                return;
            }
            this.pendingAction = 'import-wallet';
            if (this.uiManager.modules?.screenNavigator) {
                await this.uiManager.modules.screenNavigator.showScreen('password-setup-screen');
            } else {
                await this.uiManager.showScreen('password-setup-screen');
            }
            
        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Failed to start wallet import: ' + error.message, 'error');
        }
    }

    /**
     * Show additional wallet import (when wallet count > 0)
     * Password already set, just need wallet import
     */
    async showAdditionalWalletImport() {
        try {
            const isPasswordSet = await this.uiManager.passwordManager.isPasswordSet();
            if (!isPasswordSet) {
                await this.showFirstTimeWalletImport();
                return;
            }
        
            const isUnlocked = this.uiManager.passwordManager.isWalletUnlocked();
            if (!isUnlocked) {
                this.uiManager.modules.uiFeedback.showMessage('Please unlock your wallet first', 'error');
                if (this.uiManager.modules?.screenNavigator) {
                    await this.uiManager.modules.screenNavigator.showScreen('password-unlock-screen');
                } else {
                    await this.uiManager.showScreen('password-unlock-screen');
                }
                return;
            }
            if (this.uiManager.modules?.screenNavigator) {
                await this.uiManager.modules.screenNavigator.showScreen('import-wallet-screen');
            } else {
                await this.uiManager.showScreen('import-wallet-screen');
            }
            
        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Failed to start additional wallet import: ' + error.message, 'error');
        }
    }

    /**
     * Import existing wallet (processes the actual import)
     */
    async importWallet() {
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
                this.uiManager.modules.uiFeedback.showMessage('Please enter a wallet name', 'error');
                return;
            }
            
            if (!privateKey) {
                this.uiManager.modules.uiFeedback.showMessage('Please enter the private key', 'error');
                return;
            }
            
            if (!walletAddress) {
                this.uiManager.modules.uiFeedback.showMessage('Please enter the wallet address', 'error');
                return;
            }

            this.uiManager.modules.uiFeedback.showLoading('Importing wallet...');
            if (!this.uiManager.passwordManager) {
                throw new Error('Password manager not initialized');
            }
            
            const isPasswordSet = await this.uiManager.passwordManager.isPasswordSet();
            if (!isPasswordSet) {
                throw new Error('Password not set. Please go through the setup process.');
            }
            const walletManager = this.uiManager.passwordManager.getWalletManager();
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
            
            this.uiManager.modules.uiFeedback.showMessage('Wallet imported successfully', 'success');
            if (form) {
                form.reset();
            }
            
            const endTime = performance.now();
            
            if (this.uiManager.modules?.screenNavigator) {
                await this.uiManager.modules.screenNavigator.showScreen('main-screen');
            } else {
                await this.uiManager.showScreen('main-screen');
            }
            
        } catch (error) {
            
            let errorMessage = 'Failed to import wallet';
            if (error.message.includes('already exists') || error.message.includes('duplicate')) {
                errorMessage = 'A wallet with this name or address already exists';
            } else if (error.message.includes('invalid') || error.message.includes('Invalid')) {
                errorMessage = 'Invalid private key or wallet address';
            } else if (error.message) {
                errorMessage = 'Failed to import wallet: ' + error.message;
            }
            
            this.uiManager.modules.uiFeedback.showMessage(errorMessage, 'error');
            
        } finally {
            this.uiManager.modules.uiFeedback.hideLoading();
            this.isImportingWallet = false;
        }
    }

    /**
     * Export wallet data (basic implementation)
     */
    async exportWallet() {
        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.uiManager.modules.uiFeedback.showMessage('No active wallet found', 'error');
                return;
            }
            const exportData = {
                name: activeWallet.name,
                address: activeWallet.address,
                privateKey: activeWallet.privateKey,
                mnemonic: activeWallet.mnemonic || null,
                exportDate: new Date().toISOString()
            };
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `octra-wallet-${activeWallet.name}-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.uiManager.modules.uiFeedback.showMessage('Wallet exported successfully', 'success');

        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Failed to export wallet: ' + error.message, 'error');
        }
    }

    /**
     * Export private key to clipboard
     */
    async exportPrivateKey() {
        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet || !activeWallet.privateKey) {
                this.uiManager.modules.uiFeedback.showMessage('No private key available', 'error');
                return;
            }
            await navigator.clipboard.writeText(activeWallet.privateKey);
            this.uiManager.modules.uiFeedback.showMessage('Private key copied to clipboard', 'success');

        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Failed to copy private key', 'error');
        }
    }

    /**
     * Export recovery phrase to clipboard
     */
    async exportRecoveryPhrase() {
        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet || !activeWallet.mnemonic) {
                this.uiManager.modules.uiFeedback.showMessage('No recovery phrase available', 'error');
                return;
            }
            await navigator.clipboard.writeText(activeWallet.mnemonic);
            this.uiManager.modules.uiFeedback.showMessage('Recovery phrase copied to clipboard', 'success');

        } catch (error) {
            this.uiManager.modules.uiFeedback.showMessage('Failed to copy recovery phrase', 'error');
        }
    }

    /**
     * Set pending action for post-setup operations
     */
    setPendingAction(action) {
        this.pendingAction = action;
    }

    /**
     * Get pending action
     */
    getPendingAction() {
        return this.pendingAction;
    }

    /**
     * Clear pending action
     */
    clearPendingAction() {
        this.pendingAction = null;
    }

    /**
     * Set temporary import data for multi-step import process
     */
    setTempImportData(data) {
        this.tempImportData = data;
    }

    /**
     * Get temporary import data
     */
    getTempImportData() {
        return this.tempImportData;
    }

    /**
     * Clear temporary import data
     */
    clearTempImportData() {
        this.tempImportData = null;
    }

    /**
     * Validate import data format
     */
    validateImportData(privateKey, address) {
        try {
            if (!privateKey || typeof privateKey !== 'string' || privateKey.length < 32) {
                throw new Error('Invalid private key format');
            }

            if (!address || typeof address !== 'string' || !address.startsWith('oct')) {
                throw new Error('Invalid address format');
            }

            return true;
        } catch (error) {
            throw new Error('Validation failed: ' + error.message);
        }
    }

    /**
     * Check import status
     */
    isImporting() {
        return this.isImportingWallet;
    }
}
window.WalletIOModule = WalletIOModule;