/**
 * Background service worker for 0xio Wallet Extension
 * Minimal implementation to avoid service worker issues
 */

importScripts('js/config.js');

chrome.runtime.onInstalled.addListener((details) => {
    
    if (details.reason === 'install') {
        chrome.storage.local.set({
            'extension_version': chrome.runtime.getManifest().version,
            'install_time': Date.now(),
            'settings': {
                'rpc_url': 'https://octra.network',
                'auto_refresh': true,
                'refresh_interval': 30000
            }
        }).catch(error => {
        });
    }
    
    if (details.reason === 'chrome_update') {
        chrome.storage.local.set({ chromeRestarted: true });
    } else if (details.reason === 'update') {
        chrome.storage.local.remove(['sessionKey', 'lastActivity']);
    } else if (details.reason === 'install') {
    } else {
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    switch (message.type) {
        case 'GET_EXTENSION_INFO':
            handleExtensionInfoRequest(sendResponse);
            return true;
            
        case 'LOG_ERROR':
            sendResponse({ success: true });
            break;
            
        case 'NETWORK_REQUEST':
            handleNetworkRequest(message, sendResponse);
            return true;
            
        case 'DAPP_MESSAGE':
            handleDAppMessage(message, sender, sendResponse);
            return true;
            
        case 'RETRY_QUEUE':
            handleRetryQueueMessage(message, sendResponse);
            return true;
            
        case 'TRANSACTION':
            handleTransactionMessage(message, sendResponse);
            return true;
            
        default:
            sendResponse({ error: 'Unknown message type' });
    }
});

/**
 * Handle network request from popup (bypass CORS)
 */
async function handleNetworkRequest(message, sendResponse) {
    try {
        const { url, method = 'GET', headers = {}, body } = message;
        
        const requestOptions = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                ...headers
            }
        };
        
        if (method.toUpperCase() === 'POST' && body) {
            requestOptions.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, requestOptions);
        const status = response.status;
        const text = await response.text();
        
        let json = null;
        try {
            json = JSON.parse(text);
        } catch (e) {
            // Not JSON, that's fine (ig)
        }
        
        sendResponse({
            success: true,
            status,
            text,
            json,
            headers: Object.fromEntries(response.headers.entries())
        });
        
    } catch (error) {
        sendResponse({
            success: false,
            error: error.message,
            status: 0
        });
    }
}

/**
 * Handle extension info request
 */
function handleExtensionInfoRequest(sendResponse) {
    try {
        const manifest = chrome.runtime.getManifest();
        
        sendResponse({
            success: true,
            info: {
                name: manifest.name,
                version: manifest.version,
                id: chrome.runtime.id
            }
        });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    
    if (changes.wallet) {
        if (changes.wallet.newValue && !changes.wallet.oldValue) {
        } else if (!changes.wallet.newValue && changes.wallet.oldValue) {
        }
    }
});


