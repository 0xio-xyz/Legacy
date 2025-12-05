/**
 * Screen Navigator Module
 * Handles screen transitions, navigation, and screen-specific content updates
 */

class ScreenNavigatorModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.currentScreen = null;
        this.connectionIndicator = null;
    }

    /**
     * Initialize screen navigation functionality
     */
    init() {
        this.initializeFloatingConnectionIndicator();
        this.currentScreen = 'main-screen';
    }

    /**
     * Show a specific screen
     * @param {string} screenId
     */
    async showScreen(screenId) {
        try {
            await window.domUtils.safeShowScreen(screenId, this.currentScreen);
            this.currentScreen = screenId;
                this.hideConnectionIndicator();
            await this.updateScreenContent(screenId);
            if (this.uiManager) {
                this.uiManager.currentScreen = screenId;
            }
            
        } catch (error) {            
            if (window.domUtils) {
                window.domUtils.debugDOMState();
            }
            try {
                document.querySelectorAll('.screen').forEach(screen => {
                    screen.classList.add('hidden');
                });

                const targetScreen = document.getElementById(screenId);
                if (targetScreen) {
                    targetScreen.classList.remove('hidden');
                    this.currentScreen = screenId;
                    if (this.uiManager) {
                        this.uiManager.currentScreen = screenId;
                    }
                    await this.updateScreenContent(screenId);
                } else {
                    if (screenId !== 'main-screen') {
                        await this.showScreen('main-screen');
                    }
                }
            } catch (fallbackError) {
                throw new Error(`Critical: Could not show screen '${screenId}'. Extension may need to be reloaded.`);
            }
        }
    }

    /**
     * Update content for specific screens
     * @param {string} screenId
     */
    async updateScreenContent(screenId) {
        
        switch (screenId) {
            case 'main-screen':
                if (this.uiManager.updateWalletDisplaySync) {
                    this.uiManager.updateWalletDisplaySync();
                }
                if (this.uiManager.updateWalletDisplayAsync) {
                    this.uiManager.updateWalletDisplayAsync();
                }
                break;
                
            case 'receive-screen':
                if (this.uiManager.updateReceiveScreen) {
                    this.uiManager.updateReceiveScreen();
                }
                break;
                
            case 'send-screen':
                if (this.uiManager.updateSendScreen) {
                    await this.uiManager.updateSendScreen();
                }
                break;
                
            case 'settings-screen':
                if (this.uiManager.modules?.settings) {
                    await this.uiManager.modules.settings.updateSettingsScreen();
                } else if (this.uiManager.updateSettingsScreen) {
                    await this.uiManager.updateSettingsScreen();
                }
                break;
                
            case 'wallet-list-screen':
                if (this.uiManager.modules?.walletList) {
                    await this.uiManager.modules.walletList.loadWalletList();
                }
                break;
                
            case 'history-screen':
                
                if (this.uiManager.modules?.transactionHistory) {
                    try {
                        await this.uiManager.modules.transactionHistory.showTransactionHistory();
                    } catch (error) {
                        if (this.uiManager.updateTransactionHistory) {
                            await this.uiManager.updateTransactionHistory();
                        }
                    }
                } else {
                    if (this.uiManager.updateTransactionHistory) {
                        await this.uiManager.updateTransactionHistory();
                    }
                }
                break;
                
            case 'bulk-send-screen':
                if (this.uiManager.modules?.bulkSend) {
                    await this.uiManager.modules.bulkSend.updateBulkDisplay();
                }
                break;
                
            case 'bulk-private-send-screen':
                if (this.uiManager.modules?.bulkPrivateSend) {
                    await this.uiManager.modules.bulkPrivateSend.updateBulkPrivateDisplay();
                }
                break;
                
            case 'encrypt-balance-screen':
                if (this.uiManager.updateEncryptBalanceScreen) {
                    await this.uiManager.updateEncryptBalanceScreen();
                }
                break;
                
            case 'decrypt-balance-screen':
                if (this.uiManager.updateDecryptBalanceScreen) {
                    await this.uiManager.updateDecryptBalanceScreen();
                }
                break;
                
            case 'private-send-screen':
                if (this.uiManager.updatePrivateSendScreen) {
                    await this.uiManager.updatePrivateSendScreen();
                }
                break;
                
            case 'claim-transfers-screen':
                if (this.uiManager.updateClaimTransfersScreen) {
                    await this.uiManager.updateClaimTransfersScreen();
                }
                break;
        }
    }

    /**
     * Get current screen ID
     */
    getCurrentScreen() {
        return this.currentScreen;
    }

    /**
     * Check if a specific screen is currently active
     */
    isScreenActive(screenId) {
        return this.currentScreen === screenId;
    }

    /**
     * Initialize floating connection indicator
     */
    async initializeFloatingConnectionIndicator() {
        try {
            this.hideConnectionIndicator();
        } catch (error) {
            this.hideConnectionIndicator();
        }
    }

    /**
     * Update connection indicator UI
     */
    updateConnectionIndicatorUI(tabInfo) {
        try {
            const indicator = this.connectionIndicator;
            if (!indicator || !tabInfo) return;

            const statusEl = indicator.querySelector('.connection-status');
            const urlEl = indicator.querySelector('.connected-url');
            const iconEl = indicator.querySelector('.connection-icon');

            if (statusEl) statusEl.textContent = tabInfo.connected ? 'Connected' : 'Disconnected';
            if (urlEl) urlEl.textContent = tabInfo.url || 'Unknown';
            indicator.classList.toggle('connected', tabInfo.connected);
            indicator.classList.toggle('disconnected', !tabInfo.connected);
            if (iconEl) {
                const connectedIcon = '🟢';
                const disconnectedIcon = '🔴';
                iconEl.textContent = tabInfo.connected ? connectedIcon : disconnectedIcon;
            }

        } catch (error) {
        }
    }

    /**
     * Update connection indicator
     */
    async updateConnectionIndicator() {
    }

    /**
     * Show connection indicator
     */
    showConnectionIndicator() {
        try {
            if (this.connectionIndicator) {
                this.connectionIndicator.classList.remove('hidden');
                this.connectionIndicator.style.display = 'flex';
            }
        } catch (error) {
        }
    }

    /**
     * Hide connection indicator
     */
    hideConnectionIndicator() {
        try {
            if (this.connectionIndicator) {
                this.connectionIndicator.classList.add('hidden');
                this.connectionIndicator.style.display = 'none';
            }
        } catch (error) {
        }
    }

    /**
     * Show connection indicator on main screen
     */
    async showConnectionIndicatorOnMainScreen() {
        try {
            this.hideConnectionIndicator();
        } catch (error) {
            this.hideConnectionIndicator();
        }
    }

    /**
     * Navigate to previous screen (if navigation history exists)
     */
    goBack() {
        if (this.currentScreen !== 'main-screen') {
            this.showScreen('main-screen');
        }
    }

    /**
     * Refresh current screen content
     */
    async refreshCurrentScreen() {
        if (this.currentScreen) {
            await this.updateScreenContent(this.currentScreen);
        }
    }

    /**
     * Check if screen element exists
     */
    screenExists(screenId) {
        return !!document.getElementById(screenId);
    }

    /**
     * Get all available screen IDs
     */
    getAvailableScreens() {
        return Array.from(document.querySelectorAll('.screen')).map(screen => screen.id).filter(id => id);
    }
}
window.ScreenNavigatorModule = ScreenNavigatorModule;