/**
 * Wallet Operations Module
 * Handles basic wallet operations like send, receive, balance updates
 */

class WalletOperationsModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.isProcessingSend = false;
        this.isProcessingPrivateSend = false;
    }

    /**
     * Initialize wallet operations functionality
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for wallet operations
     */
    setupEventListeners() {
        this.addEventListenerSafe('send-form', 'submit', (e) => {
            e.preventDefault();
            this.handleSend();
        });
        this.addEventListenerSafe('private-send-form', 'submit', (e) => {
            e.preventDefault();
            this.handlePrivateSend();
        });
        this.addEventListenerSafe('encrypt-balance-form', 'submit', (e) => {
            e.preventDefault();
            this.handleEncryptBalance();
        });
        this.addEventListenerSafe('decrypt-balance-form', 'submit', (e) => {
            e.preventDefault();
            this.handleDecryptBalance();
        });
        this.addEventListenerSafe('claim-transfers-form', 'submit', (e) => {
            e.preventDefault();
            this.handleClaimTransfers();
        });
        this.addEventListenerSafe('refresh-balance-btn', 'click', () => this.refreshBalance());
        this.addEventListenerSafe('refresh-private-balance-btn', 'click', () => this.refreshPrivateBalance());
        this.addEventListenerSafe('send-address', 'input', () => this.uiManager.hideMessage());
        this.addEventListenerSafe('send-amount', 'input', () => this.uiManager.hideMessage());
        this.addEventListenerSafe('private-recipient', 'input', () => this.uiManager.hideMessage());
        this.addEventListenerSafe('private-amount', 'input', () => this.uiManager.hideMessage());
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
     * Handle regular send transaction
     */
    async handleSend() {
        if (this.isProcessingSend) {
            return;
        }
        
        this.isProcessingSend = true;
        
        try {
            const recipientElement = document.getElementById('send-address');
            const amountElement = document.getElementById('send-amount');
            const messageElement = document.getElementById('send-message');
            
            if (!recipientElement || !amountElement) {
                this.uiManager.showMessage('Form elements not found', 'error');
                return;
            }
            
            const toAddress = recipientElement.value.trim();
            const amount = parseFloat(amountElement.value);
            const message = messageElement ? messageElement.value.trim() || null : null;

            if (!toAddress || !amount || amount <= 0) {
                this.uiManager.showMessage('Please enter valid recipient address and amount', 'error');
                return;
            }

            this.uiManager.showLoading('Sending transaction...');

            const result = await this.uiManager.wallet.sendTransaction(toAddress, amount, message);
            
            this.uiManager.hideLoading();
            
            if (result.success) {
                let successMsg = `Transaction sent successfully!\nHash: ${result.result}`;
                if (result.retryAttempts > 0) {
                    successMsg += `\n(Delivered after ${result.retryAttempts} retry attempts)`;
                }
                
                this.uiManager.showMessage(successMsg, 'success');
                recipientElement.value = '';
                amountElement.value = '';
                if (messageElement) {
                    messageElement.value = '';
                }
                
                await this.uiManager.showScreen('main-screen');
                setTimeout(async () => {
                    try {
                        await this.uiManager.updateWalletDisplay();
                    } catch (error) {
                    }
                }, 2000);
            } else {
                let errorMsg = `Failed to send transaction: ${result.result}`;
                
                if (result.result && result.result.toLowerCase().includes('duplicate')) {
                    errorMsg = 'Transaction failed due to nonce conflict. The wallet has automatically retried with a fresh nonce.';
                } else if (result.extra && result.extra.status === 409) {
                    errorMsg = 'Transaction failed due to duplicate nonce. This usually happens when multiple transactions are sent too quickly.';
                }
                
                if (result.retryAttempts > 0) {
                    errorMsg += `\n(Failed after ${result.retryAttempts} retry attempts)`;
                }
                
                this.uiManager.showMessage(errorMsg, 'error');
            }
        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage(`Transaction failed: ${error.message}`, 'error');
        } finally {
            this.isProcessingSend = false;
        }
    }

    /**
     * Handle private send transaction
     */
    async handlePrivateSend() {
        if (this.isProcessingPrivateSend) {
            return;
        }
        
        this.isProcessingPrivateSend = true;
        
        try {
            const recipientAddress = document.getElementById('private-recipient')?.value?.trim() || '';
            const amount = parseFloat(document.getElementById('private-amount')?.value || '0');
            
            if (!recipientAddress || amount <= 0) {
                this.uiManager.showMessage('Please enter valid recipient address and amount', 'error');
                return;
            }
            if (!this.uiManager.wallet.network.isValidAddress(recipientAddress)) {
                this.uiManager.showMessage('Invalid recipient address format', 'error');
                return;
            }
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.uiManager.showMessage('No active wallet found', 'error');
                return;
            }

            this.uiManager.showLoading('Sending private transfer...');
            const publicKeyResult = await this.uiManager.wallet.network.getPublicKey(recipientAddress);
            
            if (!publicKeyResult || !publicKeyResult.success || !publicKeyResult.publicKey) {
                throw new Error('Recipient public key not found. The recipient needs to have sent at least one transaction to be able to receive private transfers.');
            }
            
            const recipientPublicKey = publicKeyResult.publicKey;
            const encBalanceResult = await this.uiManager.wallet.network.getEncryptedBalance(
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
            const amountRaw = Math.trunc(amount * 1000000);
            const result = await this.uiManager.wallet.network.createPrivateTransfer(
                activeWallet.address,
                recipientAddress,
                amountRaw.toString(),
                activeWallet.privateKey,
                recipientPublicKey
            );

            this.uiManager.hideLoading();

            if (result.success) {
                this.uiManager.showMessage('Private transfer sent successfully!', 'success');
                document.getElementById('private-recipient').value = '';
                document.getElementById('private-amount').value = '';
                setTimeout(() => {
                    this.uiManager.updateWalletDisplay();
                    this.uiManager.updatePrivateSendScreen();
                }, 2000);
            } else {
                if (result.error && !result.error.includes('HTTP 400') && !result.error.includes('Request failed')) {
                    throw new Error(result.error);
                } else {
                    this.uiManager.showMessage('Private transfer submitted!', 'success');
                    document.getElementById('private-recipient').value = '';
                    document.getElementById('private-amount').value = '';
                    
                    setTimeout(() => {
                        this.uiManager.updateWalletDisplay();
                        this.uiManager.updatePrivateSendScreen();
                    }, 2000);
                }
            }
            
        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Failed to send private transfer: ' + error.message, 'error');
        } finally {
            this.isProcessingPrivateSend = false;
        }
    }

    /**
     * Handle encrypt balance
     */
    async handleEncryptBalance() {
        try {
            const amount = parseFloat(document.getElementById('encrypt-amount')?.value || '0');
            
            if (isNaN(amount) || amount <= 0) {
                this.uiManager.showMessage('Please enter a valid amount to encrypt', 'error');
                return;
            }

            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.uiManager.showMessage('No active wallet found', 'error');
                return;
            }

            this.uiManager.showLoading('Encrypting balance...');
            const amountRaw = Math.trunc(amount * 1000000);
            
            const result = await this.uiManager.wallet.network.encryptBalance(
                activeWallet.address,
                amountRaw.toString(),
                activeWallet.privateKey
            );

            this.uiManager.hideLoading();

            if (result.success) {
                this.uiManager.showMessage('Balance encrypted successfully!', 'success');
                document.getElementById('encrypt-amount').value = '';
                setTimeout(() => {
                    this.uiManager.updateWalletDisplay();
                    this.uiManager.updateEncryptBalanceScreen();
                }, 1000);
            } else {
                throw new Error(result.error || 'Failed to encrypt balance');
            }

        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Failed to encrypt balance: ' + error.message, 'error');
        }
    }

    /**
     * Handle decrypt balance
     */
    async handleDecryptBalance() {
        try {
            const amount = parseFloat(document.getElementById('decrypt-amount')?.value || '0');
            
            if (isNaN(amount) || amount <= 0) {
                this.uiManager.showMessage('Please enter a valid amount to decrypt', 'error');
                return;
            }

            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.uiManager.showMessage('No active wallet found', 'error');
                return;
            }

            this.uiManager.showLoading('Decrypting balance...');

            const amountRaw = Math.trunc(amount * 1000000);
            const encryptedValue = await this.uiManager.wallet.crypto.encrypt(amountRaw.toString());
            
            const result = await this.uiManager.wallet.network.decryptBalance(
                activeWallet.address,
                amountRaw.toString(),
                activeWallet.privateKey,
                encryptedValue
            );

            this.uiManager.hideLoading();

            if (result.success) {
                this.uiManager.showMessage('Balance decrypted successfully!', 'success');
                document.getElementById('decrypt-amount').value = '';
                setTimeout(() => {
                    this.uiManager.updateWalletDisplay();
                    this.uiManager.updateDecryptBalanceScreen();
                }, 1000);
            } else {
                throw new Error(result.error || 'Failed to decrypt balance');
            }
            
        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Failed to decrypt balance: ' + error.message, 'error');
        }
    }

    /**
     * Handle claim private transfers
     */
    async handleClaimTransfers() {
        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.uiManager.showMessage('No active wallet found', 'error');
                return;
            }

            this.uiManager.showLoading('Getting pending private transfers...');
            const pendingResult = await this.uiManager.wallet.network.getPendingPrivateTransfers(
                activeWallet.address,
                activeWallet.privateKey
            );

            if (!pendingResult.success) {
                this.uiManager.hideLoading();
                this.uiManager.showMessage('Failed to fetch pending transfers: ' + pendingResult.error, 'error');
                return;
            }

            const pendingTransfers = pendingResult.transfers || [];
            
            if (pendingTransfers.length === 0) {
                this.uiManager.hideLoading();
                this.uiManager.showMessage('No pending private transfers to claim', 'info');
                return;
            }

            let claimedCount = 0;
            let failedCount = 0;
            for (let i = 0; i < pendingTransfers.length; i++) {
                const transfer = pendingTransfers[i];
                this.uiManager.showLoading(`Claiming transfer ${i + 1} of ${pendingTransfers.length}...`);
                
                try {
                    const result = await this.uiManager.wallet.network.claimPrivateTransfer(
                        activeWallet.address,
                        activeWallet.privateKey,
                        transfer.id
                    );

                    if (result.success) {
                        claimedCount++;
                    } else {
                        failedCount++;
                    }
                } catch (transferError) {
                    failedCount++;
                }
            }

            this.uiManager.hideLoading();
            if (claimedCount > 0) {
                const message = failedCount > 0 
                    ? `Successfully claimed ${claimedCount} private transfer(s). ${failedCount} failed.`
                    : `Successfully claimed ${claimedCount} private transfer(s)!`;
                
                this.uiManager.showMessage(message, 'success');
                setTimeout(() => {
                    this.uiManager.updateWalletDisplay();
                    this.uiManager.updateClaimTransfersScreen();
                }, 1000);
            } else if (failedCount > 0) {
                this.uiManager.showMessage(`Failed to claim ${failedCount} private transfer(s)`, 'error');
            } else {
                this.uiManager.showMessage('No transfers processed', 'info');
            }

        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Failed to claim transfers: ' + error.message, 'error');
        }
    }

    /**
     * Refresh wallet balance
     */
    async refreshBalance() {
        try {
            this.uiManager.showLoading('Refreshing balance...');
            await this.uiManager.updateWalletDisplay();
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Balance refreshed', 'success');
        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Failed to refresh balance', 'error');
        }
    }

    /**
     * Refresh private balance
     */
    async refreshPrivateBalance() {
        try {
            this.uiManager.showLoading('Refreshing private balance...');
            await this.uiManager.updatePrivateSendScreen();
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Private balance refreshed', 'success');
        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Failed to refresh private balance', 'error');
        }
    }

    /**
     * Get wallet summary
     */
    async getWalletSummary() {
        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                return null;
            }

            const publicBalance = await this.uiManager.wallet.network.getBalance(activeWallet.address);
            const encryptedBalanceResult = await this.uiManager.wallet.network.getEncryptedBalance(
                activeWallet.address,
                activeWallet.privateKey
            );

            return {
                address: activeWallet.address,
                name: activeWallet.name,
                publicBalance: publicBalance.success ? publicBalance.balance : 0,
                encryptedBalance: encryptedBalanceResult.success ? encryptedBalanceResult.encrypted : 0,
                totalBalance: (publicBalance.success ? publicBalance.balance : 0) + 
                            (encryptedBalanceResult.success ? encryptedBalanceResult.encrypted : 0)
            };

        } catch (error) {
            return null;
        }
    }
}
window.WalletOperationsModule = WalletOperationsModule;