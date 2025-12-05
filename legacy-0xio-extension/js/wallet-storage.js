/**
 * Wallet Storage module for 0xio Wallet Extension
 * Handles storage structure for multiple wallets (max 5)
 */

class WalletStorage {
    constructor() {
        this.MAX_WALLETS = 5;
    }

    /**
     * Create a new wallet data object
     * @param {Object} walletData
     * @param {string} name
     * @returns {Object} 
     */
    createWalletObject(walletData, name) {

        const privateKey = walletData.private_key_b64 || walletData.privateKey;
        const publicKey = walletData.public_key_b64 || walletData.publicKey;
        

        if (!privateKey) {
            throw new Error('No private key found in wallet data (checked both private_key_b64 and privateKey fields)');
        }
        
        if (!walletData.address) {
            throw new Error('No address found in wallet data');
        }

        const walletId = this.generateWalletId();
        const now = new Date().toISOString();

        const wallet = {
            id: walletId,
            name: name,
            address: walletData.address,
            privateKey: privateKey,
            publicKey: publicKey,
            mnemonic: walletData.mnemonic || null,
            createdAt: now,
            updatedAt: now,
            isActive: false, 
            metadata: {
                version: '1.0',
                source: 'generated', 
                icon: null,
                color: null,
                category: null
            }
        };

        return wallet;
    }

    /**
     * Generate a unique wallet ID using cryptographically secure random values
     * @returns {string}
     */
    generateWalletId() {

        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const randomHex = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return 'wallet_' + Date.now() + '_' + randomHex.substr(0, 9);
    }

