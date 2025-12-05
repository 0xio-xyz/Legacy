/**
 * 0xio Wallet Extension - Injected Script
 * Creates window.wallet0xio API for DApp interaction
 */

class ZeroXIOWalletAPI {
    constructor() {
        this.isConnected = false;
        this.address = null;
        this.balance = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.eventListeners = new Map();

        window.addEventListener('message', (event) => {
            if (event.data && event.data.source === '0xio-wallet-content') {
                this.handleContentScriptMessage(event.data);
            }
        });
    }
    
    /**
     * Handle messages from content script
     */
    handleContentScriptMessage(data) {
        if (data.requestId && this.pendingRequests.has(data.requestId)) {
            const { resolve, reject } = this.pendingRequests.get(data.requestId);
            this.pendingRequests.delete(data.requestId);
            
            if (data.response && data.response.success) {
                resolve(data.response.data);
            } else {
                reject(new Error(data.response?.error || 'Request failed'));
            }
        } else if (data.type === 'event') {
            this.handleEvent(data.eventData);
        }
    }
    
    /**
     * Handle wallet events
     */
    handleEvent(eventData) {
        const { type, data } = eventData;
        
        switch (type) {
            case 'connect':
                this.isConnected = true;
                this.address = data.address;
                this.balance = data.balance;
                break;
                
            case 'disconnect':
                this.isConnected = false;
                this.address = null;
                this.balance = null;
                break;
                
            case 'accountChanged':
                this.address = data.address;
                this.balance = data.balance;
                break;
        }
        
        this.emit(type, data);
    }
    
    /**
     * Send message to extension
     */
    async sendMessage(method, params = {}) {
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestId;

            this.pendingRequests.set(requestId, { resolve, reject });

            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, 30000); 

            window.postMessage({
                source: '0xio-wallet-injected',
                requestId,
                method,
                params
            }, '*');
        });
    }
    
    /**
     * Check if 0xio Wallet extension is available and has active wallet
     */
    async isAvailable() {
        try {
            const result = await this.sendMessage('ping');
            
            if (typeof result === 'boolean') {
                return result;
            }
            
            if (result && typeof result === 'object') {
                return result.available && result.hasActiveWallet;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Connect to wallet
     */
    async connect() {
        try {
            const result = await this.sendMessage('connect');
            
            this.isConnected = true;
            this.address = result.address;
            this.balance = result.balance;
            
            return {
                address: this.address,
                balance: this.balance
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Disconnect from wallet
     */
    async disconnect() {
        try {
            await this.sendMessage('disconnect');
            
            this.isConnected = false;
            this.address = null;
            this.balance = null;
            
            return true;
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get current connected site information
     */
    getConnectedSite() {
        return {
            hostname: window.location.hostname,
            origin: window.location.origin,
            url: window.location.href,
            title: document.title,
            favicon: this.getFaviconUrl()
        };
    }
    
    /**
     * Get favicon URL for current site
     */
    getFaviconUrl() {
        const links = document.querySelectorAll('link[rel*="icon"]');
        if (links.length > 0) {
            return links[links.length - 1].href;
        }
        return `${window.location.origin}/favicon.ico`;
    }
    
    /**
     * Get current network information
     */
    async getNetworkInfo() {
        try {
            const result = await this.sendMessage('get_network_info');
            return result;
        } catch (error) {
            return {
                id: 'testnet',
                name: 'Testnet',
                rpc_url: 'https://octra.network',
                color: '#f59e0b'
            };
        }
    }
    
    /**
     * Get wallet session info without connecting (for auto-detection)
     */
    async getSessionInfo() {
        try {
            const result = await this.sendMessage('ping');
            
            if (result && typeof result === 'object' && result.hasActiveWallet) {
                return {
                    hasActiveWallet: true,
                    address: result.walletAddress
                };
            }
            
            return { hasActiveWallet: false, address: null };
            
        } catch (error) {
            return { hasActiveWallet: false, address: null };
        }
    }
    
    /**
     * Get wallet info
     */
    async getWalletInfo() {
        try {
            if (!this.isConnected) {
                throw new Error('Wallet not connected');
            }
            
            const result = await this.sendMessage('getWalletInfo');
            
            this.address = result.address;
            this.balance = result.balance;
            
            return {
                address: this.address,
                balance: this.balance,
                privateBalance: result.privateBalance
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get balance
     */
    async getBalance() {
        try {
            if (!this.isConnected) {
                throw new Error('Wallet not connected');
            }
            
            const result = await this.sendMessage('getBalance');
            
            this.balance = result.balance;
            
            return {
                balance: result.balance,
                privateBalance: result.privateBalance
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Send transaction (placeholder for future)
     */
    async sendTransaction() {
        throw new Error('Transaction sending not implemented yet - coming soon!');
    }
    
    /**
     * Get transaction history (placeholder for future)
     */
    async getTransactionHistory() {
        throw new Error('Transaction history not implemented yet - coming soon!');
    }
    
    /**
     * Event listener management
     */
    on(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }
    
    off(event, listener) {
        if (!this.eventListeners.has(event)) return;
        
        const listeners = this.eventListeners.get(event);
        const index = listeners.indexOf(listener);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }
    
    emit(event, data) {
        if (!this.eventListeners.has(event)) return;
        
        this.eventListeners.get(event).forEach(listener => {
            try {
                listener(data);
            } catch (error) {
            }
        });
    }
}

if (!window.wallet0xio) {
    window.wallet0xio = new ZeroXIOWalletAPI();

    if (!window.wallet) {
        window.wallet = window.wallet0xio;
    }

    if (!window.octraWallet) {
        window.octraWallet = window.wallet0xio;
    }

    window.wallet0xio.declareIntegration = function(options = {}) {
        const meta = document.createElement('meta');
        meta.name = '0xio-dapp';
        meta.content = JSON.stringify({
            name: options.name || document.title,
            description: options.description || '0xio DApp',
            version: options.version || '1.0.0',
            integrated: true,
            timestamp: Date.now()
        });
        document.head.appendChild(meta);
    };

    window.dispatchEvent(new CustomEvent('0xioWalletReady', {
        detail: { wallet: window.wallet0xio }
    }));

    window.dispatchEvent(new CustomEvent('octraWalletReady', {
        detail: { wallet: window.wallet0xio }
    }));
}