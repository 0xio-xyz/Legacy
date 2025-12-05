class OctraWallet {
    constructor() {
        this.crypto = new CryptoManager();
        this.network = new NetworkClient();
        this.address = null;
        
        this.balanceCache = null;
        this.nonceCache = null;
        this.transactionCache = [];
        this.cacheTime = 0;
        this.cacheTTL = 30000; 
    }

    initialize(privateKey, address) {
        if (!privateKey) {
            return false;
        }
        
        if (!address) {
            return false;
        }
        
        if (typeof privateKey !== 'string') {
            return false;
        }
        
        if (typeof address !== 'string') {
            return false;
        }
        
        try {
            if (!this.crypto.setPrivateKey(privateKey)) {
                throw new Error('Invalid private key');
            }

            if (!this.crypto.verifyAddressFormat(address)) {
                throw new Error('Invalid address format');
            }

            this.address = address;
            this.clearCache();
            
            return true;
        } catch (error) {
            this.clear();
            return false;
        }
    }

    async generateWallet() {
        try {
            const walletData = await this.crypto.generateKeyPair();
            
            if (!walletData) {
                throw new Error('Failed to generate key pair');
            }

            this.address = walletData.address;
            this.clearCache();

            return walletData;
        } catch (error) {
            return null;
        }
    }

    async getBalanceAndNonce(forceRefresh = false) {
        if (!this.address) {
            const error = new Error('Wallet not initialized');
            throw error;
        }

        const now = Date.now();
        
        if (!forceRefresh && 
            this.balanceCache !== null && 
            this.nonceCache !== null &&
            (now - this.cacheTime) < this.cacheTTL) {
            return {
                balance: this.balanceCache,
                nonce: this.nonceCache
            };
        }
        try {
            const result = await this.network.getBalance(this.address);
            
            if (result.balance !== null && result.nonce !== null) {
                const pendingTxs = await this.network.getStagingTransactions(this.address);
                let nonce = result.nonce;
                
                if (pendingTxs.length > 0) {
                    const maxPendingNonce = Math.max(...pendingTxs.map(tx => tx.nonce || 0));
                    nonce = Math.max(nonce, maxPendingNonce);
                }

                this.balanceCache = result.balance;
                this.nonceCache = nonce;
                this.cacheTime = now;
                
                return {
                    balance: result.balance,
                    nonce: nonce,
                    retryAttempts: result.retryAttempts || 0
                };
            }

            const errorMsg = result.error || 'Failed to fetch balance - null response';
            const error = new Error(errorMsg);
            error.retryAttempts = result.retryAttempts || 0;
            throw error;
        } catch (error) {
            return {
                balance: null,
                nonce: null
            };
        }
    }

    async getTransactionHistory(forceRefresh = false) {
        if (!this.address) {
            throw new Error('Wallet not initialized');
        }

        const now = Date.now();
        
        if (!forceRefresh && 
            this.transactionCache.length > 0 &&
            (now - this.cacheTime) < this.cacheTTL) {
            return this.transactionCache;
        }

        try {
            const transactions = await this.network.getTransactionHistory(this.address);
            
            this.transactionCache = transactions;
            this.cacheTime = now;
            
            return transactions;
        } catch (error) {
            return [];
        }
    }

    async sendTransaction(toAddress, amount, message = null) {
        if (!this.address || !this.crypto.isReady()) {
            throw new Error('Wallet not initialized');
        }

        try {
            if (!this.network.isValidAddress(toAddress)) {
                return { success: false, result: 'Invalid recipient address' };
            }

            if (amount <= 0) {
                return { success: false, result: 'Amount must be positive' };
            }

            const { balance, nonce } = await this.getBalanceAndNonce(true);
            
            if (balance === null || nonce === null) {
                return { success: false, result: 'Failed to get wallet status' };
            }

            const fee = this.network.calculateFee(amount);
            const totalNeeded = amount + fee;
            
            if (balance < totalNeeded) {
                return { 
                    success: false, 
                    result: `Insufficient balance. Need ${totalNeeded.toFixed(6)} OCT, have ${balance.toFixed(6)} OCT` 
                };
            }

            const transaction = this.network.createTransaction(
                this.address, toAddress, amount, nonce + 1, message
            );

            const signResult = this.crypto.signTransaction(transaction);
            if (!signResult) {
                return { success: false, result: 'Failed to sign transaction' };
            }

            transaction.signature = signResult.signature;
            transaction.public_key = this.crypto.getPublicKey();

            const sendResult = await this.network.sendTransaction(transaction);
            
            if (sendResult.success) {
                this.clearCache();
                return sendResult;
            } else {
                if (sendResult.result && sendResult.result.toLowerCase().includes('duplicate') || 
                    (sendResult.extra && sendResult.extra.status === 409)) {
                    this.clearCache();
                    const { balance: freshBalance, nonce: freshNonce } = await this.getBalanceAndNonce(true);
                    
                    if (freshBalance !== null && freshNonce !== null && freshBalance >= totalNeeded) {
                        const retryTransaction = this.network.createTransaction(
                            this.address, toAddress, amount, freshNonce + 1, message
                        );
                        
                        const retrySignResult = this.crypto.signTransaction(retryTransaction);
                        if (retrySignResult) {
                            retryTransaction.signature = retrySignResult.signature;
                            retryTransaction.public_key = this.crypto.getPublicKey();
                            
                            const retryResult = await this.network.sendTransaction(retryTransaction);
                            
                            if (retryResult.success) {
                                this.clearCache();
                            }
                            
                            return retryResult;
                        }
                    }
                }
                
                this.clearCache(); 
                return sendResult;
            }
        } catch (error) {
            return { success: false, result: error.message };
        }
    }

    async sendMultipleTransactions(recipients) {
        if (!this.address || !this.crypto.isReady()) {
            throw new Error('Wallet not initialized');
        }

        const results = { success: [], failed: [] };

        try {
            let totalAmount = 0;
            for (const { address, amount } of recipients) {
                if (!this.network.isValidAddress(address)) {
                    results.failed.push(`Invalid address: ${address}`);
                    return results;
                }
                if (amount <= 0) {
                    results.failed.push(`Invalid amount: ${amount}`);
                    return results;
                }
                totalAmount += amount + this.network.calculateFee(amount);
            }

            const { balance, nonce } = await this.getBalanceAndNonce(true);
            if (balance === null || nonce === null) {
                results.failed.push('Failed to get wallet status');
                return results;
            }

            if (balance < totalAmount) {
                results.failed.push(`Insufficient balance. Need ${totalAmount.toFixed(6)} OCT, have ${balance.toFixed(6)} OCT`);
                return results;
            }

            let currentNonce = nonce;
            for (const { address, amount, message } of recipients) {
                currentNonce += 1;

                try {
                    const transaction = this.network.createTransaction(
                        this.address, address, amount, currentNonce, message
                    );

                    const signResult = this.crypto.signTransaction(transaction);
                    if (!signResult) {
                        results.failed.push(`${address}: Failed to sign transaction`);
                        continue;
                    }

                    transaction.signature = signResult.signature;
                    transaction.public_key = this.crypto.getPublicKey();

                    const sendResult = await this.network.sendTransaction(transaction);
                    
                    if (sendResult.success) {
                        results.success.push(`${address}: ${sendResult.result}`);
                    } else {
                        results.failed.push(`${address}: ${sendResult.result}`);
                    }
                } catch (error) {
                    results.failed.push(`${address}: ${error.message}`);
                }
            }

            this.clearCache();

            return results;
        } catch (error) {
            results.failed.push(error.message);
            return results;
        }
    }

    async sendMultiplePrivateTransactions(recipients) {
        if (!this.address || !this.crypto.isReady()) {
            throw new Error('Wallet not initialized');
        }

        const results = { success: [], failed: [] };

        try {
            const encryptedBalanceResult = await this.network.getEncryptedBalance(this.address, this.crypto.getPrivateKey());
            if (!encryptedBalanceResult.success) {
                results.failed.push('Failed to get encrypted balance');
                return results;
            }

            const availableEncrypted = encryptedBalanceResult.encrypted || 0;

            let totalAmount = 0;
            for (const { amount } of recipients) {
                if (amount <= 0) {
                    results.failed.push(`Invalid amount: ${amount}`);
                    continue;
                }
                totalAmount += amount;
            }

            if (availableEncrypted < totalAmount) {
                results.failed.push(`Insufficient encrypted balance. Need ${totalAmount.toFixed(6)} OCT, have ${availableEncrypted.toFixed(6)} OCT encrypted`);
                return results;
            }

            for (const { address, amount } of recipients) {
                if (amount <= 0) {
                    results.failed.push(`${address}: Invalid amount ${amount}`);
                    continue;
                }

                try {
                    const publicKeyResult = await this.network.getPublicKey(address);
                    
                    if (!publicKeyResult || !publicKeyResult.success || !publicKeyResult.publicKey) {
                        results.failed.push(`${address}: Public key not found. Recipient needs to have sent at least one transaction.`);
                        continue;
                    }
                    
                    const recipientPublicKey = publicKeyResult.publicKey;

                    const amountRaw = Math.trunc(amount * 1000000); 
                    
                    const transferResult = await this.network.createPrivateTransfer(
                        this.address,
                        address,
                        amountRaw.toString(),
                        this.crypto.getPrivateKey(),
                        recipientPublicKey
                    );

                    if (transferResult.success) {
                        results.success.push(`${address}: ${amount} OCT - Transfer created successfully`);
                    } else {
                        const errorMsg = transferResult.error || 'Transfer failed';
                        
                        if (errorMsg.includes('Duplicate transaction') || errorMsg.includes('HTTP 400')) {
                            if (!results.retryQueue) results.retryQueue = [];
                            results.retryQueue.push({ address, amount, recipientPublicKey, attempts: 0 });
                        } else {
                            results.failed.push(`${address}: ${errorMsg}`);
                        }
                    }

                } catch (error) {
                    results.failed.push(`${address}: ${error.message}`);
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (results.retryQueue && results.retryQueue.length > 0) {
                await this.processRetryQueue(results);
            }

            this.clearCache();

            return results;
        } catch (error) {
            results.failed.push(error.message);
            return results;
        }
    }

    async sendMultiplePrivateTransactionsTracked(recipients) {
        if (!this.address || !this.crypto.isReady()) {
            throw new Error('Wallet not initialized');
        }

        const results = { success: [], failed: [], pending: [] };
        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const randomHex = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const bulkId = `bulk_${Date.now()}_${randomHex.substr(0, 9)}`;

        try {
            const encryptedBalanceResult = await this.network.getEncryptedBalance(this.address, this.crypto.getPrivateKey());
            
            if (!encryptedBalanceResult.success) {
                results.failed.push('Failed to get encrypted balance');
                return results;
            }

            const availableEncrypted = encryptedBalanceResult.encrypted || 0;
            const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0);

            if (availableEncrypted < totalAmount) {
                const errorMsg = `Insufficient encrypted balance. Need ${totalAmount.toFixed(6)} OCT, have ${availableEncrypted.toFixed(6)} OCT encrypted`;
                results.failed.push(errorMsg);
                return results;
            }

            for (let i = 0; i < recipients.length; i++) {
                const { address, amount } = recipients[i];
                
                try {
                    const publicKeyResult = await this.network.getPublicKey(address);
                    
                    if (!publicKeyResult || !publicKeyResult.success || !publicKeyResult.publicKey) {
                        const errorMsg = `${address}: Public key not found. Recipient needs to have sent at least one transaction.`;
                        results.failed.push(errorMsg);
                        continue;
                    }

                    const response = await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            type: 'TRANSACTION',
                            action: 'CREATE_TRANSACTION',
                            data: {
                                type: 'private_transfer',
                                from: this.address,
                                to: address,
                                amount: amount,
                                recipientPublicKey: publicKeyResult.publicKey,
                                fromPrivateKey: this.crypto.getPrivateKey(),
                                isBulk: true,
                                bulkId: bulkId
                            }
                        }, resolve);
                    });

                    if (response.success) {
                        const successMsg = `${address}: ${amount} OCT - Processing in background (ID: ${response.transaction.id})`;
                        results.pending.push(successMsg);
                    } else {
                        const errorMsg = `${address}: Failed to create tracked transaction - ${response.error}`;
                        results.failed.push(errorMsg);
                    }

                } catch (error) {
                    const errorMsg = `${address}: ${error.message}`;
                    results.failed.push(errorMsg);
                }
            }

            return results;
        } catch (error) {
            results.failed.push(error.message);
            return results;
        }
    }

    async processRetryQueue(results) {
        const maxRetries = 3;
        const baseDelay = 2000; 
        
        while (results.retryQueue.length > 0) {
            const retryBatch = results.retryQueue.splice(0, 3); 
            
            for (const item of retryBatch) {
                const { address, amount, recipientPublicKey, attempts } = item;
                
                if (attempts >= maxRetries) {
                    results.failed.push(`${address}: Max retries exceeded (duplicate transaction)`);
                    continue;
                }
                
                const delay = baseDelay * Math.pow(2, attempts);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                try {
                    const amountRaw = Math.trunc(amount * 1000000);
                    const transferResult = await this.network.createPrivateTransfer(
                        this.address,
                        address,
                        amountRaw.toString(),
                        this.crypto.getPrivateKey(),
                        recipientPublicKey
                    );
                    
                    if (transferResult.success) {
                        results.success.push(`${address}: ${amount} OCT - Transfer successful (retry ${attempts + 1})`);
                    } else {
                        const errorMsg = transferResult.error || 'Transfer failed';
                        
                        if ((errorMsg.includes('Duplicate transaction') || errorMsg.includes('HTTP 400')) 
                            && attempts < maxRetries - 1) {
                            results.retryQueue.push({ 
                                address, amount, recipientPublicKey, 
                                attempts: attempts + 1 
                            });
                        } else {
                            results.failed.push(`${address}: ${errorMsg} (after ${attempts + 1} retries)`);
                        }
                    }
                } catch (error) {
                    if (attempts < maxRetries - 1) {
                        results.retryQueue.push({ 
                            address, amount, recipientPublicKey, 
                            attempts: attempts + 1 
                        });
                    } else {
                        results.failed.push(`${address}: ${error.message} (after ${attempts + 1} retries)`);
                    }
                }
            }
        }
    }

    getAddress() {
        return this.address;
    }

    getPublicKey() {
        return this.crypto.getPublicKey();
    }

    getPrivateKey() {
        return this.crypto.getPrivateKey();
    }

    exportWallet() {
        if (!this.address || !this.crypto.isReady()) {
            throw new Error('Wallet not initialized');
        }

        return {
            privateKey: this.crypto.getPrivateKey(),
            publicKey: this.crypto.getPublicKey(),
            address: this.address,
            timestamp: Date.now()
        };
    }

    isReady() {
        return this.address !== null && this.crypto.isReady();
    }

    clearCache() {
        this.balanceCache = null;
        this.nonceCache = null;
        this.transactionCache = [];
        this.cacheTime = 0;
    }

    clear() {
        this.crypto.clear();
        this.address = null;
        this.clearCache();
    }

    setRpcUrl(url) {
        this.network.setRpcUrl(url);
        this.clearCache();
    }

    getRpcUrl() {
        return this.network.getRpcUrl();
    }

    async getNetworkStatus() {
        return await this.network.getNetworkStatus();
    }

    isValidAddress(address) {
        return this.network.isValidAddress(address);
    }
}

window.OctraWallet = OctraWallet;