/**
 * Bulk Private Send Module
 * Handles bulk private transaction sending functionality with background processing
 */

class BulkPrivateSendModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.privateRecipients = [];
    }

    /**
     * Initialize bulk private send functionality
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for bulk private send
     */
    setupEventListeners() {
        this.addEventListenerSafe('bulk-private-send-btn-nav', 'click', () => this.showBulkPrivateSendScreen());
        this.addEventListenerSafe('bulk-private-send-back', 'click', () => this.uiManager.showScreen('main-screen'));
        this.addEventListenerSafe('add-private-recipient-btn', 'click', () => this.addPrivateRecipient());
        this.addEventListenerSafe('clear-all-private-btn', 'click', () => this.clearAllPrivateRecipients());
        this.addEventListenerSafe('send-bulk-private-btn', 'click', () => this.handleBulkPrivateSend());
        this.addEventListenerSafe('bulk-private-send-help', 'click', () => this.showBulkPrivateSendHelp());
        this.addEventListenerSafe('bulk-private-recipient-address', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addPrivateRecipient();
            }
        });
        this.addEventListenerSafe('bulk-private-recipient-amount', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addPrivateRecipient();
            }
        });
        this.addEventListenerSafe('bulk-private-recipient-address', 'input', () => this.uiManager.hideMessage());
        this.addEventListenerSafe('bulk-private-recipient-amount', 'input', () => this.uiManager.hideMessage());
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
     * Show bulk private send screen
     */
    showBulkPrivateSendScreen() {
        this.privateRecipients = [];
        this.uiManager.showScreen('bulk-private-send-screen');
        this.updateBulkPrivateDisplay();
    }

    /**
     * Add private recipient to the list
     */
    addPrivateRecipient() {
        const addressInput = document.getElementById('bulk-private-recipient-address');
        const amountInput = document.getElementById('bulk-private-recipient-amount');
        
        if (!addressInput || !amountInput) {
            return;
        }

        const address = addressInput.value.trim();
        const amount = parseFloat(amountInput.value.trim());
        if (!address) {
            this.uiManager.showMessage('Please enter a recipient address', 'error');
            return;
        }

        if (!this.uiManager.wallet.isValidAddress(address)) {
            this.uiManager.showMessage('Invalid address format', 'error');
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            this.uiManager.showMessage('Please enter a valid amount', 'error');
            return;
        }
        if (this.privateRecipients.some(r => r.address === address)) {
            this.uiManager.showMessage('Address already added', 'error');
            return;
        }
        this.privateRecipients = this.privateRecipients || [];
        this.privateRecipients.push({ address, amount });
        addressInput.value = '';
        amountInput.value = '';
        this.updateBulkPrivateDisplay();
        this.uiManager.showMessage(`Added recipient: ${address.substring(0, 20)}...`, 'success');
    }

    /**
     * Remove private recipient by index
     */
    removePrivateRecipient(index) {
        if (this.privateRecipients && index >= 0 && index < this.privateRecipients.length) {
            this.privateRecipients.splice(index, 1);
            this.updateBulkPrivateDisplay();
        }
    }

    /**
     * Clear all private recipients
     */
    clearAllPrivateRecipients() {
        this.privateRecipients = [];
        this.updateBulkPrivateDisplay();
        this.uiManager.showMessage('All recipients cleared', 'success');
    }

    /**
     * Initialize bulk private display with default values
     */
    initializeBulkPrivateDisplayDefaults() {
        const bulkPrivateEncryptedBalance = document.getElementById('bulk-private-encrypted-balance');
        if (bulkPrivateEncryptedBalance && !bulkPrivateEncryptedBalance.textContent.trim()) {
            bulkPrivateEncryptedBalance.textContent = '0.00 OCT';
        }
    }

    /**
     * Format estimated time for display
     */
    formatEstimatedTime(seconds) {
        if (seconds === 0) return '0 seconds';
        if (seconds < 60) return `${seconds} seconds`;
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (remainingSeconds === 0) {
            return minutes === 1 ? '1 minute' : `${minutes} minutes`;
        } else {
            return `${minutes}m ${remainingSeconds}s`;
        }
    }

    /**
     * Update time estimate display based on current recipient count
     */
    updateTimeEstimate() {
        const timeEstimateEl = document.getElementById('bulk-private-time-estimate');
        if (!timeEstimateEl) return;
        
        const recipientCount = this.privateRecipients ? this.privateRecipients.length : 0;
        const estimatedTimeSeconds = recipientCount > 1 ? (recipientCount - 1) * 10 : 0;
        const estimatedTimeText = this.formatEstimatedTime(estimatedTimeSeconds);
        
        timeEstimateEl.textContent = estimatedTimeText;
        if (estimatedTimeSeconds > 30) {
            timeEstimateEl.style.color = 'rgba(255,193,7,0.8)';
        } else {
            timeEstimateEl.style.color = 'rgba(255,255,255,0.7)';
        }
    }

    /**
     * Update bulk private transfer display
     */
    async updateBulkPrivateDisplay() {        
        if (!this.privateRecipients) {
            this.privateRecipients = [];
        }

        this.initializeBulkPrivateDisplayDefaults();

        const recipientsList = document.getElementById('private-recipients-list');
        const recipientCount = document.getElementById('private-recipient-count');
        const bulkPrivateRecipientCount = document.getElementById('bulk-private-recipient-count');

        if (recipientsList && recipientCount && bulkPrivateRecipientCount) {
            recipientCount.textContent = this.privateRecipients.length;
            bulkPrivateRecipientCount.textContent = this.privateRecipients.length;
            this.updateTimeEstimate();

            if (this.privateRecipients.length === 0) {
                recipientsList.innerHTML = '<div id="empty-private-recipients" style="text-align: center; color: rgba(255,255,255,0.6); padding: var(--space-lg);">No recipients added yet</div>';
            } else {
                const recipientsHtml = this.privateRecipients.map((recipient, index) => {
                    return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-xs); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); margin-bottom: var(--space-xs);">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: var(--font-size-xs); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis;">
                                ${recipient.address}
                            </div>
                            <div style="font-size: var(--font-size-xs); color: var(--text-muted);">
                                ${recipient.amount.toFixed(2)} OCT
                            </div>
                        </div>
                        <button class="bps-remove-btn" data-index="${index}" style="background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); border-radius: var(--radius-sm); padding: 4px 8px; color: #ef4444; font-size: var(--font-size-xs); cursor: pointer;" title="Remove recipient">
                            ×
                        </button>
                    </div>
                `;
                }).join('');
                
                recipientsList.innerHTML = recipientsHtml;
                document.querySelectorAll('.bps-remove-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const index = parseInt(e.target.getAttribute('data-index'));
                        if (!isNaN(index)) this.removePrivateRecipient(index);
                    });
                });
            }
        }
        const totalAmount = this.privateRecipients.reduce((sum, r) => sum + r.amount, 0);
        
        const totalAmountEl = document.getElementById('bulk-private-total-amount');
        const sendBtn = document.getElementById('send-bulk-private-btn');

        if (totalAmountEl) {
            totalAmountEl.textContent = `${totalAmount.toFixed(2)} OCT`;
        }

        if (sendBtn) {
            sendBtn.disabled = this.privateRecipients.length === 0;
        }
        this.updateEncryptedBalanceAsync();
    }

    /**
     * Update encrypted balance asynchronously
     */
    async updateEncryptedBalanceAsync() {
        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (activeWallet && this.uiManager.wallet && this.uiManager.wallet.network) {
                const encryptedBalanceResult = await this.uiManager.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );
                
                const encryptedBalanceEl = document.getElementById('bulk-private-encrypted-balance');
                if (encryptedBalanceEl) {
                    if (encryptedBalanceResult && encryptedBalanceResult.success) {
                        const encryptedAmount = encryptedBalanceResult.encrypted || 0;
                        encryptedBalanceEl.textContent = `${encryptedAmount.toFixed(2)} OCT`;
                    } else {
                        encryptedBalanceEl.textContent = '0.00 OCT';
                    }
                }
            } else {
                const encryptedBalanceEl = document.getElementById('bulk-private-encrypted-balance');
                if (encryptedBalanceEl) {
                    encryptedBalanceEl.textContent = '0.00 OCT';
                }
            }
        } catch (error) {
            const encryptedBalanceEl = document.getElementById('bulk-private-encrypted-balance');
            if (encryptedBalanceEl) {
                encryptedBalanceEl.textContent = '0.00 OCT';
            }
        }
    }

    /**
     * Send multiple private transfers sequentially (like bulk claim)
     */
    async sendMultiplePrivateTransfersSequential(recipients) {
        const results = { success: [], failed: [], pending: [] };
        
        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            const remainingTransfers = recipients.length - i - 1;
            const remainingTimeSeconds = remainingTransfers * 10;
            const remainingTimeText = remainingTimeSeconds > 0 ? ` (Est. ${this.formatEstimatedTime(remainingTimeSeconds)} remaining)` : '';
            
            this.uiManager.showLoading(`Processing transfer ${i + 1}/${recipients.length}: ${recipient.address.substring(0, 20)}... (${recipient.amount} OCT) ${remainingTimeText}`);
            
            try {
                this.uiManager.showLoading(`Transfer ${i + 1}/${recipients.length} - Step 1/3: Getting public key for ${recipient.address.substring(0, 20)}...`);
                const publicKeyResult = await this.uiManager.wallet.network.getPublicKey(recipient.address);
                
                if (!publicKeyResult || !publicKeyResult.success || !publicKeyResult.publicKey) {
                    const errorMsg = `${recipient.address}: Public key not found. Recipient needs to have sent at least one transaction.`;
                    results.failed.push(errorMsg);
                    continue;
                }
                
                const walletManager = this.uiManager.getWalletManager();
                const activeWallet = walletManager?.getActiveWallet();
                this.uiManager.showLoading(`Transfer ${i + 1}/${recipients.length} - Step 2/3: Checking encrypted balance for ${recipient.address.substring(0, 20)}...`);
                const encBalanceResult = await this.uiManager.wallet.network.getEncryptedBalance(
                    activeWallet.address, 
                    activeWallet.privateKey
                );

                if (!encBalanceResult.success) {
                    const errorMsg = `${recipient.address}: Failed to get encrypted balance - ${encBalanceResult.error}`;
                    results.failed.push(errorMsg);
                    continue;
                }

                const availableEncrypted = encBalanceResult.encrypted || 0;
                if (availableEncrypted < recipient.amount) {
                    const errorMsg = `${recipient.address}: Insufficient encrypted balance. Have ${availableEncrypted.toFixed(2)} OCT, need ${recipient.amount} OCT`;
                    results.failed.push(errorMsg);
                    continue;
                }
                this.uiManager.showLoading(`Transfer ${i + 1}/${recipients.length} - Step 3/3: Sending ${recipient.amount} OCT to ${recipient.address.substring(0, 20)}...`);
                const amountRaw = Math.trunc(recipient.amount * 1000000).toString();
                
                const transferResult = await this.uiManager.wallet.network.createPrivateTransfer(
                    activeWallet.address,
                    recipient.address,
                    amountRaw,
                    activeWallet.privateKey,
                    publicKeyResult.publicKey
                );
                                
                let transferSuccess = false;
                
                if (transferResult && transferResult.success) {
                    const successMsg = `${recipient.address}: ${recipient.amount} OCT - Success`;
                    results.success.push(successMsg);
                    transferSuccess = true;
                } else {
                    const errorMsg = `${recipient.address}: ${transferResult?.error || 'Transfer failed'}`;
                    results.failed.push(errorMsg);
                }
                if (transferSuccess && i < recipients.length - 1) {
                    const nextRecipient = recipients[i + 1];
                    const txHash = transferResult.tx_hash || 
                                 transferResult.transaction_hash || 
                                 transferResult.hash ||
                                 transferResult.result?.tx_hash ||
                                 transferResult.result?.transaction_hash ||
                                 transferResult.result?.hash ||
                                 transferResult.result?.txHash;
                    
                    if (txHash) {
                        await this.waitForConfirmationAndEpochAdvancement(txHash, nextRecipient);
                    } else {
                        this.uiManager.showLoading(`Transfer ${i + 1} completed! Waiting 10 seconds before next transfer to prevent duplicates... (${recipients.length - i - 1} transfers remaining)`);
                        for (let countdown = 10; countdown > 0; countdown--) {
                            this.uiManager.showLoading(`Transfer ${i + 1} completed! Waiting ${countdown}s before next transfer to prevent duplicates... (${recipients.length - i - 1} transfers remaining)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
            } catch (error) {
                const errorMsg = `${recipient.address}: ${error.message}`;
                results.failed.push(errorMsg);
            }
        }
        
        return results;
    }

    /**
     * Handle bulk private send with sequential processing
     */
    async handleBulkPrivateSend() {
        if (this.privateRecipients && this.privateRecipients.length > 0) {
            this.privateRecipients.forEach((recipient, index) => {
            });
        }
        
        if (!this.privateRecipients || this.privateRecipients.length === 0) {
            this.uiManager.showMessage('Please add at least one recipient', 'error');
            return;
        }

        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (!activeWallet) {
                this.uiManager.showMessage('No active wallet found', 'error');
                return;
            }
            
            const totalAmount = this.privateRecipients.reduce((sum, r) => sum + r.amount, 0);
            this.uiManager.showLoading(`Preparing bulk private transfers... (${this.privateRecipients.length} recipients, ${totalAmount.toFixed(2)} OCT total)`);
            const recipientCount = this.privateRecipients.length;
            const avgDelaySeconds = 10;
            const estimatedTimeSeconds = recipientCount > 1 ? (recipientCount - 1) * avgDelaySeconds : 0;
            const estimatedTimeText = this.formatEstimatedTime(estimatedTimeSeconds);
            if (recipientCount > 1) {
                this.uiManager.showLoading(`Processing ${recipientCount} private transfers sequentially... Est. time: ${estimatedTimeText} (each waits for blockchain confirmation)`);
            } else {
                this.uiManager.showLoading('Processing private transfer... (waiting for blockchain confirmation)');
            }
            const results = await this.sendMultiplePrivateTransfersSequential(this.privateRecipients);
            
            this.uiManager.hideLoading();
            const successCount = results.success.length;
            const failedCount = results.failed.length;

            let message = `
                <div style="font-family: monospace; line-height: 1.4; background: rgba(255, 255, 255, 0.1); padding: 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2);">
                    <h3 style="margin: 0 0 10px 0; color: white;">Bulk Private Transfer Results</h3>
                    <p style="margin: 0 0 15px 0; color: white;">
                        ${successCount} success, ${failedCount} failed
                    </p>`;

            if (results.success.length > 0) {
                message += '<div style="margin-bottom: 15px;"><strong style="color: white;">Successful:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
                results.success.forEach(msg => {
                    const shortAddr = msg.split(':')[0].substring(0, 20) + '...';
                    const amount = msg.match(/(\d+\.?\d*) OCT/)?.[1] || '';
                    const isRetry = msg.includes('retry');
                    const retryInfo = isRetry ? ' <span style="color: #ffc107; font-size: 11px;">(retried)</span>' : '';
                    message += `<li style="color: white; margin: 2px 0;">${shortAddr}: ${amount} OCT${retryInfo}</li>`;
                });
                message += '</ul></div>';
            }

            if (results.failed.length > 0) {
                message += '<div><strong style="color: white;">Failed:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
                results.failed.forEach(msg => {
                    const parts = msg.split(':');
                    const shortAddr = parts[0].substring(0, 20) + '...';
                    const error = parts.slice(1).join(':').trim();
                    message += `<li style="color: white; margin: 2px 0;">${shortAddr}: <span style="color: #ff6b6b;">${error}</span></li>`;
                });
                message += '</ul></div>';
            }

            message += '</div>';
            if (failedCount === 0 && successCount > 0) {
                this.privateRecipients = [];
                this.updateBulkPrivateDisplay();
            } else {
            }
            const messageType = 'info';
            this.uiManager.showMessage(message, messageType);

        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Bulk private transfer failed: ' + error.message, 'error');
        }
    }

    /**
     * Wait for transaction confirmation and epoch advancement before next transfer
     * @param {string} txHash
     * @param {Object} nextRecipient
     */
    async waitForConfirmationAndEpochAdvancement(txHash, nextRecipient) {
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();
        
        let currentEpoch = null;
        let isConfirmed = false;
        
        while ((Date.now() - startTime) < maxWaitTime) {
            try {
                const txData = await this.uiManager.wallet.network.getTransaction(txHash);
                
                if (txData) {
                    if (txData.status === 'confirmed') {
                        if (!isConfirmed) {
                            isConfirmed = true;
                            currentEpoch = txData.epoch;                            
                            const elapsedTime = Math.round((Date.now() - startTime) / 1000);
                            this.uiManager.showLoading(`Transaction confirmed in ${elapsedTime}s! Waiting for epoch advancement before next transfer...`);
                        }
                        const networkStatus = await this.uiManager.wallet.network.getNetworkStatus();
                        if (networkStatus && networkStatus.epoch > currentEpoch) {
                            const totalElapsed = Math.round((Date.now() - startTime) / 1000);
                            this.uiManager.showLoading(`Epoch advanced! Proceeding to next transfer: ${nextRecipient.address.substring(0, 20)}...`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            return;
                        }
                    }
                } else {
                }
                
            } catch (error) {
            }
            const elapsedTime = Math.round((Date.now() - startTime) / 1000);
            
            if (!isConfirmed) {
                this.uiManager.showLoading(`Waiting for transaction confirmation (${elapsedTime}s elapsed)...`);
            } else {
                this.uiManager.showLoading(`Waiting for epoch advancement (${elapsedTime}s, epoch: ${currentEpoch})...`);
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        const totalWaitTime = Math.round((Date.now() - startTime) / 1000);
        if (isConfirmed) {
            this.uiManager.showLoading(`Timeout waiting for epoch advancement. Proceeding anyway after ${totalWaitTime}s...`);
        } else {
            this.uiManager.showLoading(`Transaction not confirmed after ${totalWaitTime}s. Proceeding to next transfer...`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * Show bulk private send help
     */
    showBulkPrivateSendHelp() {
        const helpMessage = `
Bulk Private Transfer Help:

Private transfers use your encrypted balance and are sent privately on the blockchain.

Steps:
1. Enter recipient address and amount
2. Click "Add Recipient" to add to list
3. Repeat for all recipients
4. Click "Send All Private" to process

Important:
- Recipients must have sent at least one transaction to receive private transfers
- Funds are sent from your encrypted balance
- Transactions are processed sequentially one after another
- Failed transactions are not automatically retried - use manual retry if needed
- All transfers complete before showing final results
        `;
        
        this.uiManager.showMessage(helpMessage, 'info');
    }
}
window.BulkPrivateSendModule = BulkPrivateSendModule;