chrome.runtime.onConnect.addListener((port) => {
    
    port.onDisconnect.addListener(() => {
        // Popup close should NOT lock wallet
        // Only Chrome shutdown should lock wallet
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.set({ 
        chromeRestarted: true
    });
});

chrome.runtime.onSuspend.addListener(() => {
    chrome.storage.local.set({ chromeRestarted: true });
});

self.addEventListener('error', (event) => {
});

self.addEventListener('unhandledrejection', (event) => {
});

const dappConnections = new Map(); // origin -> { connected: boolean, address: string, permissions: [] }
const pendingRequests = new Map(); // requestId -> { resolve, reject, data }

/**
 * Handle DApp messages from content scripts
 */
async function handleDAppMessage(message, sender, sendResponse) {
    const { data, origin, hostname } = message;
    const { method, params, requestId } = data;
    

    
    try {
        let result;
        
        switch (method) {
            case 'ping':
                result = await handleDAppPing(origin);
                break;
                
            case 'connect':
                result = await handleDAppConnect(origin, hostname);
                break;
                
            case 'disconnect':
                result = await handleDAppDisconnect(origin);
                break;
                
            case 'getWalletInfo':
                result = await handleDAppGetWalletInfo(origin);
                break;
                
            case 'getBalance':
                result = await handleDAppGetBalance(origin);
                break;
                
            case 'get_network_info':
                result = await handleDAppGetNetworkInfo(origin);
                break;
                
            case 'register_dapp':
                result = await handleDAppRegister(origin, params);
                break;
                
            case 'getConnectionStatus':
                result = await handleDAppGetConnectionStatus(origin);
                break;
                
            case 'get_balance':
                result = await handleDAppGetBalance(origin);
                break;
                
            default:
                throw new Error(`Unknown method: ${method}`);
        }
        
        sendResponse({
            success: true,
            data: result
        });
        
    } catch (error) {

        sendResponse({
            success: false,
            error: error.message
        });
    }
}

/**
 * Handle DApp ping request
 */
async function handleDAppPing(origin) {

    const activeWallet = await getActiveWallet();
    
    return {
        available: true,
        hasActiveWallet: !!activeWallet,
        walletAddress: activeWallet ? activeWallet.address : null
    };
}

/**
 * Handle DApp registration
 */
async function handleDAppRegister(origin, params) {

    const dappInfo = {
        origin,
        appName: params.appName || 'Unknown DApp',
        appDescription: params.appDescription || '',
        appVersion: params.appVersion || '1.0.0',
        requiredPermissions: params.requiredPermissions || [],
        registeredAt: Date.now()
    };
    
    try {
        const key = `dapp_${btoa(origin).replace(/[^a-zA-Z0-9]/g, '_')}`;
        await chrome.storage.local.set({ [key]: dappInfo });
        
        return {
            registered: true,
            appName: dappInfo.appName,
            permissions: dappInfo.requiredPermissions,
            supportedFeatures: ['connect', 'disconnect', 'getBalance', 'getWalletInfo', 'ping']
        };
    } catch (error) {

        throw new Error('Failed to register DApp');
    }
}

/**
 * Handle DApp connection request
 */
async function handleDAppConnect(origin, hostname) {

    
    try {
        const activeWallet = await getActiveWallet();
        if (!activeWallet) {
            throw new Error('No active wallet found. Please unlock your wallet first.');
        }
        
        const existingConnection = dappConnections.get(origin);
        if (existingConnection && existingConnection.connected) {
            if (activeWallet.address === existingConnection.address) {
                let balanceToReturn = existingConnection.balance;
                if (typeof balanceToReturn === 'string' || typeof balanceToReturn === 'number') {
                    const balanceValue = parseFloat(balanceToReturn) || 0;
                    balanceToReturn = {
                        public: balanceValue,
                        private: 0,
                        total: balanceValue,
                        currency: 'OCT'
                    };
                }

                return {
                    address: existingConnection.address,
                    balance: balanceToReturn
                };
            } else {
                dappConnections.delete(origin);
                await chrome.storage.local.remove(`dapp_connection_${origin}`);
                }
        }
        
        const isAllowed = true; 
        
        if (isAllowed) {
            let realBalance = 0;
            try {
                const balanceResponse = await fetch(`https://octra.network/balance/${activeWallet.address}`);
                if (balanceResponse.ok) {
                    const balanceData = await balanceResponse.json();
                    realBalance = balanceData.balance || 0;

                } else {

                }
            } catch (error) {

            }
            
            const balanceValue = parseFloat(realBalance) || 0;
            const formattedBalance = {
                public: balanceValue,
                private: 0,
                total: balanceValue,
                currency: 'OCT'
            };

            const connection = {
                connected: true,
                address: activeWallet.address,
                balance: formattedBalance,
                connectedAt: Date.now(),
                hostname: hostname,
                permissions: ['read_address', 'read_balance']
            };

            dappConnections.set(origin, connection);

            await chrome.storage.local.set({
                [`dapp_connection_${origin}`]: connection
            });

            return {
                address: activeWallet.address,
                balance: formattedBalance
            };
        } else {
            throw new Error('DApp connection approval not implemented for non-localhost origins');
        }
        
    } catch (error) {

        throw error;
    }
}

/**
 * Handle DApp disconnection
 */
async function handleDAppDisconnect(origin) {
    dappConnections.delete(origin);
    await chrome.storage.local.remove(`dapp_connection_${origin}`);
    return true;
}

/**
 * Handle get connection status request
 */
async function handleDAppGetConnectionStatus(origin) {

    
    try {
        let connection = dappConnections.get(origin);
        
        if (!connection) {
            const storedConnection = await chrome.storage.local.get(`dapp_connection_${origin}`);
            connection = storedConnection[`dapp_connection_${origin}`];
            
            if (connection) {
                dappConnections.set(origin, connection);
            }
        }
        
        if (!connection || !connection.connected) {
            return {
                isConnected: false,
                address: null,
                balance: 0
            };
        }
        const activeWallet = await getActiveWallet();
        if (!activeWallet || activeWallet.address !== connection.address) {
            dappConnections.delete(origin);
            await chrome.storage.local.remove(`dapp_connection_${origin}`);
            
            return {
                isConnected: false,
                address: null,
                balance: 0
            };
        }
        
        let currentBalance = connection.balance || 0;
        try {
            const balanceResponse = await fetch(`https://octra.network/balance/${connection.address}`);
            if (balanceResponse.ok) {
                const balanceData = await balanceResponse.json();
                currentBalance = balanceData.balance || 0;
                connection.balance = currentBalance;
                dappConnections.set(origin, connection);
                await chrome.storage.local.set({
                    [`dapp_connection_${origin}`]: connection
                });
            }
        } catch (error) {

        }
        
        // Format balance according to SDK specification
        const balanceValue = parseFloat(currentBalance) || 0;
        const formattedBalance = {
            public: balanceValue,
            private: 0,
            total: balanceValue,
            currency: 'OCT'
        };

        return {
            isConnected: true,
            address: connection.address,
            balance: formattedBalance,
            connectedAt: connection.connectedAt,
            permissions: connection.permissions
        };
        
    } catch (error) {

        return {
            isConnected: false,
            address: null,
            balance: 0
        };
    }
}

/**
 * Handle get wallet info request
 */
async function handleDAppGetWalletInfo(origin) {

    
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        throw new Error('DApp not connected');
    }
    
    const activeWallet = await getActiveWallet();
    if (!activeWallet) {
        throw new Error('No active wallet found');
    }
    
    let realBalance = 0;
    try {
        const balanceResponse = await fetch(`https://octra.network/balance/${activeWallet.address}`);
        if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            realBalance = balanceData.balance || 0;
        }
    } catch (error) {

    }
    
    const balanceValue = parseFloat(realBalance) || 0;
    const formattedBalance = {
        public: balanceValue,
        private: 0,
        total: balanceValue,
        currency: 'OCT'
    };

    return {
        address: activeWallet.address,
        balance: formattedBalance,
        privateBalance: 0 // Private balance requires decryption, not implemented for DApp
    };
}

