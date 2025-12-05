/**
 * Centralized Wallet Service for 0xio Wallet Extension
 * Consolidates wallet creation, validation, and management operations
 * Eliminates redundancy across UIManager, WalletListManager, and WalletManager
 */

class WalletService {
    constructor() {
        this.crypto = new CryptoManager();
        this.storage = new WalletStorage();
    }

    /**
     * Unified wallet creation method
     * Consolidates logic from UIManager.createNewWallet(), createInitialWallet(), and WalletListManager.createNewWallet()
     * @param {Object} params
     * @returns {Promise<Object>}
     */
    async createWallet(params) {
        const {
            walletName,
            isFirstWallet = false,
            importData = null, 
            walletManager,
            sessionKey,
            onProgress = null
        } = params;

        try {
            const updateProgress = (message) => {
                if (onProgress) onProgress(message);
            };
            this.validateWalletCreationInputs({ walletName, importData });

            updateProgress('Validating wallet data...');
            const walletCount = walletManager?.getWalletCount() || 0;
            if (walletCount >= 5) {
                throw new Error('Maximum of 5 wallets allowed');
            }
            if (walletManager) {
                const existingWallets = walletManager.getAllWallets();
                const nameExists = existingWallets.some(wallet => 
                    wallet.name.toLowerCase() === walletName.toLowerCase()
                );
                if (nameExists) {
                    throw new Error('A wallet with this name already exists');
                }
            }

            let walletData;

            if (importData) {
                updateProgress('Importing wallet...');
                walletData = await this.importWallet(importData, walletName);
            } else {
                updateProgress('Generating new wallet...');
                walletData = await this.generateNewWallet(walletName);
            }
            updateProgress('Validating wallet...');
            this.validateWalletData(walletData);
            updateProgress('Storing wallet...');
            
            if (!sessionKey) {
                throw new Error('Session key not available for wallet encryption');
            }

            const storedWallet = await this.storeWallet(
                walletData, 
                walletManager, 
                isFirstWallet, 
                importData,
                sessionKey
            );

            updateProgress('Wallet created successfully!');

            return {
                success: true,
                walletData: storedWallet || walletData,
                isFirstWallet,
                message: `${importData ? 'Imported' : 'Created'} wallet "${walletName}" successfully`
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Validate wallet creation inputs
     * Consolidates validation logic from multiple locations
     */
    validateWalletCreationInputs({ walletName, importData }) {
        if (!walletName || typeof walletName !== 'string') {
            throw new Error('Please enter a wallet name');
        }

        if (walletName.length > 30) {
            throw new Error('Wallet name must be 30 characters or less');
        }

        if (walletName.trim() !== walletName) {
            throw new Error('Wallet name cannot start or end with spaces');
        }
        if (importData) {
            if (!importData.privateKey || typeof importData.privateKey !== 'string') {
                throw new Error('Private key is required for import');
            }

            if (!importData.address || typeof importData.address !== 'string') {
                throw new Error('Wallet address is required for import');
            }
            if (!importData.address.startsWith('oct')) {
                throw new Error('Invalid wallet address format (must start with "oct")');
            }
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(importData.privateKey)) {
                throw new Error('Invalid private key format (must be base64)');
            }
        }
    }

    /**
     * Generate new wallet with mnemonic
     * Consolidates generation logic
     */
    async generateNewWallet(walletName) {
        try {
            const generatedData = await this.crypto.generateKeyPair();
            
            return {
                name: walletName,
                address: generatedData.address,
                privateKey: generatedData.privateKeyBase64,
                publicKey: generatedData.publicKeyBase64,
                mnemonic: generatedData.mnemonic,
                mnemonicWords: generatedData.mnemonicWords,
                isImported: false,
                createdAt: Date.now()
            };
        } catch (error) {
            throw new Error(`Failed to generate wallet: ${error.message}`);
        }
    }

    /**
     * Import existing wallet
     * Consolidates import logic
     */
    async importWallet(importData, walletName) {
        try {
            const { privateKey, address } = importData;
            const isValidKey = this.crypto.setPrivateKey(privateKey);
            if (!isValidKey) {
                throw new Error('Invalid private key format or content');
            }

            return {
                name: walletName,
                address: address,
                privateKey: privateKey,
                publicKey: this.crypto.getPublicKey(),
                mnemonic: null, 
                mnemonicWords: null,
                isImported: true,
                createdAt: Date.now()
            };
        } catch (error) {
            throw new Error(`Failed to import wallet: ${error.message}`);
        }
    }

    /**
     * Validate wallet data before storage
     * Ensures data integrity
     */
    validateWalletData(walletData) {
        const required = ['name', 'address', 'privateKey', 'publicKey'];
        
        for (const field of required) {
            if (!walletData[field]) {
                throw new Error(`Missing required wallet field: ${field}`);
            }
        }
        if (!walletData.address.startsWith('oct')) {
            throw new Error('Invalid wallet address format');
        }
        if (walletData.privateKey.length < 32) {
            throw new Error('Invalid private key length');
        }

        if (walletData.publicKey.length < 32) {
            throw new Error('Invalid public key length');
        }
    }

    /**
     * Store wallet using WalletManager's storage methods
     * Manually handles wallet object creation and storage
     */
    async storeWallet(walletData, walletManager, isFirstWallet, importData, sessionKey) {
        try {
            if (!walletManager) {
                throw new Error('Wallet manager not available');
            }
            const wallet = walletManager.walletStorage.createWalletObject(walletData, walletData.name);
            if (importData) {
                wallet.metadata.source = 'imported_key';
            }
            walletManager.wallets.push(wallet);
            if (isFirstWallet) {
                walletManager.activeWallet = wallet;
                walletManager.activeWalletId = wallet.id;
                wallet.isActive = true;
            }
            await walletManager.walletStorage.storeWallets(
                walletManager.wallets,
                sessionKey,
                walletManager.activeWalletId
            );

            return wallet;

        } catch (error) {
            throw new Error(`Failed to store wallet: ${error.message}`);
        }
    }

    /**
     * Get wallet manager from password manager
     * Unified access pattern
     */
    static getWalletManager(passwordManager) {
        if (!passwordManager) {
            return null;
        }
        
        const walletManager = passwordManager.getWalletManager();
        if (!walletManager) {
            return null;
        }
        
        return walletManager;
    }

    /**
     * Check authentication status
     * Centralized auth checking
     */
    static async getAuthStatus(passwordManager) {
        if (!passwordManager) {
            return {
                isAuthenticated: false,
                isPasswordSet: false,
                isUnlocked: false,
                needsSetup: true
            };
        }

        try {
            const isPasswordSet = await passwordManager.isPasswordSet();
            const isUnlocked = passwordManager.isWalletUnlocked();
            
            return {
                isAuthenticated: isPasswordSet && isUnlocked,
                isPasswordSet,
                isUnlocked,
                needsSetup: !isPasswordSet
            };
        } catch (error) {
            return {
                isAuthenticated: false,
                isPasswordSet: false,
                isUnlocked: false,
                needsSetup: true,
                error: error.message
            };
        }
    }

    /**
     * Validate form inputs
     * Centralized validation patterns
     */
    static validateForm(formData) {
        const errors = [];
        if (formData.password !== undefined) {
            if (formData.password && formData.password.length < 4) {
                errors.push('Password must be at least 4 characters long');
            }
            
            if (formData.confirmPassword !== undefined) {
                if (formData.password !== formData.confirmPassword) {
                    errors.push('Passwords do not match');
                }
            }
        }
        if (formData.walletName !== undefined) {
            if (!formData.walletName || !formData.walletName.trim()) {
                errors.push('Please enter a wallet name');
            } else if (formData.walletName.length > 30) {
                errors.push('Wallet name must be 30 characters or less');
            }
        }
        if (formData.amount !== undefined) {
            const amount = parseFloat(formData.amount);
            if (isNaN(amount) || amount <= 0) {
                errors.push('Please enter a valid amount');
            }
        }
        if (formData.address !== undefined) {
            if (!formData.address || !formData.address.trim()) {
                errors.push('Please enter an address');
            } else if (!formData.address.startsWith('oct')) {
                errors.push('Invalid address format (must start with "oct")');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Safe DOM element access
     * Standardizes element access patterns throughout the extension
     */
    static async safeGetElement(selector, options = {}) {
        const { 
            required = false,
            timeout = 2000,
            fallbackId = null 
        } = options;

        try {
            if (window.domUtils && window.domUtils.safeGetElement) {
                return await window.domUtils.safeGetElement(selector, { 
                    timeout, 
                    required 
                });
            }
            const element = document.querySelector(selector);
            if (!element && fallbackId) {
                return document.getElementById(fallbackId);
            }

            if (!element && required) {
                throw new Error(`Required element not found: ${selector}`);
            }

            return element;
        } catch (error) {
            if (required) {
                throw error;
            }
            return null;
        }
    }

    /**
     * Safe event listener binding
     * Prevents duplicate listeners and ensures cleanup
     */
    static addSafeEventListener(elementOrSelector, eventType, handler, options = {}) {
        try {
            let element;
            if (typeof elementOrSelector === 'string') {
                element = document.querySelector(elementOrSelector);
                if (!element) {
                    return false;
                }
            } else {
                element = elementOrSelector;
            }
            element.removeEventListener(eventType, handler, options);
            element.addEventListener(eventType, handler, options);
            
            return true;
        } catch (error) {
            return false;
        }
    }
}
window.WalletService = WalletService;