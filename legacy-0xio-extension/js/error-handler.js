/**
 * Global Error Handler for Octra Extension
 * Provides comprehensive error boundaries and recovery mechanisms
 */

class ErrorHandler {
    constructor() {
        this.isInitialized = false;
        this.errorQueue = [];
        this.maxErrors = 10;
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.listeners = new Set();
        this.isHandlingError = false;
        this.lastErrorTime = 0;
        this.errorSpamThreshold = 100;
        
        this.init();
    }

    /**
     * Initialize global error handling
     */
    init() {
        if (this.isInitialized) return;
        window.addEventListener('error', (event) => {
            this.handleGlobalError({
                type: 'javascript',
                error: event.error,
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack,
                timestamp: Date.now()
            });
        });
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError({
                type: 'promise',
                error: event.reason,
                message: event.reason?.message || 'Unhandled promise rejection',
                stack: event.reason?.stack,
                promise: event.promise,
                timestamp: Date.now()
            });
            event.preventDefault();
        });
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'error') {
                    this.handleExtensionError(message.error);
                }
            });
        }

        this.isInitialized = true;
    }

    /**
     * Handle global errors with recovery attempts
     * @param {Object} errorInfo
     */
    handleGlobalError(errorInfo) {
        const now = Date.now();
        if (this.isHandlingError || (now - this.lastErrorTime) < this.errorSpamThreshold) {
            return; 
        }
        if (this.isExpectedError(errorInfo)) {
            return;
        }
        
        this.isHandlingError = true;
        this.lastErrorTime = now;
        
        try {
            this.errorQueue.push(errorInfo);
            if (this.errorQueue.length > this.maxErrors) {
                this.errorQueue.shift(); 
            }
            this.notifyListeners(errorInfo);
            this.attemptRecovery(errorInfo);
            this.logError(errorInfo);
        } finally {
            setTimeout(() => {
                this.isHandlingError = false;
            }, this.errorSpamThreshold);
        }
    }

    /**
     * Handle extension-specific errors
     * @param {Error} error
     */
    handleExtensionError(error) {
        this.handleGlobalError({
            type: 'extension',
            error: error,
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
        });
    }

    /**
     * Attempt error recovery based on error type and context
     * @param {Object} errorInfo
     */
    attemptRecovery(errorInfo) {
        const errorKey = this.getErrorKey(errorInfo);
        const attempts = this.retryAttempts.get(errorKey) || 0;
        
        if (attempts >= this.maxRetries) {
            this.showCriticalError(errorInfo);
            return;
        }

        this.retryAttempts.set(errorKey, attempts + 1);
        try {
            if (this.isNetworkError(errorInfo)) {
                this.recoverFromNetworkError(errorInfo);
            } else if (this.isDOMError(errorInfo)) {
                this.recoverFromDOMError(errorInfo);
            } else if (this.isStorageError(errorInfo)) {
                this.recoverFromStorageError(errorInfo);
            } else if (this.isWalletError(errorInfo)) {
                this.recoverFromWalletError(errorInfo);
            } else {
                this.fallbackRecovery(errorInfo);
            }
        } catch (recoveryError) {
            this.showCriticalError(errorInfo);
        }
    }

    /**
     * Recovery from network-related errors
     * @param {Object} errorInfo
     */
    recoverFromNetworkError(errorInfo) {
        if (window.networkClient) {
            setTimeout(() => {
                window.networkClient.resetConnection?.();
            }, 1000);
        }
        this.showErrorMessage('Network Error', 'Connection issue detected. Retrying...', 'warning');
    }

    /**
     * Recovery from DOM-related errors
     * @param {Object} errorInfo
     */
    recoverFromDOMError(errorInfo) {
        if (window.domUtils) {
            setTimeout(async () => {
                await window.domUtils.waitForDOMReady();
            }, 500);
        }
        this.showErrorMessage('Interface Error', 'Interface loading issue. Please refresh if problems persist.', 'warning');
    }

    /**
     * Recovery from storage-related errors
     * @param {Object} errorInfo
     */
    recoverFromStorageError(errorInfo) {
        if (window.walletStorage) {
            setTimeout(() => {
                window.walletStorage.clearCache?.();
            }, 100);
        }

        this.showErrorMessage('Storage Error', 'Storage issue detected. Data may need to be refreshed.', 'warning');
    }

    /**
     * Recovery from wallet-related errors
     * @param {Object} errorInfo
     */
    recoverFromWalletError(errorInfo) {
        if (window.walletManager) {
            setTimeout(() => {
                window.walletManager.resetState?.();
            }, 100);
        }

        this.showErrorMessage('Wallet Error', 'Wallet operation failed. Please try again.', 'error');
    }

    /**
     * Fallback recovery for unknown errors
     * @param {Object} errorInfo
     */
    fallbackRecovery(errorInfo) {
        setTimeout(() => {
            if (window.uiManager) {
                window.uiManager.refreshCurrentScreen?.();
            }
        }, 1000);

        this.showErrorMessage('Unexpected Error', 'An unexpected error occurred. The application is attempting to recover.', 'error');
    }

    /**
     * Show critical error that cannot be recovered
     * @param {Object} errorInfo
     */
    showCriticalError(errorInfo) {
        const message = `Critical Error: ${errorInfo.message}\n\nPlease refresh the extension. If the problem persists, contact support.`;
        
        if (window.uiManager && window.uiManager.showMessage) {
            window.uiManager.showMessage('Critical Error', message, 'error');
        } else {
            alert(message);
        }
    }

    /**
     * Show error message to user
     * @param {string} title
     * @param {string} message
     * @param {string} type
     */
    showErrorMessage(title, message, type = 'error') {
        if (window.uiManager && window.uiManager.showMessage) {
            window.uiManager.showMessage(title, message, type);
        }
    }

    /**
     * Check if error is expected and shouldn't show popup
     * @param {Object} errorInfo
     * @returns {boolean}
     */
    isExpectedError(errorInfo) {
        const message = errorInfo.message?.toLowerCase() || '';
        const stack = errorInfo.stack?.toLowerCase() || '';
        if (message.includes('staging') && (message.includes('null') || message.includes('failed'))) {
            return true;
        }
        if (stack.includes('getstagingransactions') || stack.includes('staging')) {
            return true;
        }
        if (message.includes('400') || message.includes('500')) {
            return true;
        }
        
        return false;
    }

    /**
     * Error type detection methods
     */
    isNetworkError(errorInfo) {
        const message = errorInfo.message?.toLowerCase() || '';
        if (message.includes('staging') || message.includes('null')) {
            return false;
        }
        
        return message.includes('network error') || 
               message.includes('fetch failed') || 
               message.includes('timeout') ||
               message.includes('502') ||
               message.includes('503') ||
               (message.includes('connection') && !message.includes('null'));
    }

    isDOMError(errorInfo) {
        const message = errorInfo.message?.toLowerCase() || '';
        return message.includes('element') ||
               message.includes('dom') ||
               message.includes('not found') ||
               message.includes('queryselector') ||
               message.includes('getelementby');
    }

    isStorageError(errorInfo) {
        const message = errorInfo.message?.toLowerCase() || '';
        return message.includes('storage') ||
               message.includes('quota') ||
               message.includes('localstorage') ||
               message.includes('chrome.storage');
    }

    isWalletError(errorInfo) {
        const message = errorInfo.message?.toLowerCase() || '';
        return message.includes('wallet') ||
               message.includes('private key') ||
               message.includes('signature') ||
               message.includes('transaction');
    }

    /**
     * Generate unique error key for retry tracking
     * @param {Object} errorInfo
     * @returns {string}
     */
    getErrorKey(errorInfo) {
        return `${errorInfo.type}_${errorInfo.message?.substring(0, 50) || 'unknown'}`;
    }

    /**
     * Log error for debugging
     * @param {Object} errorInfo
     */
    logError(errorInfo) {
        const logEntry = {
            timestamp: new Date(errorInfo.timestamp).toISOString(),
            type: errorInfo.type,
            message: errorInfo.message,
            stack: errorInfo.stack,
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['errorLogs'], (result) => {
                const logs = result.errorLogs || [];
                logs.push(logEntry);
                if (logs.length > 50) {
                    logs.splice(0, logs.length - 50);
                }
                
                chrome.storage.local.set({ errorLogs: logs });
            });
        }

    }

    /**
     * Add error event listener
     * @param {Function} listener
     */
    addListener(listener) {
        this.listeners.add(listener);
    }

    /**
     * Remove error event listener
     * @param {Function} listener
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    /**
     * Notify all listeners of error
     * @param {Object} errorInfo
     */
    notifyListeners(errorInfo) {
        for (const listener of this.listeners) {
            try {
                listener(errorInfo);
            } catch (listenerError) {
            }
        }
    }

    /**
     * Get recent errors for debugging
     * @returns {Array}
     */
    getRecentErrors() {
        return [...this.errorQueue];
    }

    /**
     * Clear error history
     */
    clearErrors() {
        this.errorQueue = [];
        this.retryAttempts.clear();
    }

    /**
     * Wrapped function execution with error boundary
     * @param {Function} fn
     * @param {Object} context
     * @param {Array} args
     * @returns {Promise}
     */
    async safeExecute(fn, context = null, ...args) {
        try {
            if (typeof fn !== 'function') {
                throw new Error('safeExecute: First argument must be a function');
            }
            
            const result = await fn.apply(context, args);
            return { success: true, result };
        } catch (error) {
            this.handleGlobalError({
                type: 'safe_execute',
                error: error,
                message: error.message,
                stack: error.stack,
                function: fn.name || 'anonymous',
                timestamp: Date.now()
            });
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Create error boundary wrapper for async operations
     * @param {Function} asyncFn
     * @param {Object} options
     * @returns {Function}
     */
    createAsyncBoundary(asyncFn, options = {}) {
        const { 
            retries = 1, 
            delay = 1000, 
            fallback = null,
            onError = null
        } = options;
        
        return async (...args) => {
            let lastError;
            
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    return await asyncFn(...args);
                } catch (error) {
                    lastError = error;
                    
                    if (onError) {
                        onError(error, attempt);
                    }
                    
                    if (attempt < retries) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }
            }
            this.handleGlobalError({
                type: 'async_boundary',
                error: lastError,
                message: lastError.message,
                stack: lastError.stack,
                retries: retries,
                timestamp: Date.now()
            });
            
            if (fallback) {
                return fallback(lastError);
            }
            
            throw lastError;
        };
    }
}
window.errorHandler = new ErrorHandler();
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
} 