/**
 * Bulk Send Module
 * Handles bulk transaction sending functionality
 */

class BulkSendModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.recipients = [];
    }

    /**
     * Initialize bulk send functionality
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for bulk send
     */
    setupEventListeners() {
        this.addEventListenerSafe('bulk-send-btn', 'click', () => this.showBulkSendScreen());
        this.addEventListenerSafe('bulk-send-back', 'click', () => this.uiManager.showScreen('main-screen'));
        this.addEventListenerSafe('add-recipient-btn', 'click', (e) => {
            e.preventDefault();
            this.addRecipient();
        });
        this.addEventListenerSafe('clear-all-btn', 'click', () => this.clearAllRecipients());
        this.addEventListenerSafe('send-bulk-btn', 'click', () => this.handleBulkSend());
        this.addEventListenerSafe('bulk-send-help', 'click', () => this.showBulkSendHelp());
        this.addEventListenerSafe('bulk-recipient-address', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addRecipient();
            }
        });
        this.addEventListenerSafe('bulk-recipient-amount', 'keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addRecipient();
            }
        });
        this.addEventListenerSafe('bulk-recipient-address', 'input', () => this.uiManager.hideMessage());
        this.addEventListenerSafe('bulk-recipient-amount', 'input', () => this.uiManager.hideMessage());
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
     * Show bulk send screen
     */
    showBulkSendScreen() {
        this.recipients = [];
        this.uiManager.showScreen('bulk-send-screen');
        this.updateBulkDisplay();
    }

    /**
     * Add recipient to bulk send list
     */
    addRecipient() {
        const addressInput = document.getElementById('bulk-recipient-address');
        const amountInput = document.getElementById('bulk-recipient-amount');
        
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
        if (this.recipients.some(r => r.address === address)) {
            this.uiManager.showMessage('Address already added', 'error');
            return;
        }
        const randomBytes = new Uint8Array(4);
        crypto.getRandomValues(randomBytes);
        const randomNum = Array.from(randomBytes).reduce((acc, byte) => acc * 256 + byte, 0);
        const recipientId = Date.now() + randomNum;
        this.recipients.push({ id: recipientId, address, amount });
        addressInput.value = '';
        amountInput.value = '';
        this.updateBulkDisplay();
        this.uiManager.showMessage(`Added recipient: ${address.substring(0, 20)}...`, 'success');
    }

    /**
     * Remove recipient by ID
     */
    removeRecipient(recipientId) {
        this.recipients = this.recipients.filter(r => r.id !== recipientId);
        this.updateBulkDisplay();
    }

    /**
     * Clear all recipients
     */
    clearAllRecipients() {
        this.recipients = [];
        this.updateBulkDisplay();
        this.uiManager.showMessage('All recipients cleared', 'success');
    }

    /**
     * Update bulk display UI
     */
    updateBulkDisplay() {
        const recipientsListEl = document.getElementById('recipients-list');
        const recipientCountEl = document.getElementById('recipient-count');
        const totalAmountEl = document.getElementById('total-amount');
        const sendBtn = document.getElementById('send-bulk-btn');
        const bulkSendBalanceEl = document.getElementById('bulk-send-balance');
        const bulkTotalAmountEl = document.getElementById('bulk-total-amount');
        const bulkRecipientsCountEl = document.getElementById('bulk-recipients-count');

        if (!recipientsListEl || !recipientCountEl) return;
        if (bulkSendBalanceEl && this.uiManager.wallet) {
            this.uiManager.wallet.getBalanceAndNonce().then(result => {
                if (result.balance !== null) {
                    bulkSendBalanceEl.textContent = `${result.balance.toFixed(2)} OCT`;
                } else {
                    bulkSendBalanceEl.textContent = '-- OCT';
                }
            }).catch(() => {
                bulkSendBalanceEl.textContent = '-- OCT';
            });
        }
        recipientCountEl.textContent = this.recipients.length;
        if (this.recipients.length === 0) {
            recipientsListEl.innerHTML = '<div id="empty-recipients" style="text-align: center; color: var(--text-muted); padding: var(--space-lg);">No recipients added yet</div>';
        } else {
            const recipientsHtml = this.recipients.map((recipient) => {
                return `
                    <div class="recipient-item" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-xs); border: 1px solid var(--glass-bg); border-radius: var(--radius-sm); margin-bottom: var(--space-xs);">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: var(--font-size-xs); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis;">
                                ${recipient.address}
                            </div>
                            <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 2px;">
                                ${recipient.amount.toFixed(2)} OCT
                            </div>
                        </div>
                        <button class="remove-recipient-btn" data-recipient-id="${recipient.id}" style="background: var(--remove-btn-bg); border: 1px solid var(--remove-btn-border); border-radius: var(--radius-sm); padding: 4px 8px; color: var(--error-color); font-size: var(--font-size-xs); cursor: pointer;" title="Remove recipient">
                            ×
                        </button>
                    </div>
                `;
            }).join('');

            recipientsListEl.innerHTML = recipientsHtml;
            const removeButtons = recipientsListEl.querySelectorAll('.remove-recipient-btn');
            removeButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const recipientId = parseFloat(e.target.getAttribute('data-recipient-id'));
                    this.removeRecipient(recipientId);
                });
            });
        }
        const totalAmount = this.recipients.reduce((sum, r) => sum + r.amount, 0);
        if (totalAmountEl) {
            totalAmountEl.textContent = `${totalAmount.toFixed(2)} OCT`;
        }
        if (bulkTotalAmountEl) {
            bulkTotalAmountEl.textContent = `${totalAmount.toFixed(2)} OCT`;
        }
        if (bulkRecipientsCountEl) {
            bulkRecipientsCountEl.textContent = this.recipients.length;
        }
        if (sendBtn) {
            sendBtn.disabled = this.recipients.length === 0;
        }
    }

    /**
     * Handle bulk send
     */
    async handleBulkSend() {
        if (this.recipients.length === 0) {
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

            this.uiManager.showLoading('Processing bulk transfers...');
            const results = await this.uiManager.wallet.sendMultipleTransactions(this.recipients);
            
            this.uiManager.hideLoading();
            const successCount = results.success.length;
            const failedCount = results.failed.length;

            let message = `Results: ${successCount} success, ${failedCount} failed\n\n`;

            if (results.success.length > 0) {
                message += 'Successful:\n';
                results.success.forEach(msg => {
                    const shortAddr = msg.split(':')[0].substring(0, 20) + '...';
                    const amount = msg.match(/(\d+\.?\d*) OCT/)?.[1] || '';
                    message += `• ${shortAddr}: ${amount} OCT\n`;
                });
                message += '\n';
            }

            if (results.failed.length > 0) {
                message += 'Failed:\n';
                results.failed.forEach(msg => {
                    const parts = msg.split(':');
                    const shortAddr = parts[0].substring(0, 20) + '...';
                    const error = parts.slice(1).join(':').trim();
                    message += `• ${shortAddr}: ${error}\n`;
                });
            }
            if (failedCount === 0) {
                this.recipients = [];
                this.updateBulkDisplay();
            }
            const messageType = failedCount === 0 ? 'success' : (successCount === 0 ? 'error' : 'warning');
            this.uiManager.showMessage(message, messageType);

        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Bulk transfer failed: ' + error.message, 'error');
        }
    }

    /**
     * Show bulk send help
     */
    showBulkSendHelp() {
        const helpText = `
        <div class="bulk-help-content">
            <h3>Bulk Send Guide</h3>

            <div class="help-section">
                <h4>Quick Steps:</h4>
                <ol>
                    <li>Enter address (oct...) and amount</li>
                    <li>Click "Add Recipient"</li>
                    <li>Repeat for all recipients</li>
                    <li>Click "Send All" to execute</li>
                </ol>
            </div>

            <div class="help-section">
                <h4>Key Info:</h4>
                <ul>
                    <li>Processes 5 transactions at a time</li>
                    <li>Failed transactions won't affect others</li>
                </ul>
            </div>
        </div>
        `;

        this.uiManager.showMessage(helpText, 'info');
    }
}
window.BulkSendModule = BulkSendModule;