    /**
     * Encrypt wallet data using master password
     * @param {Object} walletData
     * @param {string} password
     * @returns {Promise<string>}
     */
    async encryptWalletData(walletData, password) {
        try {

            const dataToEncrypt = JSON.stringify(walletData);
            const encoder = new TextEncoder();
            const data = encoder.encode(dataToEncrypt);
            const passwordKey = await this.deriveKey(password);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                passwordKey,
                data
            );
            

            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encrypted), iv.length);       
            const encryptedB64 = btoa(String.fromCharCode(...combined));
            
            return encryptedB64;
        } catch (error) {
            throw new Error(`Failed to encrypt wallet data: ${error.message}`);
        }
    }

    /**
     * Decrypt wallet data using master password
     * @param {string} encryptedData
     * @param {string} password
     * @returns {Promise<Object>}
     */
    async decryptWalletData(encryptedData, password) {
        try {
            const combined = new Uint8Array(
                atob(encryptedData).split('').map(char => char.charCodeAt(0))
            );  
            const iv = combined.slice(0, 12);
            const encrypted = combined.slice(12);   
            const passwordKey = await this.deriveKey(password);     
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                passwordKey,
                encrypted
            );
            
            const decoder = new TextDecoder();
            const decryptedText = decoder.decode(decrypted);
            const walletData = JSON.parse(decryptedText);
            
            return walletData;
        } catch (error) {
            throw new Error(`Failed to decrypt wallet data: ${error.message}`);
        }
    }

    /**
     * Emergency salt recovery and storage repair
     * Called when critical storage inconsistencies are detected
     */
    async emergencyStorageRepair() {
        try {
            const storage = await chrome.storage.local.get(null);
            if (storage.encryptedWallets && !storage.salt) {
                const newSalt = crypto.getRandomValues(new Uint8Array(32));
                const newSaltBase64 = btoa(String.fromCharCode.apply(null, newSalt));
                
                await chrome.storage.local.set({ 'salt': newSaltBase64 });
                return true;
            }
            
            if (storage.hashedPassword && !storage.salt) {
                const newSalt = crypto.getRandomValues(new Uint8Array(32));
                const newSaltBase64 = btoa(String.fromCharCode.apply(null, newSalt));
                await chrome.storage.local.set({ 'salt': newSaltBase64 });
            }
            
            return true;
            
        } catch (error) {
            return false;
        }
    }

    /**
     * Derive key from password for encryption
     * @param {string} password
     * @returns {Promise<CryptoKey>}
     */
    async deriveKey(password) {
        const encoder = new TextEncoder();
        const storage = await chrome.storage.local.get(['salt']);
        let salt;
        if (storage.salt) {
            const saltStr = atob(storage.salt);
            salt = new Uint8Array(saltStr.length);
            for (let i = 0; i < saltStr.length; i++) {
                salt[i] = saltStr.charCodeAt(i);
            }
        } else {
            salt = crypto.getRandomValues(new Uint8Array(32));
            const saltBase64 = btoa(String.fromCharCode.apply(null, salt));
            await chrome.storage.local.set({ 'salt': saltBase64 });
        }

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
    }


    /**
     * Store multiple wallets in encrypted format
     * @param {Array} wallets
     * @param {string} password
     * @param {string} activeWalletId
     * @returns {Promise<boolean>}
     */
    async storeWallets(wallets, password, activeWalletId = null) {
        try {
            if (wallets.length > this.MAX_WALLETS) {
                throw new Error(`Cannot store more than ${this.MAX_WALLETS} wallets`);
            }
            const encryptedWallets = [];
            for (const wallet of wallets) {
                const encrypted = await this.encryptWalletData(wallet, password);
                encryptedWallets.push({
                    id: wallet.id,
                    name: wallet.name,
                    address: wallet.address, 
                    createdAt: wallet.createdAt,
                    isActive: wallet.id === activeWalletId,
                    encryptedData: encrypted
                });
            }
            await chrome.storage.local.set({
                encryptedWallets: encryptedWallets,
                activeWalletId: activeWalletId,
                walletCount: wallets.length
            });

            return true;
        } catch (error) {
            throw new Error(`Failed to store wallets: ${error.message}`);
        }
    }

    /**
     * Load and decrypt all wallets
     * @param {string} password
     * @returns {Promise<Object>}
     */
    async loadWallets(password) {
        try {
            const storage = await chrome.storage.local.get(['encryptedWallets', 'activeWalletId', 'walletCount', 'passwordSkipped']);
            
            if (!storage.encryptedWallets || storage.encryptedWallets.length === 0) {
                return {
                    wallets: [],
                    activeWalletId: null
                };
            }

            const decryptionPassword = password;
            const wallets = [];
            const corruptedWallets = [];
            let reEncryptedCount = 0;
            for (const encryptedWallet of storage.encryptedWallets) {
                try {
                    const decryptedWallet = await this.decryptWalletData(encryptedWallet.encryptedData, decryptionPassword);
                    decryptedWallet.isActive = (decryptedWallet.id === storage.activeWalletId);
                    wallets.push(decryptedWallet);
                } catch (error) {
                    corruptedWallets.push({
                        name: encryptedWallet.name,
                        address: encryptedWallet.address,
                        error: error.message
                    });
                }
            }
            if (corruptedWallets.length > 0 && wallets.length > 0) {
                try {
                    await this.storeWallets(wallets, decryptionPassword, storage.activeWalletId);
                } catch (error) {
                }
            }
            
            if (wallets.length === 0) {
                if (corruptedWallets.length > 0) {
                    try {
                        await this.clearAllWallets();
                        
                        return {
                            wallets: [],
                            activeWalletId: null,
                            recoveredFromCorruption: true,
                            corruptedWallets: corruptedWallets,
                            cleanedUpCorruptedData: true
                        };
                    } catch (cleanupError) {
                        throw new Error(`All ${corruptedWallets.length} wallet(s) are corrupted and cannot be decrypted. Cleanup failed: ${cleanupError.message}. Please manually reset the extension.`);
                    }
                } else {
                    throw new Error('No wallets found in storage');
                }
            }
            return {
                wallets: wallets,
                activeWalletId: storage.activeWalletId,
                recoveredFromCorruption: corruptedWallets.length > 0 || reEncryptedCount > 0,
                corruptedWallets: corruptedWallets,
                reEncryptedWallets: reEncryptedCount
            };
        } catch (error) {
            throw new Error(`Failed to load wallets: ${error.message}`);
        }
    }

    /**
     * Get wallet metadata (name, address, etc.) without decrypting
     * @returns {Promise<Array>}
     */
    async getWalletMetadata() {
        try {
            const storage = await chrome.storage.local.get(['encryptedWallets', 'activeWalletId', 'walletCount']);
            
            if (!storage.encryptedWallets) {
                return [];
            }

            const metadata = storage.encryptedWallets.map(wallet => ({
                id: wallet.id,
                name: wallet.name,
                address: wallet.address,
                createdAt: wallet.createdAt,
                isActive: wallet.isActive
            }));

            return metadata;
        } catch (error) {
            return [];
        }
    }

    /**
     * Check if storage has any wallets
     * @returns {Promise<boolean>}
     */
    async hasWallets() {
        try {
            const storage = await chrome.storage.local.get(['encryptedWallets']);
            return storage.encryptedWallets && storage.encryptedWallets.length > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get number of stored wallets
     * @returns {Promise<number>}
     */
    async getWalletCount() {
        try {
            const storage = await chrome.storage.local.get(['walletCount']);
            return storage.walletCount || 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Check if more wallets can be added
     * @returns {Promise<boolean>}
     */
    async canAddMoreWallets() {
        const count = await this.getWalletCount();
        return count < this.MAX_WALLETS;
    }

    /**
     * Validate wallet name uniqueness
     * @param {string} name
     * @param {string} excludeId
     * @returns {Promise<boolean>}
     */
    async isWalletNameUnique(name, excludeId = null) {
        if (!name) {
            return false;
        }
        
        const metadata = await this.getWalletMetadata();
        return !metadata.some(wallet => 
            wallet.name && wallet.name.toLowerCase() === name.toLowerCase() && 
            wallet.id !== excludeId
        );
    }

    /**
     * Validate wallet address uniqueness
     * @param {string} address 
     * @param {string} excludeId 
     * @returns {Promise<boolean>} 
     */
    async isWalletAddressUnique(address, excludeId = null) {
        const metadata = await this.getWalletMetadata();
        return !metadata.some(wallet => 
            wallet.address === address && 
            wallet.id !== excludeId
        );
    }

    /**
     * Export wallet in official CLI format (priv, addr, rpc)
     * @param {Object} wallet 
     * @param {string} rpcUrl 
     * @returns {Object}
     */
    exportWalletInOfficialFormat(wallet, rpcUrl) {
        rpcUrl = rpcUrl || window.OctraConfig?.NETWORK?.RPC_URL || 'https://octra.network';
        const officialFormat = {
            priv: wallet.privateKey, 
            addr: wallet.address,   
            rpc: rpcUrl           
        };
        
        return officialFormat;
    }
    
    /**
     * Import wallet from official CLI format (priv, addr, rpc)
     * @param {Object} officialData 
     * @param {string} name 
     * @returns {Object} 
     */
    importWalletFromOfficialFormat(officialData, name) {
        

        if (!officialData.priv) {
            throw new Error('Missing "priv" field in official format');
        }
        if (!officialData.addr) {
            throw new Error('Missing "addr" field in official format');
        }
        
        if (!officialData.addr.startsWith('oct') || officialData.addr.length < 47 || officialData.addr.length > 49) {
            throw new Error('Invalid address format in official data - must be 47-49 characters starting with "oct"');
        }

        const walletData = {
            address: officialData.addr,           
            private_key_b64: officialData.priv,  

        };
        
        return this.createWalletObject(walletData, name);
    }

    /**
     * Clear all wallet data (for reset/logout)
     * @returns {Promise<boolean>}
     */
    async clearAllWallets() {
        try {
            await chrome.storage.local.remove(['encryptedWallets', 'activeWalletId', 'walletCount']);
            return true;
        } catch (error) {
            return false;
        }
    }
}

window.WalletStorage = WalletStorage; 