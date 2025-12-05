/**
 * Password Manager Class
 * Handles wallet password protection, encryption, and auto-lock functionality
 */
class PasswordManager {
    constructor() {
        this.walletManager = null;
        this.isUnlocked = false;
        this.sessionKey = null; 
        this.autoLockDuration = 300;
        this.lastActivity = Date.now();
        this.storageListener = null;
        this.closeListener = null;
        this.autoLockTimer = null;
        this.initializeWalletManager();
        this.initializationPromise = this.loadAutoLockSetting();

    }

    /**
     * Initialize wallet manager
     */
    initializeWalletManager() {
        try {
            this.walletManager = new WalletManager(this);
        } catch (error) {
        }
    }

    /**
     * Wait for password manager initialization to complete
     * @returns {Promise<void>}
     */
    async waitForInitialization() {
        if (this.initializationPromise) {
            await this.initializationPromise;
        }
    }

    /**
     * Calculate password strength
     */
    calculatePasswordStrength(password) {
        
        let score = 0;
        let feedback = [];
        if (password.length < 8) {
            score -= 2;
            feedback.push('Password is too short');
        } else if (password.length >= 12) {
            score += 2;
            feedback.push('Good length');
        }
        if (/[A-Z]/.test(password)) {
            score += 1;
            feedback.push('Contains uppercase');
        }
        if (/[a-z]/.test(password)) {
            score += 1;
            feedback.push('Contains lowercase');
        }
        if (/[0-9]/.test(password)) {
            score += 1;
            feedback.push('Contains numbers');
        }
        if (/[^A-Za-z0-9]/.test(password)) {
            score += 2;
            feedback.push('Contains special characters');
        }
        let strength = 'weak';
        if (score >= 4) {
            strength = 'strong';
        } else if (score >= 2) {
            strength = 'medium';
        }

        return { score, strength, feedback };
    }