/**
 * Handle get balance request
 */
async function handleDAppGetBalance(origin) {

    
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        throw new Error('DApp not connected');
    }
    
    const activeWallet = await getActiveWallet();
    if (!activeWallet) {
        throw new Error('No active wallet found');
    }
    
    let realBalance = 0;
    try {
        const balanceResponse = await fetch(`https://octra.network/balance/${activeWallet.address}`);
        if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            realBalance = balanceData.balance || 0;
        }
    } catch (error) {

    }
    
    const balanceValue = parseFloat(realBalance) || 0;
    const formattedBalance = {
        public: balanceValue,
        private: 0,
        total: balanceValue,
        currency: 'OCT'
    };

    return {
        balance: formattedBalance,
        privateBalance: 0 // Private balance requires decryption, not implemented for DApp
    };
}

/**
 * Get active wallet from storage
 */
async function getActiveWallet() {
    try {
        const result = await chrome.storage.local.get(['activeWalletId', 'encryptedWallets', 'sessionKey', 'walletUnlocked', 'lastUnlockTime']);
        
        
        if (!result.activeWalletId) {

            return null;
        }
        
        let walletsArray;
        if (Array.isArray(result.encryptedWallets)) {
            // Direct array format: encryptedWallets = [wallet1, wallet2, ...]
            walletsArray = result.encryptedWallets;
        } else if (result.encryptedWallets && result.encryptedWallets.wallets) {
            // Object format: encryptedWallets = { wallets: [wallet1, wallet2, ...] }
            walletsArray = result.encryptedWallets.wallets;
        } else {

            return null;
        }
        
        if (!walletsArray || walletsArray.length === 0) {

            return null;
        }
        
        const activeWalletData = walletsArray.find(w => w.id === result.activeWalletId);
        
        if (!activeWalletData) {

            return null;
        }
        
        const now = Date.now();
        const sessionExpiry = 30 * 60 * 1000;

        const hasPasswordProtection = await checkPasswordProtection();
        const sessionValid = result.walletUnlocked && 
                            result.lastUnlockTime && 
                            (now - result.lastUnlockTime < sessionExpiry);
        
        const passwordSkipped = await checkPasswordSkipped();
        
        if (hasPasswordProtection && !sessionValid && !passwordSkipped) {

            return null;
        }
        
        return {
            id: activeWalletData.id,
            address: activeWalletData.address,
            name: activeWalletData.name || 'Wallet'
        };
        
    } catch (error) {

        return null;
    }
}

