/**
 * Main popup script for 0xio Wallet Extension
 * Initializes the UI when the popup is opened
 */

let uiManager = null;

/**
 * Initialize the extension popup
 */
async function initializePopup() {
    try {
        const domReady = await window.domUtils.waitForDOMReady();
        
        const port = chrome.runtime.connect({ name: "popup" });
        window.backgroundPort = port;
        
        const shouldLock = await checkWalletLockStatus();
        
        if (shouldLock) {
            await chrome.storage.local.remove(['walletUnlocked', 'lastUnlockTime']);
        }
        
        await window.moduleLoader.loadModules();
        
        uiManager = new UIManager();
        
        const modules = window.moduleLoader.initializeModules(uiManager);
        
        uiManager.modules = modules;
        
        await uiManager.init();
        
        window.ui = uiManager;
        window.uiManager = uiManager; 
        
    } catch (error) {
        document.body.innerHTML = `
            <div style="text-align: center; padding: 20px; max-width: 340px; margin: 0 auto;">
                <h2 style="color: var(--error-color); margin-bottom: 20px;">Startup Error</h2>
                <p style="color: var(--text-muted); margin-bottom: 20px; line-height: 1.5;">
                    Failed to initialize the 0xio Wallet extension. Please try reloading the extension or restarting your browser.
                </p>
                <div style="background: var(--glass-bg); padding: 15px; border-radius: 8px; border-left: 4px solid var(--error-color);">
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px; text-align: left;">
                        <strong>Error:</strong> ${error.message}
                    </p>
                </div>
                <div style="margin-top: 20px;">
                    <button id="reload-extension-btn" style="background: var(--primary-color); color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                        Reload Extension
                    </button>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            const reloadBtn = document.getElementById('reload-extension-btn');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => {
                    window.location.reload();
                });
            }
        }, 100);
    }
}

/**
 * Check if wallet should be locked based on Chrome restart only
 */
async function checkWalletLockStatus() {
    try {
        const storage = await chrome.storage.local.get(['chromeRestarted']);
        
        if (storage.chromeRestarted) {
            await chrome.storage.local.remove(['chromeRestarted']);
            
            return true; 
        }
        
        return false; 
    } catch (error) {
        return false;
    }
}

/**
 * Handle extension popup close
 */
function handlePopupClose() {
    if (uiManager) {
        if (uiManager.isLoading) {
            uiManager.hideLoading();
        }
    }
    
    if (window.domUtils) {
        window.domUtils.cleanup();
    }
    
    if (window.backgroundPort) {
        window.backgroundPort.disconnect();
    }
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcuts(event) {
    if (event.key === 'Escape') {
        if (uiManager) {
            uiManager.hideMessage();
            uiManager.hideLoading();
        }
    }
    
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        if (uiManager && uiManager.wallet.isReady()) {
            uiManager.refreshBalance();
        }
    }
    
    if ((event.ctrlKey || event.metaKey) && event.key === 'c' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        if (uiManager && uiManager.currentScreen === 'wallet-screen') {
            event.preventDefault();
            uiManager.copyAddress();
        }
    }
}

/**
 * Check if required libraries are loaded
 */
function checkLibraries() {
    const required = ['nacl', 'DOMUtils', 'CryptoManager', 'NetworkClient', 'OctraWallet', 'UIManager'];
    const missing = [];
    
    for (const lib of required) {
        if (typeof window[lib] === 'undefined') {
            missing.push(lib);
        }
    }
    
    if (missing.length > 0) {
        throw new Error(`Missing required libraries: ${missing.join(', ')}`);
    }
    
    if (!window.domUtils) {
        window.domUtils = new DOMUtils();
    }
}

/**
 * Setup global error handlers
 */
function setupErrorHandlers() {
    window.addEventListener('unhandledrejection', (event) => {
        event.preventDefault();
        
        if (uiManager) {
            try {
                uiManager.hideLoading();
                uiManager.showMessage('Error', `Unexpected error: ${event.reason?.message || 'Unknown error'}`, 'error');
            } catch (errorHandlingError) {
            }
        }
    });

    window.addEventListener('error', (event) => {
        event.preventDefault();
        
        if (uiManager) {
            try {
                uiManager.hideLoading();
                
                const errorMsg = event.error?.message || event.message || 'Unknown error occurred';
                uiManager.showMessage('Error', `Application error: ${errorMsg}`, 'error');
            } catch (errorHandlingError) {
            }
        }
        
        setTimeout(() => {
            if (document.body.innerHTML.trim() === '' || !document.querySelector('.screen:not(.hidden)')) {
                window.location.reload();
            }
        }, 1000);
    });
}

/**
 * Wait for DOM to be ready
 */
function waitForDOM() {
    return new Promise((resolve) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve);
        } else {
            resolve();
        }
    });
}

/**
 * Main initialization function
 */
async function main() {
    try {
        await waitForDOM();
        checkLibraries();
        setupErrorHandlers();
        document.addEventListener('keydown', handleKeyboardShortcuts);
        window.addEventListener('beforeunload', handlePopupClose);
        await initializePopup();
        
    } catch (error) {
        document.body.innerHTML = `
            <div style="text-align: center; padding: 20px; max-width: 340px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <h2 style="color: var(--error-color); margin-bottom: 20px; font-size: 18px;">Startup Error</h2>
                <p style="color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; font-size: 14px;">
                    The 0xio Wallet extension failed to start. Check the console for detailed error information.
                </p>
                <div style="background: var(--glass-bg); padding: 15px; border-radius: 8px; border-left: 4px solid var(--error-color); margin-bottom: 20px;">
                    <p style="margin: 0; color: var(--text-secondary); font-size: 12px; text-align: left; word-break: break-word;">
                        <strong>Error:</strong> ${error.message}
                    </p>
                </div>
                <div style="margin-top: 20px;">
                    <button id="reload-extension-btn-2" style="background: var(--primary-color); color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Reload Extension
                    </button>
                </div>
                <div style="margin-top: 10px;">
                    <button id="clear-console-btn" style="background: var(--success-color); color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                        Clear Console & Retry
                    </button>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            const reloadBtn2 = document.getElementById('reload-extension-btn-2');
            if (reloadBtn2) {
                reloadBtn2.addEventListener('click', () => {
                    window.location.reload();
                });
            }
            
            const clearBtn = document.getElementById('clear-console-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    window.location.reload();
                });
            }
        }, 100);
    }
}

main(); 