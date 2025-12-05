/**
 * Transaction History Module
 * Handles transaction tracking and background processing communication
 */

class TransactionHistoryModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.transactionListeners = new Set();
        this.cachePrefix = 'tx_history_';
        this.maxCacheAge = 24 * 60 * 60 * 1000;
        this.lastWalletAddress = null;
        this.cachedTransactions = new Map();
    }

    /**
     * Initialize transaction history functionality
     */
    init() {
        this.setupEventListeners();
        this.listenForTransactionUpdates();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        this.addEventListenerSafe('refresh-tx-history-btn', 'click', () => this.refreshTransactionHistory());
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
     * Listen for transaction status updates from background
     */
    listenForTransactionUpdates() {
        if (chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((message) => {
                if (message.type === 'TRANSACTION_STATUS_UPDATE') {
                    this.handleTransactionStatusUpdate(message.data);
                } else if (message.type === 'BACKGROUND_RETRY_ATTEMPT') {
                    this.handleRetryAttempt(message.data);
                }
            });
        }
    }

    /**
     * Handle transaction status update from background
     */
    handleTransactionStatusUpdate(data) {
        const { txId, status, transaction } = data;
        const currentWallet = this.uiManager?.getWalletManager()?.getActiveWallet();
        if (!currentWallet || !transaction) {
            return;
        }
        const currentAddress = currentWallet.address;
        const transactionFromAddress = transaction.from || transaction.sender;
        
        if (transactionFromAddress !== currentAddress) {
            return;
        }
        this.transactionListeners.forEach(listener => {
            if (typeof listener === 'function') {
                listener({ type: 'status_update', txId, status, transaction });
            }
        });
        if (status === 'success') {
            this.uiManager.showMessage(
                `Transaction completed: ${(transaction.to || '').substring(0, 20)}... (${transaction.amount} OCT)`,
                'success'
            );
        } else if (status === 'failed') {
            this.uiManager.showMessage(
                `Transaction failed: ${(transaction.to || '').substring(0, 20)}... - ${transaction.lastError}`,
                'error'
            );
        }
    }

    /**
     * Handle retry attempt notification
     */
    handleRetryAttempt(data) {
        const { address, amount, attempt } = data;
        if (attempt <= 2) {
            this.uiManager.showMessage(
                `Retrying transaction to ${address.substring(0, 20)}... (attempt ${attempt})`,
                'warning'
            );
        }
    }

    /**
     * Add transaction status listener
     */
    addTransactionListener(listener) {
        this.transactionListeners.add(listener);
    }

    /**
     * Remove transaction status listener
     */
    removeTransactionListener(listener) {
        this.transactionListeners.delete(listener);
    }

    /**
     * Get pending transactions for current wallet
     */
    async getPendingTransactions() {
        const currentWallet = this.uiManager?.getWalletManager()?.getActiveWallet();
        const currentAddress = currentWallet?.address;
        
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'TRANSACTION',
                action: 'GET_PENDING_TRANSACTIONS',
                data: { walletAddress: currentAddress }
            }, (response) => {
                if (response && response.success && response.transactions) {
                    const filteredTransactions = response.transactions.filter(tx => {
                        return tx.from === currentAddress || tx.sender === currentAddress;
                    });
                    resolve(filteredTransactions);
                } else {
                    resolve([]);
                }
            });
        });
    }

    /**
     * Get transaction history for current wallet
     */
    async getTransactionHistory() {
        const currentWallet = this.uiManager?.getWalletManager()?.getActiveWallet();
        const currentAddress = currentWallet?.address;
        
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'TRANSACTION',
                action: 'GET_TRANSACTION_HISTORY',
                data: { walletAddress: currentAddress }
            }, (response) => {
                if (response && response.success && response.history) {
                    const filteredHistory = response.history.filter(tx => {
                        return tx.from === currentAddress || tx.sender === currentAddress;
                    });
                    resolve(filteredHistory);
                } else {
                    resolve([]);
                }
            });
        });
    }

    /**
     * Cancel transaction
     */
    async cancelTransaction(txId) {
        try {
            
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'TRANSACTION',
                    action: 'CANCEL_TRANSACTION',
                    data: { txId }
                }, resolve);
            });
            
            
            if (response && response.success) {
                if (this.uiManager) {
                    this.uiManager.showMessage('Transaction cancelled successfully', 'success');
                }
                await this.refreshTransactionHistory();
                
            } else {
                this.updateTransactionStatusInUI(txId, 'cancelled');
                
                if (this.uiManager) {
                    this.uiManager.showMessage('Transaction cancelled (UI updated)', 'success');
                }
            }
            
        } catch (error) {
            if (this.uiManager) {
                this.uiManager.showMessage('Failed to cancel transaction', 'error');
            }
        }
    }

    /**
     * Update transaction status in UI only (for sequential transactions)
     */
    updateTransactionStatusInUI(txId, newStatus) {
        try {
            const transactionElements = document.querySelectorAll('.transaction-item');
            
            transactionElements.forEach(element => {
                const cancelBtn = element.querySelector('.th-cancel-btn');
                const detailsBtn = element.querySelector('.th-details-btn');
                
                if (cancelBtn && cancelBtn.getAttribute('data-tx-id') === txId) {
                    const statusElement = element.querySelector('.transaction-status');
                    if (statusElement) {
                        statusElement.textContent = '× Cancelled';
                        statusElement.style.color = 'var(--error-color)';
                    }
                    cancelBtn.remove();
                    
                }
            });
            
        } catch (error) {
        }
    }

    /**
     * Refresh transaction history display
     */
    async refreshTransactionHistory() {
        try {
            
            const walletManager = this.uiManager?.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            
            if (activeWallet) {
                await this.getEnhancedTransactionHistory(activeWallet.address);
            }
            
        } catch (error) {
        }
    }

    /**
     * Get cache key for specific wallet address
     */
    getCacheKey(walletAddress) {
        if (!walletAddress || typeof walletAddress !== 'string') {
            throw new Error('Invalid wallet address for cache key');
        }
        const cleanAddress = walletAddress.trim().toLowerCase();
        return `${this.cachePrefix}${cleanAddress}_v1`;
    }

    /**
     * Load cached transaction history from local storage
     */
    async loadCachedTransactions(walletAddress) {
        try {
            const cacheKey = this.getCacheKey(walletAddress);
            const result = await new Promise((resolve) => {
                chrome.storage.local.get([cacheKey], resolve);
            });
            
            const cached = result[cacheKey];
            if (!cached || typeof cached !== 'object') {
                return { transactions: [], lastFetchTime: 0 };
            }
            if (!Array.isArray(cached.transactions) || cached.version !== 2) {
                return { transactions: [], lastFetchTime: 0 };
            }
            const cacheAge = Date.now() - (cached.timestamp || 0);
            if (cacheAge > this.maxCacheAge) {
                return { transactions: [], lastFetchTime: 0 };
            }
            const reprocessedTransactions = cached.transactions
                .filter(tx => tx && typeof tx === 'object')
                .map(tx => {
                    const timestamp = tx.createdAt || tx.updatedAt || tx.completedAt || tx.timestamp || tx.time;
                    if (timestamp) {
                        tx.displayTime = this.formatTime(timestamp);
                        tx.relativeTime = this.getRelativeTime(timestamp);
                        tx.cleanTimestamp = this.parseTimestamp(timestamp);
                    }
                    return tx;
                });
                
            return {
                transactions: reprocessedTransactions,
                lastFetchTime: cached.lastFetchTime || 0
            };
        } catch (error) {
            return { transactions: [], lastFetchTime: 0 };
        }
    }

    /**
     * Save transaction history to local storage
     */
    async saveCachedTransactions(walletAddress, transactions) {
        try {
            const cacheKey = this.getCacheKey(walletAddress);
            const cacheData = {
                transactions: transactions,
                timestamp: Date.now(),
                lastFetchTime: Date.now(),
                version: 2
            };
            
            await new Promise((resolve) => {
                chrome.storage.local.set({ [cacheKey]: cacheData }, resolve);
            });
        } catch (error) {
        }
    }

    /**
     * Merge cached and new transactions, removing duplicates
     */
    mergeTransactions(cachedTransactions, newTransactions) {
        const combined = [...cachedTransactions, ...newTransactions];
        const seen = new Set();
        const unique = combined.filter(tx => {
            const timestamp = tx.timestamp || tx.createdAt || tx.updatedAt || tx.completedAt || Date.now();
            const from = tx.from || tx.sender || 'unknown';
            const to = tx.to || tx.receiver || tx.recipient || 'unknown';
            const amount = tx.amount || tx.value || 0;
            
            const key = tx.hash || tx.txHash || tx.id || `${from}_${to}_${amount}_${timestamp}`;
            
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
        return unique.sort((a, b) => {
            const timeA = this.parseTimestamp(a.timestamp || a.createdAt || a.updatedAt || a.completedAt);
            const timeB = this.parseTimestamp(b.timestamp || b.createdAt || b.updatedAt || b.completedAt);
            return timeB - timeA;
        });
    }

    /**
     * Clear failed and old transactions from storage
     */
    async clearFailedTransactions(walletAddress) {
        try {
            const cached = await this.loadCachedTransactions(walletAddress);
            const currentTime = Date.now();
            const oneWeekAgo = currentTime - (7 * 24 * 60 * 60 * 1000);
            const cleanTransactions = cached.transactions.filter(tx => {
                if (tx.status === 'completed' || tx.status === 'confirmed' || tx.hash) {
                    return true;
                }
                if (tx.status === 'failed' || tx.status === 'error') {
                    const txTime = this.parseTimestamp(tx.timestamp || tx.createdAt || tx.updatedAt);
                    if (txTime < oneWeekAgo) {
                        return false;
                    }
                }
                return true;
            });
            
            const removedCount = cached.transactions.length - cleanTransactions.length;
            if (removedCount > 0) {
                await this.saveCachedTransactions(walletAddress, cleanTransactions);
                return removedCount;
            }
            
            return 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Verify and update successful transactions
     */
    async verifySuccessfulTransactions(walletAddress) {
        try {
            const cached = await this.loadCachedTransactions(walletAddress);
            let updatedCount = 0;
            const updatedTransactions = await Promise.all(
                cached.transactions.map(async (tx) => {
                    if (tx.status === 'pending' || tx.status === 'processing') {
                        if (tx.hash && this.uiManager.wallet && this.uiManager.wallet.network) {
                            try {
                                const blockchainTx = await this.uiManager.wallet.network.getTransactionDetails(tx.hash);
                                if (blockchainTx && blockchainTx.confirmed) {
                                    tx.status = 'completed';
                                    tx.completedAt = Date.now();
                                    updatedCount++;
                                }
                            } catch (error) {
                            }
                        }
                    }
                    return tx;
                })
            );
            
            if (updatedCount > 0) {
                await this.saveCachedTransactions(walletAddress, updatedTransactions);
            }
            
            return updatedCount;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Show enhanced transaction history with grouping and detailed information
     */
    async showTransactionHistory() {
        try {
            this.uiManager.showLoading('Loading cached transactions...');
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            const currentAddress = activeWallet?.address || '';

            if (!currentAddress) {
                throw new Error('No active wallet address found');
            }
            if (this.lastWalletAddress && this.lastWalletAddress !== currentAddress) {
                this.cachedTransactions = new Map();
                this.transactionListeners.clear();
                const targetContainer = document.getElementById('transactions-list');
                if (targetContainer) {
                    targetContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin: 20px 0;">🔄 Loading transactions for new wallet...</div>';
                }
                
            }
            this.lastWalletAddress = currentAddress;
            const cached = await this.loadCachedTransactions(currentAddress);
            const clearedCount = await this.clearFailedTransactions(currentAddress);
            const verifiedCount = await this.verifySuccessfulTransactions(currentAddress);
            
            if (clearedCount > 0 || verifiedCount > 0) {
                const updatedCached = await this.loadCachedTransactions(currentAddress);
                cached.transactions = updatedCached.transactions;
            }
            const pending = await this.getPendingTransactions();
            const backgroundHistory = await this.getTransactionHistory();
            if (cached.transactions.length > 0) {
                this.uiManager.showLoading('Loading new transactions...');
                const cachedHistory = [
                    ...backgroundHistory,
                    ...cached.transactions
                ];
                
                await this.displayTransactions(cachedHistory, pending, currentAddress);
            }
            let newBlockchainHistory = [];
            try {
                if (this.uiManager.wallet && this.uiManager.wallet.isReady()) {
                    const timeoutDuration = cached.transactions.length === 0 ? 20000 : 10000;
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Blockchain history fetch timeout')), timeoutDuration);
                    });
                    const historyPromise = this.uiManager.wallet.getTransactionHistory(true);
                    
                    newBlockchainHistory = await Promise.race([historyPromise, timeoutPromise]);
                }
            } catch (error) {
                newBlockchainHistory = [];
            }
            const allBlockchainHistory = this.mergeTransactions(cached.transactions, newBlockchainHistory);
            if (newBlockchainHistory.length > 0 || cached.transactions.length === 0) {
                await this.saveCachedTransactions(currentAddress, allBlockchainHistory);
            }
            const history = [
                ...backgroundHistory,
                ...allBlockchainHistory
            ];
            if (newBlockchainHistory.length > 0 || cached.transactions.length === 0) {
                await this.displayTransactions(history, pending, currentAddress);
            } else {
                this.uiManager.hideLoading();
            }
            
        } catch (error) {
            this.uiManager.hideLoading();
            this.uiManager.showMessage('Failed to load transaction history', 'error');
        }
    }

    /**
     * Display transactions in the UI
     */
    async displayTransactions(history, pending, currentAddress) {
        try {
            this.uiManager.hideLoading();
            const enhancedPending = pending.map(tx => this.enhanceTransaction(tx, 'pending', currentAddress));
            const enhancedHistory = history.map(tx => this.enhanceTransaction(tx, 'completed', currentAddress));
            const allTransactions = [...enhancedPending, ...enhancedHistory].sort((a, b) => {
                const timeA = a.cleanTimestamp || 0;
                const timeB = b.cleanTimestamp || 0;
                return timeB - timeA;
            });

            let content = `
                <div style="font-family: monospace; line-height: 1.4; max-height: 500px; overflow-y: auto;">`;
            if (allTransactions.length === 0) {
                content += '<div style="text-align: center; color: var(--text-muted); margin: 20px 0;">No transactions found</div>';
            } else {
                allTransactions.forEach(tx => {
                    content += this.renderDetailedTransaction(tx);
                });
            }

            content += '</div>';
            const targetContainer = document.getElementById('transactions-list');
            
            if (targetContainer) {
                targetContainer.innerHTML = content;
                document.querySelectorAll('.th-cancel-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const txId = e.target.getAttribute('data-tx-id');
                        if (txId) {
                            showConfirmDialog(
                                'Cancel Transaction',
                                'Are you sure you want to cancel this transaction?',
                                'Cancel Transaction',
                                'Keep Transaction'
                            ).then(confirmed => {
                                if (confirmed) {
                                    this.cancelTransaction(txId);
                                }
                            });
                        }
                    });
                });
                
                document.querySelectorAll('.th-details-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const txId = e.target.getAttribute('data-tx-id');
                        if (txId) this.showTransactionDetails(txId);
                    });
                });
            }

        } catch (error) {
        }
    }

    /**
     * Enhance transaction with additional information
     */
    enhanceTransaction(tx, category, currentAddress) {
        const enhanced = { ...tx, category };
        enhanced.type = this.determineTransactionType(tx);
        if (tx.type === 'incoming' || tx.type === 'outgoing') {
            enhanced.direction = tx.type === 'incoming' ? 'received' : 'sent';
            enhanced.from = enhanced.direction === 'sent' ? currentAddress : tx.address;
            enhanced.to = enhanced.direction === 'received' ? currentAddress : tx.address;
        } else {
            const fromAddress = tx.from || tx.sender;
            const toAddress = tx.to || tx.receiver || tx.recipient;
            enhanced.direction = (fromAddress && fromAddress === currentAddress) ? 'sent' : 'received';
            enhanced.from = fromAddress;
            enhanced.to = toAddress;
        }
        enhanced.parsedAmount = parseFloat(tx.amount || tx.value) || 0;
        const timestamp = tx.createdAt || tx.updatedAt || tx.completedAt || tx.timestamp || tx.time;
        
        enhanced.displayTime = this.formatTime(timestamp);
        enhanced.relativeTime = this.getRelativeTime(timestamp);
        enhanced.cleanTimestamp = this.parseTimestamp(timestamp);
        if (!tx.status && category === 'completed') {
            enhanced.status = 'success';
        }
        if (tx.hash || tx.txHash || tx.transactionHash) {
            enhanced.txHash = tx.hash || tx.txHash || tx.transactionHash;
        }
        enhanced.statusInfo = this.getStatusInfo(enhanced);
        
        return enhanced;
    }

    /**
     * Parse timestamp safely, handling invalid dates
     */
    parseTimestamp(timestamp) {
        if (!timestamp) return Date.now();
        if (timestamp instanceof Date) {
            return isNaN(timestamp.getTime()) ? Date.now() : timestamp.getTime();
        }
        if (typeof timestamp === 'number') {
            const ts = timestamp > 1e12 ? timestamp : timestamp * 1000;
            return isNaN(ts) ? Date.now() : ts;
        }
        if (typeof timestamp === 'string') {
            const parsed = new Date(timestamp);
            return isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
        }
        
        return Date.now();
    }

    /**
     * Determine transaction type based on various indicators
     */
    determineTransactionType(tx) {
        if (tx.type === 'private_transfer' || tx.privateTransfer || tx.encrypted || tx.type === 'private') {
            if (tx.isBulk || tx.bulk || tx.batchId || tx.bulkId) {
                return 'bulk_private';
            }
            return 'private';
        }
        if (tx.isBulk || tx.bulk || tx.batchId || tx.bulkId) {
            return 'bulk_public';
        }
        if (tx.recipientPublicKey || tx.encryptedData || tx.privateData) {
            return 'private';
        }
        return 'public';
    }

    /**
     * Group transactions by specified criteria
     */
    groupTransactions(transactions) {
        const groupBy = this.groupingMode || 'status';
        const groups = {};
        
        transactions.forEach(tx => {
            let key;
            switch (groupBy) {
                case 'type':
                    if (tx.type === 'private' || tx.type === 'bulk_private') {
                        key = '■ Private Transactions';
                    } else if (tx.type === 'bulk_public') {
                        key = '▫ Bulk Transactions';
                    } else {
                        key = '□ Public Transactions';
                    }
                    break;
                case 'direction':
                    key = tx.direction === 'sent' ? '→ Sent' : '← Received';
                    break;
                case 'date':
                    key = this.getDateGroup(tx.createdAt || tx.updatedAt || tx.completedAt);
                    break;
                case 'status':
                default:
                    key = this.getStatusGroup(tx);
                    break;
            }
            
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(tx);
        });
        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => {
                const timeA = new Date(a.createdAt || a.updatedAt || a.completedAt || 0);
                const timeB = new Date(b.createdAt || b.updatedAt || b.completedAt || 0);
                return timeB - timeA;
            });
        });
        
        return groups;
    }

    /**
     * Get status group for transaction
     */
    getStatusGroup(tx) {
        if (tx.category === 'pending') {
            switch (tx.status) {
                case 'processing': return '↻ Processing';
                case 'retrying': return '↻ Retrying';
                case 'pending': return '⏳ Pending';
                default: return '○ Queue';
            }
        } else {
            switch (tx.status) {
                case 'success': return '✓ Completed Successfully';
                case 'failed': return '× Failed';
                case 'cancelled': return '× Cancelled';
                default: return '• Other';
            }
        }
    }

    /**
     * Get date group for transaction
     */
    getDateGroup(timestamp) {
        if (!timestamp) return '• Unknown Date';
        
        const parsedTime = this.parseTimestamp(timestamp);
        const date = new Date(parsedTime);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        if (date.toDateString() === today.toDateString()) {
            return '• Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return '• Yesterday';
        } else if (date > weekAgo) {
            return '• This Week';
        } else {
            return `• ${date.toLocaleDateString()}`;
        }
    }

    /**
     * Calculate transaction statistics
     */
    calculateStats(pending, history) {
        const stats = {
            total: pending.length + history.length,
            pending: pending.length,
            processing: pending.filter(tx => tx.status === 'processing').length,
            retrying: pending.filter(tx => tx.status === 'retrying').length,
            completed: history.filter(tx => tx.status === 'success').length,
            failed: history.filter(tx => tx.status === 'failed').length,
            cancelled: history.filter(tx => tx.status === 'cancelled').length,
            privateCount: [...pending, ...history].filter(tx => tx.type === 'private' || tx.type === 'bulk_private').length,
            publicCount: [...pending, ...history].filter(tx => tx.type === 'public' || tx.type === 'bulk_public').length,
            totalAmount: [...pending, ...history]
                .filter(tx => tx.direction === 'sent' && tx.status === 'success')
                .reduce((sum, tx) => sum + tx.parsedAmount, 0)
        };
        
        return stats;
    }

    /**
     * Render transaction statistics
     */
    renderStats(stats) {
        return `
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 11px;">
                    <div style="text-align: center;">
                        <div style="color: var(--text-muted);">Total</div>
                        <div style="color: var(--text-primary); font-weight: bold;">${stats.total}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: var(--text-muted);">Processing</div>
                        <div style="color: var(--warning-color); font-weight: bold;">${stats.pending}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: var(--text-muted);">Completed</div>
                        <div style="color: var(--success-color); font-weight: bold;">${stats.completed}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: var(--text-muted);">Private</div>
                        <div style="color: var(--primary-color, #007bff); font-weight: bold;">${stats.privateCount}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: var(--text-muted);">Public</div>
                        <div style="color: var(--info-color, #17a2b8); font-weight: bold;">${stats.publicCount}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: var(--text-muted);">Sent Amount</div>
                        <div style="color: var(--text-primary); font-weight: bold;">${stats.totalAmount.toFixed(3)} OCT</div>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Render grouped transactions
     */
    renderGroupedTransactions(groupedData) {
        let content = '';
        
        Object.keys(groupedData).forEach(groupName => {
            const transactions = groupedData[groupName];
            const groupCount = transactions.length;
            
            content += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: var(--text-primary); margin: 0 0 10px 0; display: flex; justify-content: space-between; align-items: center;">
                        <span>${groupName}</span>
                        <span style="font-size: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px;">${groupCount}</span>
                    </h4>
                    <div>`;
            
            transactions.forEach(tx => {
                content += this.renderDetailedTransaction(tx);
            });
            
            content += `</div></div>`;
        });
        
        if (Object.keys(groupedData).length === 0) {
            content = '<div style="text-align: center; color: var(--text-muted); margin: 20px 0;">No transactions found</div>';
        }
        
        return content;
    }

    /**
     * Render detailed transaction card
     */
    renderDetailedTransaction(tx) {
        const statusColor = this.getStatusColor(tx.status);
        const statusIcon = this.getStatusIcon(tx.status);
        const typeColor = (tx.type === 'private' || tx.type === 'bulk_private') ? 'var(--primary-color, #007bff)' : 'var(--info-color, #17a2b8)';
        const typeIcon = (tx.type === 'private' || tx.type === 'bulk_private') ? '■' : 
                        (tx.type === 'bulk_public') ? '▫' : '□';
        const directionIcon = tx.direction === 'sent' ? '→' : '←';
        
        return `
            <div style="border: 1px solid rgba(255,255,255,0.1); margin: 5px 0; padding: 10px; border-radius: 6px; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="color: ${typeColor}; font-size: 12px;" title="${tx.type} transaction">${typeIcon}</span>
                            <span style="color: var(--text-primary); font-size: 12px; font-weight: bold;">
                                ${directionIcon} ${tx.direction === 'sent' ? 'To' : 'From'}: ${(tx.to || tx.from || '').substring(0, 22)}...
                            </span>
                        </div>
                        
                        <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 4px;">
                            <span style="color: var(--text-primary); font-weight: bold;">${tx.parsedAmount.toFixed(2)} OCT</span>
                            | Status: <span style="color: ${statusColor}; font-weight: bold;">${statusIcon} ${tx.status.toUpperCase()}</span>
                            ${(tx.type === 'private' || tx.type === 'bulk_private') ? ' | <span style="color: var(--primary-color, #007bff);">PRIVATE</span>' : ''}
                            ${tx.type === 'bulk_private' ? ' | <span style="color: var(--warning-color, #ffc107);">BULK</span>' : ''}
                            ${tx.type === 'bulk_public' ? ' | <span style="color: var(--info-color, #17a2b8);">BULK</span>' : ''}
                        </div>
                        
                        <div style="color: var(--text-muted); font-size: 10px; line-height: 1.3;">
                            <div style="margin-bottom: 2px;">
                                ${tx.displayTime} (${tx.relativeTime})
                                ${tx.attempts > 0 ? ` | Retried ${tx.attempts} times` : ''}
                            </div>
                            ${tx.txHash ? `<div style="margin-bottom: 2px;">Hash: <span style="font-family: monospace; color: var(--text-primary);">${tx.txHash.substring(0, 16)}...</span></div>` : ''}
                            ${tx.message ? `<div style="margin-bottom: 2px;">Message: <span style="color: var(--text-primary);">"${tx.message}"</span></div>` : ''}
                            ${tx.fee ? `<div>Fee: ${tx.fee} OCT</div>` : ''}
                        </div>
                        
                        ${tx.lastError ? `<div style="color: var(--error-color); font-size: 10px; margin-top: 6px; padding: 4px; background: rgba(220,53,69,0.1); border-radius: 4px;">
                            Error: ${tx.lastError}
                        </div>` : ''}
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-left: 10px;">
                        ${tx.category === 'pending' && tx.status !== 'success' ? `
                        <button class="th-cancel-btn" data-tx-id="${tx.id}" 
                                style="background: var(--error-color); color: white; border: none; padding: 2px 6px; border-radius: 3px; font-size: 10px; cursor: pointer;" title="Cancel transaction">
                            Cancel
                        </button>` : ''}
                        <button class="th-details-btn" data-tx-id="${tx.id || tx.txHash || ''}" 
                                style="background: var(--secondary-color, #6c757d); color: white; border: none; padding: 2px 6px; border-radius: 3px; font-size: 10px; cursor: pointer;" title="View details">
                            Details
                        </button>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Format timestamp for display
     */
    formatTime(timestamp) {
        if (!timestamp) return 'Unknown time';
        const parsedTime = this.parseTimestamp(timestamp);
        return new Date(parsedTime).toLocaleString();
    }

    /**
     * Get relative time string
     */
    getRelativeTime(timestamp) {
        if (!timestamp) return '';
        
        const now = Date.now();
        const time = this.parseTimestamp(timestamp);
        const diff = now - time;
        
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    /**
     * Get enhanced status information
     */
    getStatusInfo(tx) {
        return {
            color: this.getStatusColor(tx.status),
            icon: this.getStatusIcon(tx.status),
            description: this.getStatusDescription(tx.status)
        };
    }


    /**
     * Get status description
     */
    getStatusDescription(status) {
        switch (status) {
            case 'pending': return 'Waiting to be processed';
            case 'processing': return 'Currently being processed';
            case 'retrying': return 'Retrying after failure';
            case 'success': return 'Successfully completed';
            case 'failed': return 'Failed to complete';
            case 'cancelled': return 'Cancelled by user';
            default: return 'Unknown status';
        }
    }

    /**
     * Toggle grouping mode
     */
    toggleGrouping() {
        const modes = ['status', 'type', 'direction', 'date'];
        const currentIndex = modes.indexOf(this.groupingMode || 'status');
        this.groupingMode = modes[(currentIndex + 1) % modes.length];
        this.refreshTransactionHistory();
    }

    /**
     * Show detailed transaction information
     */
    async showTransactionDetails(txId) {
        this.uiManager.showMessage(`Transaction Details for: ${txId}\n\nDetailed view feature coming soon...`, 'info');
    }

    /**
     * Refresh transaction history display
     */
    async refreshTransactionHistory() {
        try {
            const walletManager = this.uiManager.getWalletManager();
            const activeWallet = walletManager?.getActiveWallet();
            const currentAddress = activeWallet?.address;
            
            if (currentAddress) {
                const clearedCount = await this.clearFailedTransactions(currentAddress);
                const verifiedCount = await this.verifySuccessfulTransactions(currentAddress);
                
                if (clearedCount > 0 || verifiedCount > 0) {
                    this.uiManager.showMessage(
                        `Cleaned up ${clearedCount} old failed transactions and verified ${verifiedCount} successful ones`, 
                        'success'
                    );
                }
            }
        } catch (error) {
        }
        
        await this.showTransactionHistory();
    }

    /**
     * Get status color for UI display
     */
    getStatusColor(status) {
        switch (status) {
            case 'success': return 'var(--success-color)';
            case 'failed': case 'cancelled': return 'var(--error-color)';
            case 'processing': case 'retrying': return 'var(--warning-color)';
            default: return 'var(--text-muted)';
        }
    }

    /**
     * Get status icon for UI display
     */
    getStatusIcon(status) {
        switch (status) {
            case 'success': return '✓';
            case 'failed': case 'cancelled': return '×';
            case 'processing': return '⏳';
            case 'retrying': return '↻';
            case 'pending': return '○';
            default: return '?';
        }
    }

    /**
     * Format address for display (truncate long addresses)
     */
    formatAddress(address) {
        if (!address || typeof address !== 'string') {
            return 'Unknown';
        }
        
        if (address.length <= 16) {
            return address;
        }
        
        return `${address.slice(0, 8)}...${address.slice(-8)}`;
    }

    /**
     * Format currency amount for display
     */
    formatCurrency(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return '0.000000 OCT';
        }
        
        return `${amount.toFixed(2)} OCT`;
    }

    /**
     * Format transaction for display
     */
    formatTransactionDisplay(tx) {
        return {
            id: tx.id,
            to: tx.to.substring(0, 20) + '...',
            amount: `${tx.amount} OCT`,
            status: tx.status.toUpperCase(),
            statusColor: this.getStatusColor(tx.status),
            statusIcon: this.getStatusIcon(tx.status),
            createdAt: new Date(tx.createdAt).toLocaleString(),
            completedAt: tx.completedAt ? new Date(tx.completedAt).toLocaleString() : null,
            attempts: tx.attempts || 0,
            txHash: tx.txHash ? tx.txHash.substring(0, 12) + '...' : null,
            lastError: tx.lastError
        };
    }

    /**
     * Get transaction statistics
     */
    async getTransactionStats() {
        try {
            const pending = await this.getPendingTransactions();
            const history = await this.getTransactionHistory();
            
            const stats = {
                total: pending.length + history.length,
                pending: pending.length,
                processing: pending.filter(tx => tx.status === 'processing').length,
                retrying: pending.filter(tx => tx.status === 'retrying').length,
                success: history.filter(tx => tx.status === 'success').length,
                failed: history.filter(tx => tx.status === 'failed').length,
                cancelled: history.filter(tx => tx.status === 'cancelled').length
            };

            return stats;
        } catch (error) {
            return null;
        }
    }
}
window.TransactionHistoryModule = TransactionHistoryModule;