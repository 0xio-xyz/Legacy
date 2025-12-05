/**
 * DOM Utilities for 0xio Wallet Extension
 * Provides safe DOM access with timing checks and fallback mechanisms
 */

class DOMUtils {
    constructor() {
        this.elementCache = new Map();
        this.observerRegistry = new Map();
    }

    /**
     * Safely get element with fallback options and timeout
     * @param {string|Array} selectors
     * @param {Object} options
     * @returns {Promise<Element|null>}
     */
    async safeGetElement(selectors, options = {}) {
        const {
            timeout = 5000,
            retryInterval = 100,
            useCache = true,
            required = false,
            parent = document
        } = options;

        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
        const cacheKey = selectorArray.join('|');
        if (useCache && this.elementCache.has(cacheKey)) {
            const cached = this.elementCache.get(cacheKey);
            if (this.isElementVisible(cached)) {
                return cached;
            } else {
                this.elementCache.delete(cacheKey);
            }
        }

        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = Math.ceil(timeout / retryInterval);

            const tryFind = () => {
                attempts++;

                for (const selector of selectorArray) {
                    try {
                        const element = parent.querySelector(selector);
                        if (element && this.isElementAccessible(element)) {
                            if (useCache) {
                                this.elementCache.set(cacheKey, element);
                            }
                            
                            resolve(element);
                            return;
                        }
                    } catch (error) {
                    }
                }

                if (attempts >= maxAttempts) {
                    const errorMsg = `Element not found after ${attempts} attempts. Tried selectors: ${selectorArray.join(', ')}`;
                    
                    if (required) {
                        reject(new Error(errorMsg));
                    } else {
                        resolve(null);
                    }
                } else {
                    setTimeout(tryFind, retryInterval);
                }
            };

            tryFind();
        });
    }

    /**
     * Get element with multiple fallback selectors for wallet list content
     * @returns {Promise<Element>}
     */
    async getWalletListContainer() {
        const selectors = [
            '#wallet-list-content',
            '.wallet-list-container',
            '#wallet-list-screen .wallet-cards-container',
            '.wallet-cards-container',
            '#wallet-list-screen .content'
        ];

        const element = await this.safeGetElement(selectors, {
            timeout: 3000,
            required: true
        });

        if (!element) {
            throw new Error('Wallet list container not found. Available containers: ' + 
                          this.getAvailableContainers().join(', '));
        }

        return element;
    }

    /**
     * Get screen element with fallback
     * @param {string} screenId
     * @returns {Promise<Element>}
     */
    async getScreenElement(screenId) {
        await this.waitForDOMReady();
        let element = document.getElementById(screenId);
        if (element && document.contains(element)) {
            return element;
        }
        const selectors = [
            `#${screenId}`,
            `.screen[data-screen="${screenId}"]`,
            `.${screenId}`,
            `[id="${screenId}"]`
        ];

        element = await this.safeGetElement(selectors, {
            timeout: 2000,
            required: false,
            retryInterval: 100
        });

        if (!element) {
            const allScreens = Array.from(document.querySelectorAll('.screen'));
            const targetById = document.querySelector(`#${screenId}`);
            if (targetById) {
                return targetById; 
            }
            
            throw new Error(`Screen "${screenId}" not found. Available screens: ${allScreens.map(s => s.id).filter(Boolean).join(', ')}`);
        }
        return element;
    }

    /**
     * Wait for DOM to be ready for interaction
     * @param {number} timeout
     * @returns {Promise<boolean>}
     */
    async waitForDOMReady(timeout = 5000) {
        if (document.readyState === 'complete') {
            return true;
        }

        return new Promise((resolve) => {
            let timeoutId;
            
            const handleReady = () => {
                if (timeoutId) clearTimeout(timeoutId);
                document.removeEventListener('DOMContentLoaded', handleReady);
                window.removeEventListener('load', handleReady);
                resolve(true);
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', handleReady, { once: true });
            }
            window.addEventListener('load', handleReady, { once: true });
            const checkReady = () => {
                if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    handleReady();
                }
            };
            checkReady();
            const pollInterval = setInterval(() => {
                checkReady();
            }, 50);
            timeoutId = setTimeout(() => {
                clearInterval(pollInterval);
                document.removeEventListener('DOMContentLoaded', handleReady);
                window.removeEventListener('load', handleReady);
                const finalReady = document.readyState === 'complete' || document.readyState === 'interactive';
                resolve(finalReady);
            }, timeout);
        });
    }

    /**
     * Wait for specific element to be available and accessible
     * @param {string} selector
     * @param {number} timeout
     * @returns {Promise<Element|null>}
     */
    async waitForElement(selector, timeout = 5000) {
        return this.safeGetElement(selector, { timeout, required: false });
    }

    /**
     * Check if element is accessible (exists in DOM)
     * @param {Element} element
     * @param {boolean} checkVisibility
     * @returns {boolean}
     */
    isElementAccessible(element, checkVisibility = false) {
        if (!element || !element.parentNode) {
            return false;
        }
        if (!document.contains(element)) {
            return false;
        }
        if (!checkVisibility) {
            return true;
        }
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }

        return true;
    }

    /**
     * Check if element is visible (not hidden by CSS)
     * @param {Element} element
     * @returns {boolean}
     */
    isElementVisible(element) {
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        
        return rect.width > 0 && 
               rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' &&
               style.opacity !== '0';
    }

    /**
     * Safely set element content with error handling
     * @param {Element|string} element
     * @param {string} content
     * @param {boolean} isHTML
     */
    async safeSetContent(element, content, isHTML = true) {
        try {
            const targetElement = typeof element === 'string' 
                ? await this.safeGetElement(element)
                : element;

            if (!targetElement) {
                return false;
            }

            if (isHTML) {
                targetElement.innerHTML = content;
            } else {
                targetElement.textContent = content;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Safely add event listener with automatic cleanup
     * @param {Element|string} element
     * @param {string} eventType
     * @param {Function} handler
     * @param {Object} options
     */
    async safeAddEventListener(element, eventType, handler, options = {}) {
        try {
            const targetElement = typeof element === 'string' 
                ? await this.safeGetElement(element)
                : element;

            if (!targetElement) {
                return false;
            }

            targetElement.addEventListener(eventType, handler, options);
            if (!this.observerRegistry.has(targetElement)) {
                this.observerRegistry.set(targetElement, []);
            }
            this.observerRegistry.get(targetElement).push({ eventType, handler, options });

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Show/hide screen with proper transition handling
     * @param {string} targetScreenId
     * @param {string} currentScreenId
     */
    async safeShowScreen(targetScreenId, currentScreenId = null) {
        try {
            await this.waitForDOMReady();
            if (currentScreenId) {
                const currentScreen = await this.safeGetElement(`#${currentScreenId}`, { required: false });
                if (currentScreen) {
                    currentScreen.classList.add('hidden');
                }
            } else {
                const allScreens = document.querySelectorAll('.screen');
                allScreens.forEach(screen => screen.classList.add('hidden'));
            }
            const targetScreen = await this.getScreenElement(targetScreenId);
            targetScreen.classList.remove('hidden');

            return true;

        } catch (error) {
            if (targetScreenId !== 'main-screen') {
                const mainScreen = await this.safeGetElement('#main-screen', { required: false });
                if (mainScreen) {
                    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
                    mainScreen.classList.remove('hidden');
                }
            }
            
            throw error;
        }
    }

    /**
     * Get available containers for debugging
     * @returns {Array<string>}
     */
    getAvailableContainers() {
        const selectors = [
            '#wallet-list-content',
            '.wallet-list-container',
            '.wallet-cards-container',
            '#wallet-list-screen',
            '.content'
        ];

        return selectors.filter(selector => {
            try {
                return document.querySelector(selector) !== null;
            } catch {
                return false;
            }
        });
    }

    /**
     * Clear element cache and cleanup observers
     */
    cleanup() {
        this.elementCache.clear();
        for (const [element, listeners] of this.observerRegistry) {
            listeners.forEach(({ eventType, handler, options }) => {
                try {
                    element.removeEventListener(eventType, handler, options);
                } catch (error) {
                }
            });
        }
        this.observerRegistry.clear();
    }

    /**
     * Debug: Log current DOM state
     */
    debugDOMState() {
        const debugInfo = {
            readyState: document.readyState,
            screens: Array.from(document.querySelectorAll('.screen')).map(s => s.id),
            containers: this.getAvailableContainers(),
            cachedElements: Array.from(this.elementCache.keys())
        };
        return debugInfo;
    }
}
window.DOMUtils = DOMUtils;
window.domUtils = new DOMUtils(); 