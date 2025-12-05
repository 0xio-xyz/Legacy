/**
 * Wallet Manager module for 0xio Wallet Extension
 * Handles multiple wallet instances, active wallet tracking, and wallet operations
 */

class WalletManager {
    constructor() {
        this.wallets = [];
        this.activeWallet = null;
        this.activeWalletId = null;
        this.walletStorage = new WalletStorage();
        this.isInitialized = false;
        this.sessionPassword = null;
    }

    /**
     * Initialize wallet manager and load existing wallets
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    async initialize(password) {

        try {
            this.sessionPassword = password;
            const loadResult = await this.walletStorage.loadWallets(password);

            this.wallets = loadResult.wallets;
            this.activeWalletId = loadResult.activeWalletId;
            this.lastRecoveryInfo = {
                recoveredFromCorruption: loadResult.recoveredFromCorruption || false,
                corruptedWallets: loadResult.corruptedWallets || [],
                cleanedUpCorruptedData: loadResult.cleanedUpCorruptedData || false
            };
            const stateFixed = await this.fixInconsistentState();
            if (stateFixed) {
            }
            if (this.activeWalletId) {
                this.activeWallet = this.wallets.find(w => w.id === this.activeWalletId);
                if (!this.activeWallet) {
                    this.activeWalletId = null;
                }
            }
            if (!this.activeWallet && this.wallets.length > 0) {
                await this.setActiveWallet(this.wallets[0].id);
            }

            this.isInitialized = true;

            return true;
        } catch (error) {
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Get recovery information from last wallet loading operation
     * @returns {Object}
     */
    getRecoveryInfo() {
        return this.lastRecoveryInfo || {
            recoveredFromCorruption: false,
            corruptedWallets: []
        };
    }

    /**
     * Clear recovery information after it has been handled
     */
    clearRecoveryInfo() {
        this.lastRecoveryInfo = {
            recoveredFromCorruption: false,
            corruptedWallets: []
        };
    }