/**
 * Check if password protection is enabled
 */
async function checkPasswordProtection() {
    try {
        const result = await chrome.storage.local.get(['hashedPassword', 'passwordSkipped']);
        return !!result.hashedPassword && !result.passwordSkipped;
    } catch (error) {

        return false;
    }
}

/**
 * Check if password was skipped (no-password mode)
 */
async function checkPasswordSkipped() {
    try {
        const result = await chrome.storage.local.get(['passwordSkipped']);
        return !!result.passwordSkipped;
    } catch (error) {

        return false;
    }
}

/**
 * Handle get network info request
 */
async function handleDAppGetNetworkInfo(origin) {

    
    try {
        const result = await chrome.storage.local.get(['octra_current_network', 'octra_custom_network_config']);
        const currentNetworkId = result.octra_current_network || 'testnet';
        const customConfig = result.octra_custom_network_config;
        
        const networks = {
            testnet: {
                id: 'testnet',
                name: 'Testnet',
                rpc_url: 'https://octra.network',
                explorer_url: 'https://octrascan.io/tx',
                explorer_address_url: 'https://octrascan.io/addr',
                color: '#f59e0b'
            },
            custom: customConfig ? {
                id: 'custom',
                name: customConfig.name || 'Custom Network',
                rpc_url: customConfig.rpc_url || '',
                explorer_url: customConfig.explorer_url || '',
                explorer_address_url: customConfig.explorer_address_url || '',
                color: '#8b5cf6'
            } : {
                id: 'custom',
                name: 'Custom Network',
                rpc_url: '',
                explorer_url: '',
                explorer_address_url: '',
                color: '#8b5cf6'
            }
        };
        
        const networkConfig = networks[currentNetworkId];
        if (!networkConfig) {
            throw new Error(`Network configuration not found: ${currentNetworkId}`);
        }
        
        return networkConfig;
        
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
 * Clean up stale DApp connections on startup
 * Only remove expired or invalid connections, don't auto-restore
 * Connections are only restored when DApps with proper SDK signatures request them
 */
async function cleanupDAppConnections() {
    try {
        const result = await chrome.storage.local.get();
        const connectionKeys = Object.keys(result).filter(key => key.startsWith('dapp_connection_'));
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        
        for (const key of connectionKeys) {
            const origin = key.replace('dapp_connection_', '');
            const connection = result[key];
            if (!connection || !connection.connected || !connection.connectedAt || (now - connection.connectedAt > maxAge)) {
                await chrome.storage.local.remove(key);

            }
        }
        
    } catch (error) {

    }
}

cleanupDAppConnections();

let keepAliveInterval;

let pendingTransactions = new Map(); 

/**
 * Keep the service worker alive by setting up periodic tasks
 */
function setupKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    keepAliveInterval = setInterval(() => {
        chrome.storage.local.get('extension_version').then(() => {
        });
        
    }, 30000); // Every 30 seconds
    

}

/**
 * Transaction tracking and management
 */

const TX_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing', 
    RETRYING: 'retrying',
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

/**
 * Create a new tracked transaction
 */
async function createTransaction(txData) {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transaction = {
        id: txId,
        type: txData.type || 'private_transfer',
        from: txData.from,
        to: txData.to,
        amount: txData.amount,
        status: TX_STATUS.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attempts: 0,
        maxRetries: 3,
        lastError: null,
        txHash: null,
        recipientPublicKey: txData.recipientPublicKey,
        fromPrivateKey: txData.fromPrivateKey,
        isBulk: txData.isBulk || false,
        bulkId: txData.bulkId || null
    };
    
    pendingTransactions.set(txId, transaction);
    
    await saveTransactionToStorage(transaction);
    

    return transaction;
}

/**
 * Update transaction status
 */
async function updateTransactionStatus(txId, status, additionalData = {}) {
    const tx = pendingTransactions.get(txId);
    if (!tx) {
        return;
    }
    
    tx.status = status;
    tx.updatedAt = Date.now();
    
    Object.assign(tx, additionalData);
    
    await saveTransactionToStorage(tx);
    
    if ([TX_STATUS.SUCCESS, TX_STATUS.FAILED, TX_STATUS.CANCELLED].includes(status)) {
        pendingTransactions.delete(txId);
    }
    
    chrome.runtime.sendMessage({
        type: 'TRANSACTION_STATUS_UPDATE',
        data: { txId, status, transaction: tx }
    }).catch(() => {
    });
    

}

/**
 * Save transaction to chrome storage
 */
async function saveTransactionToStorage(transaction) {
    try {
        const result = await chrome.storage.local.get(['pending_transactions', 'transaction_history']);
        
        const pendingTxs = result.pending_transactions || {};
        const history = result.transaction_history || [];
        
        if (transaction.status === TX_STATUS.SUCCESS || transaction.status === TX_STATUS.FAILED || transaction.status === TX_STATUS.CANCELLED) {
            const historyTx = {
                ...transaction,
                completedAt: Date.now()
            };
            
            history.unshift(historyTx);
            if (history.length > 100) {
                history.splice(100);
            }
            
            delete pendingTxs[transaction.id];
            
            await chrome.storage.local.set({
                pending_transactions: pendingTxs,
                transaction_history: history
            });
        } else {
            pendingTxs[transaction.id] = transaction;
            await chrome.storage.local.set({ pending_transactions: pendingTxs });
        }
        
    } catch (error) {

    }
}

/**
 * Load pending transactions from storage on startup
 */
async function loadPendingTransactions() {
    try {
        const result = await chrome.storage.local.get(['pending_transactions']);
        const pendingTxs = result.pending_transactions || {};
        
        const cleanupNeeded = [];
        
        for (const [txId, transaction] of Object.entries(pendingTxs)) {
            if (transaction.status === TX_STATUS.CANCELLED || 
                transaction.status === TX_STATUS.SUCCESS || 
                transaction.status === TX_STATUS.FAILED) {
                
                cleanupNeeded.push(transaction);
                continue;
            }
            
            pendingTransactions.set(txId, transaction);
            
            if (transaction.status === TX_STATUS.PROCESSING || transaction.status === TX_STATUS.RETRYING) {

                processTransactionInBackground(transaction);
            }
        }
        
        if (cleanupNeeded.length > 0) {

            for (const transaction of cleanupNeeded) {
                await saveTransactionToStorage(transaction);
            }
        }
        

    } catch (error) {

    }
}

/**
 * Process transaction in background
 */
async function processTransactionInBackground(transaction) {
    const isBulkPrivate = transaction.isBulk && transaction.type === 'private_transfer';
    
    if (isBulkPrivate) {
    }
    
    try {
        await updateTransactionStatus(transaction.id, TX_STATUS.PROCESSING);
        
        if (isBulkPrivate) {

        }
        
        const result = await makePrivateTransferRequest(transaction);
        
        if (isBulkPrivate) {
        }
        
        if (result.success) {
            if (isBulkPrivate) {

            }
            
            await updateTransactionStatus(transaction.id, TX_STATUS.SUCCESS, {
                txHash: result.txHash
            });
        } else {
            if (isBulkPrivate) {

            } else {

            }
            
            const isBulkPrivateTransfer = transaction.isBulk && transaction.type === 'private_transfer';
            const retryEnabled = isBulkPrivateTransfer ? 
                self.OctraConfig.TRANSACTION.BULK_PRIVATE_TRANSFER.ENABLE_RETRY : 
                true;
            
            if (!retryEnabled) {
                
                await updateTransactionStatus(transaction.id, TX_STATUS.FAILED, {
                    lastError: `Bulk private transfer failed: ${result.error}`
                });
                return;
            }
            
            const isDuplicateError = result.error && (
                result.error.includes('Duplicate transaction') || 
                result.error.includes('already exists') ||
                result.error.includes('already processed') ||
                (result.error.includes('HTTP 400') && result.error.includes('duplicate'))
            );
            
            if (isDuplicateError && transaction.attempts < transaction.maxRetries) {
                
                await updateTransactionStatus(transaction.id, TX_STATUS.RETRYING, {
                    attempts: transaction.attempts + 1,
                    lastError: result.error
                });
                
                const delay = 2000 * Math.pow(2, transaction.attempts);
                setTimeout(() => {
                    transaction.attempts = transaction.attempts + 1;
                    processTransactionInBackground(transaction);
                }, delay);
            } else {
                const finalError = transaction.attempts >= transaction.maxRetries ? 
                    `Max retries exceeded: ${result.error}` : result.error;
                    

                
                await updateTransactionStatus(transaction.id, TX_STATUS.FAILED, {
                    lastError: finalError
                });
            }
        }
        
    } catch (error) {

        await updateTransactionStatus(transaction.id, TX_STATUS.FAILED, {
            lastError: error.message
        });
    }
}

/**
 * Get current network URL from storage using centralized config
 */
async function getCurrentNetworkUrl() {
    try {
        const result = await chrome.storage.local.get(['octra_current_network', 'octra_custom_network_config']);
        const currentNetworkId = result.octra_current_network || 'testnet';
        
        if (currentNetworkId === 'testnet') {
            return 'https://octra.network';
        } else if (currentNetworkId === 'custom') {
            const customConfig = result.octra_custom_network_config;
            if (customConfig && customConfig.rpc_url) {
                return customConfig.rpc_url;
            } else {

                return 'https://octra.network';
            }
        } else {

            return 'https://octra.network';
        }
    } catch (error) {

        return 'https://octra.network';
    }
}

/**
 * Make private transfer request via background network call
 */
async function makePrivateTransferRequest(transaction) {
    try {
        
        const currentNetworkUrl = await getCurrentNetworkUrl();
        
        const requestBody = {
            from: transaction.from,
            to: transaction.to,
            amount: Math.trunc(transaction.amount * 1000000).toString(),
            from_private_key: transaction.fromPrivateKey,
            to_public_key: transaction.recipientPublicKey
        };
        
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, self.OctraConfig.NETWORK.REQUEST_TIMEOUT);
        
        const response = await fetch(`${currentNetworkUrl}/private_transfer`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'OctraWallet/1.0.0'
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });
        
        clearTimeout(timeoutId);

        const responseText = await response.text();
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            data = { text: responseText };
        }
        
        if (response.ok) {
            if (data.success || data.txHash || data.tx_hash || responseText.includes('Transaction') || response.status === 200) {
                const txHash = data.txHash || data.tx_hash || data.hash || 'background_' + Date.now();
                return { success: true, txHash: txHash };
            } else {
                return { success: false, error: data.error || data.message || `Unexpected response format: ${responseText}` };
            }
        } else {
            return { success: false, error: data.error || data.message || `HTTP ${response.status}: ${responseText}` };
        }
        
    } catch (error) {
        
        if (error.name === 'AbortError') {
            return { success: false, error: `Request timeout after ${self.OctraConfig.NETWORK.REQUEST_TIMEOUT / 1000} seconds` };
        }
        
        return { success: false, error: error.message };
    }
}

