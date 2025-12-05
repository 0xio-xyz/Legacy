/**
 * Network module for 0xio Wallet Extension
 * Handles API communication with the Octra blockchain
 */

class NetworkClient {
    constructor(rpcUrl, timeout) {
        this.rpcUrl = rpcUrl || (window.OctraConfig?.NETWORK?.RPC_URL || 'https://octra.network');
        this.timeout = timeout || (window.OctraConfig?.NETWORK?.REQUEST_TIMEOUT || 30000);
        this.retryConfig = window.OctraConfig?.NETWORK?.RETRY_CONFIG || {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 8000,
            backoffMultiplier: 2,
            jitterFactor: 0.1
        };
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0
        };
    }

    /**
     * Make request via background script to bypass CORS
     */
    async makeBackgroundRequest(url, method, headers, body) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'NETWORK_REQUEST',
                url,
                method,
                headers,
                body
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response || { success: false, error: 'No response from background' });
                }
            });
        });
    }

    /**
     * Calculate retry delay with exponential backoff and jitter
     * @param {number} attempt
     * @returns {number}
     */
    calculateRetryDelay(attempt) {
        const exponentialDelay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
        const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelay);
        const randomByte = new Uint8Array(1);
        crypto.getRandomValues(randomByte);
        const randomFactor = (randomByte[0] / 255) - 0.5; 
        const jitter = cappedDelay * this.retryConfig.jitterFactor * randomFactor;
        return Math.round(cappedDelay + jitter);
    }

    /**
     * Check if error is retryable
     * @param {Error} error
     * @param {number} status
     * @returns {boolean}
     */
    isRetryableError(error, status = 0) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
            return true;
        }
        const retryableStatuses = [0, 408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524];
        return retryableStatuses.includes(status);
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Make HTTP request with timeout and retry logic
     * @param {string} method
     * @param {string} endpoint
     * @param {Object} data
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async request(method, endpoint, data = null, options = {}) {
        const {
            maxRetries = this.retryConfig.maxRetries,
            timeout = this.timeout,
            skipRetry = false
        } = options;

        this.stats.totalRequests++;
        let lastError = null;
        let retryAttempts = 0;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = this.calculateRetryDelay(attempt - 1);
                    await this.sleep(delay);
                    this.stats.retriedRequests++;
                }

                const url = this.rpcUrl + endpoint;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const requestOptions = {
                    method: method.toUpperCase(),
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, text/plain, */*',
                        'User-Agent': 'Octra-Wallet-Extension/1.0'
                    },
                    signal: controller.signal
                };

                if (method.toUpperCase() === 'POST' && data) {
                    requestOptions.body = JSON.stringify(data);
                }

                try {
                    const response = await this.makeBackgroundRequest(url, method, requestOptions.headers, data);
                    clearTimeout(timeoutId);
                    
                    if (!response.success) {
                        throw new Error(response.error || 'Background request failed');
                    }
                    
                    const status = response.status;
                    const text = response.text;
                    const json = response.json;

                    const result = { status, text, json, retryAttempts: attempt };
                    if (status >= 200 && status < 300) {
                        this.stats.successfulRequests++;
                        return result;
                    }
                    if (!skipRetry && attempt < maxRetries && this.isRetryableError(new Error(`HTTP ${status}`), status)) {
                        lastError = new Error(`HTTP ${status}: ${text}`);
                        continue;
                    }
                    this.stats.failedRequests++;
                    return result;

                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        lastError = new Error('Request timeout');
                    } else {
                        lastError = fetchError;
                    }
                    if (!skipRetry && attempt < maxRetries && this.isRetryableError(lastError)) {
                        continue;
                    }
                    throw lastError;
                }
                
            } catch (error) {
                lastError = error;
                retryAttempts = attempt;
                if (skipRetry || attempt === maxRetries || !this.isRetryableError(error)) {
                    break;
                }
            }
        }
        this.stats.failedRequests++;
        const finalRetryCount = retryAttempts || maxRetries || 0;
        
        return { 
            status: 0, 
            text: lastError?.message || 'Network request failed', 
            json: null,
            retryAttempts: finalRetryCount
        };
    }

    /**
     * Get account balance and nonce with enhanced retry logic
     * @param {string} address
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async getBalance(address, options = {}) {
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/balance/${address}`, 
                'GET', 
                {}, 
                null
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200) {
                let jsonData = backgroundResponse.json;
                if (!jsonData && backgroundResponse.text) {
                    try {
                        jsonData = JSON.parse(backgroundResponse.text);
                    } catch (e) {
                    }
                }
                
                if (jsonData && jsonData.balance !== undefined) {
                    const balance = parseFloat(jsonData.balance);
                    const nonce = parseInt(jsonData.nonce || 0);
                    
                    this.stats.successfulRequests++;
                    return { 
                        balance, 
                        nonce, 
                        fromCache: false,
                        retryAttempts: 0
                    };
                }
            }
            throw new Error(`Background request failed: ${backgroundResponse.error || 'Invalid response'}`);
            
        } catch (backgroundError) {
            this.stats.failedRequests++;
            throw backgroundError;
        }
        try {
            const endpoint = `/balance/${address}`;
            
            const response = await this.request('GET', endpoint, null, options);
            
            if (response.status === 200 && response.json) {
                const balance = parseFloat(response.json.balance || 0);
                const nonce = parseInt(response.json.nonce || 0);
                return { 
                    balance, 
                    nonce, 
                    fromCache: false,
                    retryAttempts: response.retryAttempts || 0
                };
            } else if (response.status === 404) {
                return { 
                    balance: 0.0, 
                    nonce: 0, 
                    fromCache: false,
                    retryAttempts: response.retryAttempts || 0
                };
            } else if (response.status === 200 && response.text && !response.json) {
                const parts = response.text.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const balance = parseFloat(parts[0]);
                    const nonce = parseInt(parts[1]);
                    return { 
                        balance, 
                        nonce, 
                        fromCache: false,
                        retryAttempts: response.retryAttempts || 0
                    };
                }
            }
            
            const errorMsg = `API Error: ${response.status} ${response.text}`;
            throw new Error(errorMsg);
        } catch (error) {
            return { 
                balance: null, 
                nonce: null, 
                fromCache: false,
                error: error.message,
                retryAttempts: this.retryConfig.maxRetries
            };
        }
    }

    /**
     * Get staging (pending) transactions with retry logic
     * @param {string} address
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async getStagingTransactions(address, options = {}) {
        
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/staging`, 
                'GET', 
                {}, 
                null
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200) {
                let jsonData = backgroundResponse.json;
                if (!jsonData && backgroundResponse.text) {
                    try {
                        jsonData = JSON.parse(backgroundResponse.text);
                    } catch (e) {
                        return [];
                    }
                }
                
                if (jsonData && jsonData.staged_transactions) {
                    const filtered = jsonData.staged_transactions.filter(tx => tx.from === address);
                    return filtered;
                }
            }
            return [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Send transaction to the network with retry logic
     * @param {Object} transaction
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async sendTransaction(transaction, options = {}) {
        
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/send-tx`, 
                'POST', 
                { 'Content-Type': 'application/json' }, 
                transaction
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200) {
                let jsonData = backgroundResponse.json;
                if (!jsonData && backgroundResponse.text) {
                    try {
                        jsonData = JSON.parse(backgroundResponse.text);
                    } catch (e) {
                    }
                }
                if (jsonData && jsonData.status === 'accepted') {
                    return {
                        success: true,
                        result: jsonData.tx_hash || '',
                        extra: jsonData,
                        retryAttempts: 0
                    };
                }
                else if (backgroundResponse.text && backgroundResponse.text.toLowerCase().startsWith('ok')) {
                    const txHash = backgroundResponse.text.split(' ').pop();
                    return {
                        success: true,
                        result: txHash,
                        extra: { text: backgroundResponse.text },
                        retryAttempts: 0
                    };
                }
            }
            const errorMessage = backgroundResponse.json ? JSON.stringify(backgroundResponse.json) : backgroundResponse.text;
            return {
                success: false,
                result: errorMessage || `HTTP ${backgroundResponse.status}`,
                extra: null,
                retryAttempts: 0
            };
        } catch (error) {
            return {
                success: false,
                result: error.message,
                extra: null,
                retryAttempts: 0
            };
        }
    }

    /**
     * Get transaction history for an address with retry logic
     * @param {string} address
     * @param {number} limit
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async getTransactionHistory(address, limit = 20, options = {}) {
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/address/${address}?limit=${limit}`, 
                'GET', 
                {}, 
                null
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200) {
                let jsonData = backgroundResponse.json;
                if (!jsonData && backgroundResponse.text) {
                    try {
                        jsonData = JSON.parse(backgroundResponse.text);
                    } catch (e) {
                        return [];
                    }
                }
                
                if (jsonData && jsonData.recent_transactions) {
                    const transactions = [];
                    for (const ref of jsonData.recent_transactions) {
                        const txHash = ref.hash;
                        if (txHash) {
                            
                            const txBackgroundResponse = await this.makeBackgroundRequest(
                                `${this.rpcUrl}/tx/${txHash}`, 
                                'GET', 
                                {}, 
                                null
                            );
                            
                            if (txBackgroundResponse.success && txBackgroundResponse.status === 200) {
                                let txJsonData = txBackgroundResponse.json;
                                if (!txJsonData && txBackgroundResponse.text) {
                                    try {
                                        txJsonData = JSON.parse(txBackgroundResponse.text);
                                    } catch (e) {
                                        continue;
                                    }
                                }
                                
                                if (txJsonData && txJsonData.parsed_tx) {
                                    const parsed = txJsonData.parsed_tx;
                                    let message = null;
                                    if (txJsonData.data) {
                                        try {
                                            const msgData = JSON.parse(txJsonData.data);
                                            message = msgData.message;
                                        } catch (e) {
                                        }
                                    }
                                    const isIncoming = parsed.to === address;
                                    const amountRaw = parsed.amount_raw || parsed.amount || '0';
                                    const amount = amountRaw.includes('.') ? parseFloat(amountRaw) : parseInt(amountRaw) / 1000000;
                                    
                                    transactions.push({
                                        hash: txHash,
                                        timestamp: parsed.timestamp * 1000, 
                                        type: isIncoming ? 'incoming' : 'outgoing',
                                        amount: amount,
                                        address: isIncoming ? parsed.from : parsed.to,
                                        nonce: parsed.nonce || 0,
                                        epoch: ref.epoch || 0,
                                        message: message,
                                        confirmed: Boolean(ref.epoch)
                                    });
                                }
                            }
                        }
                    }
                    this.stats.successfulRequests++;
                    return transactions.sort((a, b) => b.timestamp - a.timestamp);
                } else {
                    return [];
                }
            } else {
                throw new Error(`Background request failed: ${backgroundResponse.error || 'Invalid response'}`);
            }
            
        } catch (backgroundError) {
            this.stats.failedRequests++;
            return [];
        }
    }

    /**
     * Get transaction details by hash
     * @param {string} txHash
     * @returns {Promise<Object>}
     */
    async getTransaction(txHash) {
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/tx/${txHash}`, 
                'GET', 
                {}, 
                null
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200 && backgroundResponse.json) {
                return backgroundResponse.json;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get network status
     * @returns {Promise<Object>}
     */
    async getNetworkStatus() {
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/status`, 
                'GET', 
                {}, 
                null
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200 && backgroundResponse.json) {
                return backgroundResponse.json;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate address format using centralized crypto validation
     * @param {string} address
     * @returns {boolean}
     */
    isValidAddress(address) {
        if (window.CryptoManager) {
            const crypto = new window.CryptoManager();
            return crypto.verifyAddressFormat(address);
        }
        return typeof address === 'string' && 
               address.startsWith('oct') && 
               address.length === 47 &&
               /^oct[A-Za-z0-9]+$/.test(address);
    }

    /**
     * Calculate transaction fee
     * @param {number} amount
     * @returns {number}
     */
    calculateFee(amount) {
        return amount < 1000 ? 0.001 : 0.003;
    }

    /**
     * Create transaction object
     * @param {string} from
     * @param {string} to
     * @param {number} amount
     * @param {number} nonce
     * @param {string} message
     * @returns {Object}
     */
    createTransaction(from, to, amount, nonce, message = null) {
        const transaction = {
            from: from,
            to_: to,
            amount: String(Math.trunc(amount * 1000000)), // Convert to micro-OCT
            nonce: parseInt(nonce),
            ou: amount < 1000 ? "1" : "3",
            timestamp: Date.now() / 1000 
        };

        if (message) {
            transaction.message = message.slice(0, 1024); 
        }

        return transaction;
    }

    /**
     * Set RPC URL
     * @param {string} url
     */
    setRpcUrl(url) {
        this.rpcUrl = url;
    }

    /**
     * Get current RPC URL
     * @returns {string}
     */
    getRpcUrl() {
        return this.rpcUrl;
    }

    /**
     * Get network statistics for monitoring
     * @returns {Object}
     */
    getStats() {
        const successRate = this.stats.totalRequests > 0 ? 
            (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2) : 0;
        
        return {
            ...this.stats,
            successRate: `${successRate}%`,
            retryRate: this.stats.totalRequests > 0 ? 
                (this.stats.retriedRequests / this.stats.totalRequests * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Reset network statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0
        };
    }

    /**
     * Update retry configuration
     * @param {Object} config
     */
    updateRetryConfig(config) {
        this.retryConfig = {
            ...this.retryConfig,
            ...config
        };
    }

    /**
     * Make private API request (requires X-Private-Key header)
     * @param {string} method
     * @param {string} endpoint
     * @param {Object} data
     * @param {string} privateKey
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async privateRequest(method, endpoint, data = null, privateKey = null, options = {}) {
        
        try {
            const headers = { 'Content-Type': 'application/json' };
            
            if (privateKey) {
                headers['X-Private-Key'] = privateKey;
            }
            
            const url = this.rpcUrl + endpoint;
            const backgroundResponse = await this.makeBackgroundRequest(url, method, headers, data);
            
            if (backgroundResponse.success && backgroundResponse.status === 200) {
                let jsonData = backgroundResponse.json;
                if (!jsonData && backgroundResponse.text) {
                    try {
                        jsonData = JSON.parse(backgroundResponse.text);
                    } catch (e) {
                        return { success: false, error: 'Invalid JSON response' };
                    }
                }
                this.stats.successfulRequests++;
                return { success: true, result: jsonData || {} };
            } else {
                let errorMessage = backgroundResponse.error || 'Request failed';
                if (backgroundResponse.text) {
                    try {
                        const errorJson = JSON.parse(backgroundResponse.text);
                        if (errorJson.error) {
                            errorMessage = errorJson.error;
                        } else if (errorJson.message) {
                            errorMessage = errorJson.message;
                        }
                    } catch (e) {
                        if (backgroundResponse.text.length < 200) {
                            errorMessage = backgroundResponse.text;
                        }
                    }
                }
                
                this.stats.failedRequests++;
                return { 
                    success: false, 
                    error: `HTTP ${backgroundResponse.status}: ${errorMessage}` 
                };
            }
        } catch (error) {
            this.stats.failedRequests++;
            return { success: false, error: error.message };
        }
    }

    /**
     * Get encrypted balance information
     * @param {string} address
     * @param {string} privateKey
     * @returns {Promise<Object>}
     */
    async getEncryptedBalance(address, privateKey) {
        const response = await this.privateRequest(
            'GET',
            `/view_encrypted_balance/${address}`,
            null,
            privateKey
        );
        
        if (response.success) {
            try {
                return {
                    success: true,
                    public: parseFloat(response.result.public_balance?.split(' ')[0] || '0'),
                    publicRaw: parseInt(response.result.public_balance_raw || '0'),
                    encrypted: parseFloat(response.result.encrypted_balance?.split(' ')[0] || '0'),
                    encryptedRaw: parseInt(response.result.encrypted_balance_raw || '0'),
                    total: parseFloat(response.result.total_balance?.split(' ')[0] || '0')
                };
            } catch (e) {
                return { success: false, error: 'Failed to parse balance data' };
            }
        }
        
        return response;
    }

    /**
     * Encrypt balance
     * @param {string} address
     * @param {string} amount
     * @param {string} privateKey
     * @param {string} encryptedData
     * @returns {Promise<Object>}
     */
    async encryptBalance(address, amount, privateKey, encryptedData) {
        const data = {
            address,
            amount,
            private_key: privateKey,
            encrypted_data: encryptedData
        };
        
        return await this.privateRequest('POST', '/encrypt_balance', data, privateKey);
    }

    /**
     * Decrypt balance
     * @param {string} address
     * @param {string} amount
     * @param {string} privateKey
     * @param {string} encryptedData
     * @returns {Promise<Object>}
     */
    async decryptBalance(address, amount, privateKey, encryptedData) {
        const data = {
            address,
            amount,
            private_key: privateKey,
            encrypted_data: encryptedData
        };
        
        return await this.privateRequest('POST', '/decrypt_balance', data, privateKey);
    }

    /**
     * Create private transfer
     * @param {string} fromAddress
     * @param {string} toAddress
     * @param {string} amount
     * @param {string} fromPrivateKey
     * @param {string} toPublicKey
     * @returns {Promise<Object>}
     */
    async createPrivateTransfer(fromAddress, toAddress, amount, fromPrivateKey, toPublicKey) {
        const data = {
            from: fromAddress,
            to: toAddress,
            amount,
            from_private_key: fromPrivateKey,
            to_public_key: toPublicKey
        };
        
        return await this.privateRequest('POST', '/private_transfer', data, fromPrivateKey);
    }

    /**
     * Get pending private transfers
     * @param {string} address
     * @param {string} privateKey
     * @returns {Promise<Object>}
     */
    async getPendingPrivateTransfers(address, privateKey) {
        const response = await this.privateRequest(
            'GET',
            `/pending_private_transfers?address=${address}`,
            null,
            privateKey
        );
        
        if (response.success) {
            return {
                success: true,
                transfers: response.result.pending_transfers || []
            };
        }
        
        return response;
    }

    /**
     * Claim private transfer
     * @param {string} recipientAddress
     * @param {string} privateKey
     * @param {string} transferId
     * @returns {Promise<Object>}
     */
    async claimPrivateTransfer(recipientAddress, privateKey, transferId) {
        const data = {
            recipient_address: recipientAddress,
            private_key: privateKey,
            transfer_id: parseInt(transferId) 
        };
        
        return await this.privateRequest('POST', '/claim_private_transfer', data, privateKey);
    }

    /**
     * Get public key for address
     * @param {string} address
     * @returns {Promise<Object>}
     */
    async getPublicKey(address) {
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/public_key/${address}`, 
                'GET', 
                {}, 
                null
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200 && backgroundResponse.json) {
                return {
                    success: true,
                    publicKey: backgroundResponse.json.public_key
                };
            }
            
            return {
                success: false,
                error: `Failed to get public key: ${backgroundResponse.status}`
            };
        } catch (error) {
            return {
                success: false,
                error: 'Failed to get public key: ' + error.message
            };
        }
    }

    /**
     * Get address info
     * @param {string} address
     * @returns {Promise<Object>}
     */
    async getAddressInfo(address) {
        try {
            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/address/${address}`, 
                'GET', 
                {}, 
                null
            );
            
            if (backgroundResponse.success && backgroundResponse.status === 200 && backgroundResponse.json) {
                return {
                    success: true,
                    info: backgroundResponse.json
                };
            }
            
            return {
                success: false,
                error: `Failed to get address info: ${backgroundResponse.status}`
            };
        } catch (error) {
            return {
                success: false,
                error: 'Failed to get address info: ' + error.message
            };
        }
    }

    /**
     * Call a contract view method (read-only)
     * @param {string} contract
     * @param {string} method
     * @param {Array} params
     * @param {string} caller
     * @returns {Promise<string>}
     */
    async contractCallView(contract, method, params, caller) {
        try {
            const data = {
                contract,
                method,
                params,
                caller
            };

            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/contract/call-view`,
                'POST',
                { 'Content-Type': 'application/json' },
                data
            );

            if (backgroundResponse.success && backgroundResponse.status === 200) {
                const result = backgroundResponse.json || JSON.parse(backgroundResponse.text);
                if (result.status === 'success') {
                    return result.result;
                } else {
                    throw new Error(result.error || 'Contract call failed');
                }
            } else {
                throw new Error(`HTTP ${backgroundResponse.status}: ${backgroundResponse.error}`);
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Call a contract method with transaction
     * @param {string} contract
     * @param {string} method
     * @param {Array} params
     * @param {string} fromAddress
     * @param {string} privateKey
     * @returns {Promise<string>}
     */
    async contractCall(contract, method, params, fromAddress, privateKey) {
        try {
            const balanceResponse = await this.getBalance(fromAddress);
            if (balanceResponse.balance === undefined || balanceResponse.nonce === undefined) {
                throw new Error('Failed to get wallet balance and nonce');
            }
            const randomBytes = new Uint8Array(2);
            crypto.getRandomValues(randomBytes);
            const randomOffset = (randomBytes[0] * 256 + randomBytes[1]) / 65535 * 10; 
            const timestamp = Date.now() / 1000 + randomOffset;
            const transaction = {
                from: fromAddress,
                to_: contract,
                amount: '0', 
                nonce: balanceResponse.nonce + 1,
                ou: 1, 
                timestamp: timestamp
            };
            const cryptoManager = new window.CryptoManager();
            const keySetResult = cryptoManager.setPrivateKey(privateKey);
            if (!keySetResult) {
                throw new Error('Failed to set private key in crypto manager');
            }
            const signResult = cryptoManager.signTransaction(transaction);
            if (!signResult) {
                throw new Error('Failed to sign transaction');
            }
            const publicKey = cryptoManager.getPublicKey();

            const data = {
                contract,
                method,
                params,
                caller: fromAddress,
                nonce: balanceResponse.nonce + 1,
                timestamp,
                signature: signResult.signature,
                public_key: publicKey
            };

            const backgroundResponse = await this.makeBackgroundRequest(
                `${this.rpcUrl}/call-contract`,
                'POST',
                { 'Content-Type': 'application/json' },
                data
            );

            if (backgroundResponse.success && backgroundResponse.status === 200) {
                const result = backgroundResponse.json || JSON.parse(backgroundResponse.text);
                if (result.tx_hash) {
                    return result.tx_hash;
                } else {
                    throw new Error('No transaction hash returned');
                }
            } else {
                throw new Error(`HTTP ${backgroundResponse.status}: ${backgroundResponse.error}`);
            }
        } catch (error) {
            throw error;
        }
    }
}
window.NetworkClient = NetworkClient; 