    /**
     * Set up password protection
     */
    async setupPassword(password) {
        
        try {
            if (!password || password.length < 8) {
                return false;
            }
            const strength = this.calculatePasswordStrength(password);

            if (strength.strength === 'weak') {
                return false;
            }
            await chrome.storage.local.remove(['hashedPassword', 'salt']);
            await this.initializeStorage(password);
            const verification = await chrome.storage.local.get(['salt', 'hashedPassword']);
            
            if (!verification.salt) {
                throw new Error('Failed to store salt during password setup');
            }
            
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate or retrieve device-specific encryption key for no-password mode
     * Uses cryptographically secure random values unique to this device/browser
     * @returns {Promise<string>}
     */
    async getDeviceEncryptionKey() {
        try {
            const storage = await chrome.storage.local.get(['deviceEncryptionKey']);

            if (storage.deviceEncryptionKey) {
                return storage.deviceEncryptionKey;
            }
            const keyBytes = new Uint8Array(32); 
            crypto.getRandomValues(keyBytes);
            const deviceKey = btoa(String.fromCharCode.apply(null, keyBytes));
            await chrome.storage.local.set({
                'deviceEncryptionKey': deviceKey,
                'deviceKeyGenerated': Date.now()
            });

            return deviceKey;
        } catch (error) {
            throw new Error('Failed to generate device encryption key: ' + error.message);
        }
    }

    /**
     * Skip password setup
     * Uses device-specific encryption key instead of hardcoded constant
     * @returns {Promise<boolean>}
     */
    async skipPasswordSetup() {
        try {
            const deviceKey = await this.getDeviceEncryptionKey();
            this.sessionKey = deviceKey;
            await chrome.storage.local.set({
                'passwordSkipped': true
            });
            this.isUnlocked = true;
            await this.persistUnlockStatus(true);
            if (this.walletManager) {
                const initSuccess = await this.walletManager.initialize(this.sessionKey);
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if password is set
     */
    async isPasswordSet() {
        try {
            const data = await chrome.storage.local.get(['hashedPassword', 'passwordSkipped']);
            const hasPassword = !!data.hashedPassword;
            const passwordSkipped = !!data.passwordSkipped;
            return hasPassword || passwordSkipped;
        } catch (error) {
            return false;
        }
    }



    /**
     * Hash password using SHA-256
     */
    async hashPassword(password) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Verify password against stored hash
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    async verifyPassword(password) {
        try {
            const data = await chrome.storage.local.get(['hashedPassword', 'salt']);
            if (!data.hashedPassword) {
                return false;
            }
            let hashedInput;
            if (data.salt) {
                const encoder = new TextEncoder();
                const passwordData = encoder.encode(password + data.salt);
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', passwordData);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                hashedInput = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } else {
                hashedInput = await this.hashPassword(password);
            }
            
            const isValid = hashedInput === data.hashedPassword;
            
            if (isValid) {
                this.sessionKey = password;
                this.isUnlocked = true;
                await this.persistUnlockStatus();
            }
            
            return isValid;
        } catch (error) {
            return false;
        }
    }

    /**
     * Lock wallet
     */
    async lockWallet() {
        try {
            this.sessionKey = this.secureClearString(this.sessionKey);
            this.isUnlocked = false;
            await chrome.storage.local.remove(['walletUnlocked', 'lastUnlockTime', 'encryptedSessionKey']);
            if (this.walletManager) {
                this.walletManager.clearSensitiveData();
            }
        } catch (error) {
        }
    }

    /**
     * Get wallet manager instance
     */
    getWalletManager() {
        return this.walletManager;
    }

    /**
     * Check if wallet is unlocked
     */
    isWalletUnlocked() {
        return this.isUnlocked;
    }

    /**
     * Reset auto-lock timer
     */
    resetAutoLockTimer() {
        this.lastActivity = Date.now();
        if (this.autoLockTimer) {
            clearTimeout(this.autoLockTimer);
            this.autoLockTimer = null;
            this.currentTimerId = null; 
        }
        this.startAutoLockTimer();
    }

    /**
     * Start auto-lock timer
     */
    startAutoLockTimer() {
        if (this.autoLockTimer) {
            clearTimeout(this.autoLockTimer);
            this.autoLockTimer = null;
        }
        if (this.autoLockDuration === 0) {
            return;
        }
        chrome.storage.local.get(['hashedPassword']).then(data => {
            const hasActualPassword = !!data.hashedPassword;
            if (!hasActualPassword) {
                return;
            }
            const timerId = Date.now();
            this.currentTimerId = timerId;
            this.autoLockTimer = setTimeout(() => {
                if (this.currentTimerId !== timerId) {
                    return;
                }

                if (this.isUnlocked) {
                    this.lockWallet();
                }
            }, this.autoLockDuration * 1000);
        });
    }

    /**
     * Update auto-lock duration setting
     * @param {number} duration
     */
    updateAutoLockDuration(duration) {
        if (this.autoLockTimer) {
            clearTimeout(this.autoLockTimer);
            this.autoLockTimer = null;
            this.currentTimerId = null; 
        }
        this.autoLockDuration = duration;
        this.resetAutoLockTimer();
    }

    /**
     * Load auto-lock setting from storage
     */
    async loadAutoLockSetting() {
        try {
            const storage = await chrome.storage.local.get(['autoLockDuration']);
            const savedDuration = storage.autoLockDuration !== undefined ? storage.autoLockDuration : 300; 
            this.autoLockDuration = savedDuration;
            await this.initializeUnlockStatus();
            this.startAutoLockTimer();

        } catch (error) {
            this.autoLockDuration = 300;
            await this.initializeUnlockStatus();
            this.startAutoLockTimer();
        }
    }

    /**
     * Initialize storage with a new password
     * @param {string} password
     * @returns {Promise<void>}
     */
    async initializeStorage(password) {
        
        try {
            const salt = await window.crypto.getRandomValues(new Uint8Array(32));
            const saltBase64 = btoa(String.fromCharCode.apply(null, salt));
            const encoder = new TextEncoder();
            const passwordData = encoder.encode(password + saltBase64);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', passwordData);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            await chrome.storage.local.set({
                'salt': saltBase64,
                'hashedPassword': hashHex,
                'initialized': true
            });
            this.sessionKey = password;
            this.isUnlocked = true;
            await this.persistUnlockStatus();
            
        } catch (error) {
            throw new Error('Failed to initialize storage: ' + error.message);
        }
    }

    /**
     * Set password for existing storage
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    async setPassword(password) {
        
        try {
            await this.initializeStorage(password);
                return true;
        } catch (error) {
            return false;
        }
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
     * Clear sensitive data from memory and storage (for reset)
     */
    async clearSensitiveData() {

        try {
            this.sessionKey = this.secureClearString(this.sessionKey);
            this.isUnlocked = false;
            await chrome.storage.local.remove(['walletUnlocked', 'lastUnlockTime']);
            if (this.walletManager && typeof this.walletManager.clearSensitiveData === 'function') {
                this.walletManager.clearSensitiveData();
            }
            if (this.autoLockTimer) {
                clearTimeout(this.autoLockTimer);
                this.autoLockTimer = null;
            }

        } catch (error) {
        }
    }

    /**
     * Initialize unlock status from storage
     */
    async initializeUnlockStatus() {
        try {
            const storage = await chrome.storage.local.get(['walletUnlocked', 'lastUnlockTime', 'passwordSkipped', 'hashedPassword', 'encryptedSessionKey']);
            const now = Date.now();
            if (storage.passwordSkipped) {
                this.sessionKey = await this.getDeviceEncryptionKey();
                this.isUnlocked = true;
                await this.persistUnlockStatus(true);
                if (this.walletManager && !this.walletManager.isReady()) {
                    try {
                        await this.walletManager.initialize(this.sessionKey);
                    } catch (error) {
                    }
                }
                return;
            }
            if (storage.walletUnlocked && storage.lastUnlockTime) {
                let decryptedSessionKey = null;
                if (storage.encryptedSessionKey) {
                    try {
                        decryptedSessionKey = await this.decryptSessionKey(storage.encryptedSessionKey);
                        if (decryptedSessionKey) {                        }
                    } catch (error) {
                    }
                }
                if (this.autoLockDuration === 0) {
                    if (decryptedSessionKey) {
                        this.sessionKey = decryptedSessionKey;
                        this.isUnlocked = true;
                        if (this.walletManager && !this.walletManager.isReady()) {
                            await this.walletManager.initialize(this.sessionKey);
                        }
                    } else {
                        this.isUnlocked = false;
                    }
                    return;
                }
                const timeSinceUnlock = now - storage.lastUnlockTime;
                const autoLockMs = this.autoLockDuration * 1000;

                if (timeSinceUnlock < autoLockMs) {
                    if (decryptedSessionKey) {
                        this.sessionKey = decryptedSessionKey;
                        this.isUnlocked = true;
                        if (this.walletManager && !this.walletManager.isReady()) {
                            await this.walletManager.initialize(this.sessionKey);
                        }
                    } else {
                        this.isUnlocked = false;
                    }
                    return;
                } else {
                }
            }
            this.isUnlocked = false;
            if (storage.walletUnlocked) {
                await chrome.storage.local.remove(['walletUnlocked', 'lastUnlockTime', 'encryptedSessionKey']);
            }

        } catch (error) {
            this.isUnlocked = false;
        }
    }

    /**
     * Encrypt sessionKey for secure local storage
     * @param {string} sessionKey
     * @returns {Promise<string>}
     */
    async encryptSessionKey(sessionKey) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(sessionKey);
            const storage = await chrome.storage.local.get(['salt']);
            const keyMaterial = encoder.encode(navigator.userAgent + (storage.salt || ''));
            const hashBuffer = await crypto.subtle.digest('SHA-256', keyMaterial);
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                hashBuffer,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                cryptoKey,
                data
            );
            const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encryptedBuffer), iv.length);
            return btoa(String.fromCharCode.apply(null, combined));
        } catch (error) {
            throw error;
        }
    }

    /**
     * Decrypt sessionKey from local storage
     * @param {string} encryptedData
     * @returns {Promise<string>}
     */
    async decryptSessionKey(encryptedData) {
        try {
            const encoder = new TextEncoder();
            const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const encryptedBuffer = combined.slice(12);
            const storage = await chrome.storage.local.get(['salt']);
            const keyMaterial = encoder.encode(navigator.userAgent + (storage.salt || ''));
            const hashBuffer = await crypto.subtle.digest('SHA-256', keyMaterial);
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                hashBuffer,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                cryptoKey,
                encryptedBuffer
            );
            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);
        } catch (error) {
            return null;
        }
    }

    /**
     * Update last activity time (for user interactions)
     */
    async updateLastActivity() {
        try {
            if (this.isUnlocked) {
                await chrome.storage.local.set({
                    lastUnlockTime: Date.now()
                });
                this.resetAutoLockTimer();
            }
        } catch (error) {
        }
    }

    /**
     * Persist unlock status to storage
     * @param {boolean} updateLastUnlockTime
     */
    async persistUnlockStatus(updateLastUnlockTime = true) {
        try {
            const data = {
                walletUnlocked: this.isUnlocked
            };
            if (updateLastUnlockTime) {
                data.lastUnlockTime = Date.now();
            } else {
                const existing = await chrome.storage.local.get(['lastUnlockTime']);
                if (existing.lastUnlockTime) {
                    data.lastUnlockTime = existing.lastUnlockTime;
                }
            }

            await chrome.storage.local.set(data);
            if (this.isUnlocked && this.sessionKey) {
                const encryptedSessionKey = await this.encryptSessionKey(this.sessionKey);
                await chrome.storage.local.set({
                    encryptedSessionKey: encryptedSessionKey
                });
            }
            const verification = await chrome.storage.local.get(['walletUnlocked', 'lastUnlockTime']);
        } catch (error) {
        }
    }
    
    /**
     * Change password
     * @param {string} currentPassword
     * @param {string} newPassword
     * @returns {Promise<Object>}
     */
    async changePassword(currentPassword, newPassword) {
        
        try {
            const isCurrentValid = await this.verifyPassword(currentPassword);
            if (!isCurrentValid) {
                return {
                    success: false,
                    error: 'Current password is incorrect'
                };
            }
            let existingWallets = [];
            if (this.walletManager && this.walletManager.isReady()) {
                existingWallets = this.walletManager.getAllWallets();
            }
            if (!newPassword || newPassword.trim() === '') {
                const deviceKey = await this.getDeviceEncryptionKey();
                await chrome.storage.local.set({
                    passwordSkipped: true
                });
                this.sessionKey = deviceKey;
                this.isUnlocked = true;
                await this.persistUnlockStatus(true);
                if (existingWallets.length > 0) {
                    const walletStorage = new WalletStorage();
                    const activeWalletId = existingWallets.find(w => w.isActive)?.id || existingWallets[0]?.id;
                    await walletStorage.storeWallets(existingWallets, deviceKey, activeWalletId);
                }
                if (this.walletManager) {
                    await this.walletManager.initialize(deviceKey);
                }
                await chrome.storage.local.remove(['hashedPassword', 'salt']);
                const verification = await chrome.storage.local.get(['hashedPassword', 'salt', 'passwordSkipped']);

                if (verification.hashedPassword || verification.salt) {
                    throw new Error('Failed to clear password storage');
                }

                return {
                    success: true
                };
            }
            if (newPassword.length < 8) {
                return {
                    success: false,
                    error: 'New password must be at least 8 characters long'
                };
            }
            
            const strength = this.calculatePasswordStrength(newPassword);
            if (strength.strength === 'weak') {
                return {
                    success: false,
                    error: 'New password is too weak. Please use a stronger password.'
                };
            }
            await this.initializeStorage(newPassword);
            await chrome.storage.local.remove(['passwordSkipped']);
            if (existingWallets.length > 0) {
                const walletStorage = new WalletStorage();
                const activeWalletId = existingWallets.find(w => w.isActive)?.id || existingWallets[0]?.id;
                await walletStorage.storeWallets(existingWallets, newPassword, activeWalletId);
            }
            
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
}
window.PasswordManager = PasswordManager;