/**
 * Handle messages from popup about retry queue management
 */
function handleRetryQueueMessage(message, sendResponse) {
    switch (message.action) {
            
        case 'GET_RETRY_QUEUE_STATUS':
            sendResponse({ 
                success: true, 
                queueLength: 0,
                items: []
            });
            break;
            
        case 'CLEAR_RETRY_QUEUE':
            sendResponse({ success: true });
            break;
            
        default:
            sendResponse({ success: false, error: 'Unknown retry queue action' });
    }
}

/**
 * Handle transaction management messages
 */
function handleTransactionMessage(message, sendResponse) {
    switch (message.action) {
        case 'CREATE_TRANSACTION':
            createTransaction(message.data).then(tx => {
                sendResponse({ success: true, transaction: tx });
                
                processTransactionInBackground(tx);
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true;
            
        case 'GET_PENDING_TRANSACTIONS':
            const pending = Array.from(pendingTransactions.values());
            sendResponse({ success: true, transactions: pending });
            break;
            
        case 'GET_TRANSACTION_HISTORY':
            chrome.storage.local.get(['transaction_history']).then(result => {
                const history = result.transaction_history || [];
                sendResponse({ success: true, history });
            });
            return true;
            
        case 'CANCEL_TRANSACTION':
            const txId = message.data.txId;
            
            if (pendingTransactions.has(txId)) {
                updateTransactionStatus(txId, TX_STATUS.CANCELLED);
                sendResponse({ success: true, found: true });
            } else {
                sendResponse({ success: false, found: false, reason: 'Transaction not in background queue' });
            }
            break;
            
        default:
            sendResponse({ success: false, error: 'Unknown transaction action' });
    }
}
loadPendingTransactions();
setupKeepAlive();