    /**
     * Create a new wallet
     * @param {string} name
     * @param {string} password
     * @param {boolean} setAsActive
     * @returns {Promise<Object>}
     */
    async createWallet(name, password, setAsActive = true) {
        const originalWallets = [...this.wallets];
        const originalActiveWallet = this.activeWallet;
        const originalActiveWalletId = this.activeWalletId;
        
        try {
            if (this.wallets.length >= this.walletStorage.MAX_WALLETS) {
                throw new Error(`Maximum ${this.walletStorage.MAX_WALLETS} wallets allowed`);
            }
            const isNameUnique = await this.walletStorage.isWalletNameUnique(name);
            if (!isNameUnique) {
                throw new Error('Wallet name already exists');
            }
            
            if (!window.crypto || !window.crypto.generateWallet) {
                if (window.octraCrypto) {
                    if (!window.crypto) {
                        window.crypto = {};
                    }
                    
                    if (!window.crypto.generateWallet) {
                        window.crypto.generateWallet = window.octraCrypto.generateWallet;
                    }
                } else if (window.CryptoManager) {
                    const fallbackCrypto = new window.CryptoManager();
                    
                    if (!window.crypto) {
                        window.crypto = {};
                    }
                    
                    if (!window.crypto.generateWallet) {
                        window.crypto.generateWallet = async function() {
                            return await fallbackCrypto.generateKeyPair();
                        };
                    }
                } else {
                    throw new Error('Neither octraCrypto nor CryptoManager class available for wallet generation');
                }
            }
            
            const walletData = await window.crypto.generateWallet();
            const isAddressUnique = await this.walletStorage.isWalletAddressUnique(walletData.address);
            if (!isAddressUnique) {
                throw new Error('Generated wallet address already exists (very unlikely)');
            }
            const wallet = this.walletStorage.createWalletObject(walletData, name);
            const newWallets = [...this.wallets, wallet];
            let newActiveWalletId = this.activeWalletId;
            if (setAsActive) {
                wallet.isActive = true;
                newActiveWalletId = wallet.id;
                newWallets.forEach(w => {
                    if (w.id !== wallet.id) {
                        w.isActive = false;
                    }
                });
            }
            await this.walletStorage.storeWallets(newWallets, password, newActiveWalletId);
            this.wallets = newWallets;
            this.activeWalletId = newActiveWalletId;
            if (setAsActive) {
                this.activeWallet = wallet;
            }
            
            
            return {
                success: true,
                wallet: wallet
            };
        } catch (error) {
            this.wallets = originalWallets;
            this.activeWallet = originalActiveWallet;
            this.activeWalletId = originalActiveWalletId;
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Import a wallet from private key
     * @param {string} name
     * @param {string} privateKey
     * @param {string} address
     * @param {string} password
     * @param {boolean} setAsActive
     * @returns {Promise<Object>}
     */
    async importWallet(name, privateKey, address, password, setAsActive = true) {
        
        try {
            if (this.wallets.length >= this.walletStorage.MAX_WALLETS) {
                throw new Error(`Maximum ${this.walletStorage.MAX_WALLETS} wallets allowed`);
            }
            const isNameUnique = await this.walletStorage.isWalletNameUnique(name);
            if (!isNameUnique) {
                throw new Error('Wallet name already exists');
            }
            const isAddressUnique = await this.walletStorage.isWalletAddressUnique(address);
            if (!isAddressUnique) {
                throw new Error('Imported wallet address already exists');
            }
            const walletData = {
                private_key_b64: privateKey,
                address: address
            };
            try {
                const crypto = new CryptoManager();
                const privateKeyBytes = crypto.base64ToBytes(privateKey);
                const signingKey = nacl.sign.keyPair.fromSeed(privateKeyBytes);
                walletData.public_key_b64 = crypto.bytesToBase64(signingKey.publicKey);
            } catch (error) {
                throw new Error('Invalid private key format');
            }
            const wallet = this.walletStorage.createWalletObject(walletData, name);
            wallet.metadata.source = 'imported_key';
            this.wallets.push(wallet);
            if (setAsActive) {
                this.activeWallet = wallet;
                this.activeWalletId = wallet.id;
                wallet.isActive = true;
                this.wallets.forEach(w => {
                    if (w.id !== wallet.id) {
                        w.isActive = false;
                    }
                });
            }
            await this.walletStorage.storeWallets(this.wallets, password, this.activeWalletId);
            
            
            return {
                success: true,
                wallet: wallet
            };
        } catch (error) {
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Set active wallet (optimized for performance)
     * @param {string} walletId
     * @returns {Promise<boolean>}
     */
    async setActiveWallet(walletId) {
        const startTime = Date.now();
        
        try {
            const wallet = this.wallets.find(w => w.id === walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            if (this.activeWalletId === walletId) {
                return true;
            }
            this.activeWallet = wallet;
            this.activeWalletId = walletId;
            this.wallets.forEach(w => {
                w.isActive = (w.id === walletId);
            });
            await this.updateActiveWalletInStorage(walletId);
            
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Update active wallet in storage (background operation)
     * @param {string} walletId
     * @returns {Promise<void>}
     */
    async updateActiveWalletInStorage(walletId) {
        const startTime = Date.now();
        
        try {
            const storagePassword = this.sessionPassword;
            await chrome.storage.local.set({ activeWalletId: walletId });
            const storedWallets = await chrome.storage.local.get(['encryptedWallets']);
            if (storedWallets.encryptedWallets) {
                const updatedStoredWallets = storedWallets.encryptedWallets.map(storedWallet => ({
                    ...storedWallet,
                    isActive: (storedWallet.id === walletId)
                }));
                
                await chrome.storage.local.set({ encryptedWallets: updatedStoredWallets });
            }
            
        } catch (error) {
            try {
                const fallbackStart = Date.now();
                await this.walletStorage.storeWallets(this.wallets, this.sessionPassword, this.activeWalletId);
            } catch (fallbackError) {
            }
        }
    }

    /**
     * Get active wallet
     * @returns {Object|null}
     */
    getActiveWallet() {
        
        if (!this.activeWallet) {
            if (this.activeWalletId) {
                const wallet = this.wallets.find(w => w.id === this.activeWalletId);
                if (wallet) {
                    this.activeWallet = wallet;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }
        if (!this.activeWallet.privateKey) {
            return null;
        }
        
        if (!this.activeWallet.address) {
            return null;
        }
        
        
        return this.activeWallet;
    }

    /**
     * Get all wallets
     * @returns {Array}
     */
    getAllWallets() {
        const wallets = this.wallets || [];
        return wallets;
    }

    /**
     * Get wallet by ID
     * @param {string} walletId
     * @returns {Object|null}
     */
    getWalletById(walletId) {
        return this.wallets.find(w => w.id === walletId) || null;
    }

    /**
     * Get wallet metadata without sensitive data
     * @returns {Array}
     */
    getWalletMetadata() {
        return this.wallets.map(wallet => ({
            id: wallet.id,
            name: wallet.name,
            address: wallet.address,
            createdAt: wallet.createdAt,
            isActive: wallet.isActive,
            metadata: {
                source: wallet.metadata.source,
                icon: wallet.metadata.icon,
                color: wallet.metadata.color,
                category: wallet.metadata.category
            }
        }));
    }

    /**
     * Rename a wallet
     * @param {string} walletId
     * @param {string} newName
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    async renameWallet(walletId, newName, password) {
        
        try {
            const wallet = this.wallets.find(w => w.id === walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            const isNameUnique = await this.walletStorage.isWalletNameUnique(newName, walletId);
            if (!isNameUnique) {
                throw new Error('Wallet name already exists');
            }
            wallet.name = newName;
            wallet.updatedAt = new Date().toISOString();
            await this.walletStorage.storeWallets(this.wallets, password, this.activeWalletId);
            
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Delete a wallet
     * @param {string} walletId
     * @param {string} password
     * @returns {Promise<Object>}
     */
    async deleteWallet(walletId, password) {
        
        try {
            if (this.wallets.length <= 1) {
                throw new Error('Cannot delete the last wallet');
            }
            
            const walletIndex = this.wallets.findIndex(w => w.id === walletId);
            
            if (walletIndex === -1) {
                throw new Error('Wallet not found');
            }
            
            const wallet = this.wallets[walletIndex];
            const wasActive = wallet.isActive;
            this.wallets.splice(walletIndex, 1);
            if (wasActive) {
                this.activeWallet = this.wallets[0];
                this.activeWalletId = this.wallets[0].id;
                this.wallets[0].isActive = true;
            }
            await this.walletStorage.storeWallets(this.wallets, password, this.activeWalletId);
            
            
            return {
                success: true
            };
        } catch (error) {
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Export wallet data
     * @param {string} walletId
     * @returns {Object|null}
     */
    exportWallet(walletId) {
        
        try {
            const wallet = this.wallets.find(w => w.id === walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            const exportData = {
                name: wallet.name,
                address: wallet.address,
                privateKey: wallet.privateKey,
                publicKey: wallet.publicKey,
                mnemonic: wallet.mnemonic,
                createdAt: wallet.createdAt,
                exportedAt: new Date().toISOString(),
                version: wallet.metadata.version
            };
            
            
            return exportData;
        } catch (error) {
            return null;
        }
    }

    /**
     * Update wallet metadata
     * @param {string} walletId
     * @param {Object} metadata
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    async updateWalletMetadata(walletId, metadata, password) {
        
        try {
            const wallet = this.wallets.find(w => w.id === walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            wallet.metadata = { ...wallet.metadata, ...metadata };
            wallet.updatedAt = new Date().toISOString();
            await this.walletStorage.storeWallets(this.wallets, password, this.activeWalletId);
            
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get wallet count
     * @returns {number}
     */
    getWalletCount() {
        return this.wallets.length;
    }

    /**
     * Check for inconsistent state between loaded wallets and storage
     * @returns {Promise<boolean>}
     */
    async checkStateConsistency() {
        const metadata = await this.walletStorage.getWalletMetadata();
        const loadedCount = this.wallets.length;
        const storageCount = metadata.length;
        
        
        return loadedCount !== storageCount;
    }

    /**
     * Fix inconsistent state by clearing storage if wallets failed to load
     * @returns {Promise<boolean>}
     */
    async fixInconsistentState() {
        const isInconsistent = await this.checkStateConsistency();
        
        if (isInconsistent && this.wallets.length === 0) {
            const cleared = await this.walletStorage.clearAllWallets();
            if (cleared) {
                return true;
            } else {
                return false;
            }
        }
        
        return false;
    }

    /**
     * Check if more wallets can be added
     * @returns {boolean}
     */
    canAddMoreWallets() {
        return this.wallets.length < this.walletStorage.MAX_WALLETS;
    }

    /**
     * Check if wallet manager is initialized
     * @returns {boolean}
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Get the correct password for storage operations (detects no-password mode)
     * @param {string} providedPassword
     * @returns {Promise<string>}
     */
    async getStoragePassword(providedPassword) {
        return providedPassword || this.sessionPassword;
    }

    /**
     * Securely overwrite a string in memory (best effort)
     * @param {string} str
     * @returns {null}
     */
    secureClearString(str) {
        if (!str || typeof str !== 'string') return null;
        const length = str.length;
        let temp = new Array(length);
        for (let i = 0; i < length; i++) {
            temp[i] = String.fromCharCode(Math.floor(Math.random() * 256));
        }
        temp.fill('\0');
        temp = null;

        return null;
    }

    /**
     * Clear sensitive data from memory (for locking/reset)
     */
    clearSensitiveData() {

        try {
            this.wallets.forEach(wallet => {
                if (wallet.privateKey) {
                    wallet.privateKey = this.secureClearString(wallet.privateKey);
                }
                if (wallet.publicKey) {
                    wallet.publicKey = this.secureClearString(wallet.publicKey);
                }
                if (wallet.mnemonic) {
                    if (Array.isArray(wallet.mnemonic)) {
                        wallet.mnemonic.forEach((word, idx) => {
                            wallet.mnemonic[idx] = this.secureClearString(word);
                        });
                    }
                    wallet.mnemonic = null;
                }
                if (wallet.cryptoManager && typeof wallet.cryptoManager.clear === 'function') {
                    wallet.cryptoManager.clear();
                }
            });
            this.sessionPassword = this.secureClearString(this.sessionPassword);
            this.activeWallet = null;

        } catch (error) {
        }
    }

    /**
     * Clear all wallets (for reset)
     * @returns {Promise<boolean>}
     */
    async clearAllWallets() {
        
        try {
            this.wallets = [];
            this.activeWallet = null;
            this.activeWalletId = null;
            this.isInitialized = false;
            
            await this.walletStorage.clearAllWallets();
            
            
            return true;
        } catch (error) {
            return false;
        }
    }
}
window.WalletManager = WalletManager; 