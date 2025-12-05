/**
 * Module Loader
 * Loads and initializes all extension modules
 */

class ModuleLoader {
    constructor() {
        this.modules = new Map();
        this.loadingPromises = [];
    }

    /**
     * Load all modules
     */
    async loadModules() {
        const moduleConfigs = [
            {
                name: 'uiFeedback',
                path: './js/modules/ui-feedback.js',
                className: 'UIFeedbackModule'
            },
            {
                name: 'settings',
                path: './js/modules/settings.js',
                className: 'SettingsModule'
            },
            {
                name: 'screenNavigator',
                path: './js/modules/screen-navigator.js',
                className: 'ScreenNavigatorModule'
            },
            {
                name: 'bulkSend',
                path: './js/modules/bulk-send.js',
                className: 'BulkSendModule'
            },
            {
                name: 'bulkPrivateSend',
                path: './js/modules/bulk-private-send.js',
                className: 'BulkPrivateSendModule'
            },
            {
                name: 'transactionHistory',
                path: './js/modules/transaction-history.js',
                className: 'TransactionHistoryModule'
            },
            {
                name: 'walletOperations',
                path: './js/modules/wallet-operations.js',
                className: 'WalletOperationsModule'
            },
            {
                name: 'walletIO',
                path: './js/modules/wallet-io.js',
                className: 'WalletIOModule'
            },
            {
                name: 'walletList',
                path: './js/modules/wallet-list.js',
                className: 'WalletListModule'
            }
        ];
        const loadPromises = moduleConfigs.map(config => this.loadModule(config));
        await Promise.all(loadPromises);

        return this.modules;
    }

    /**
     * Load a single module
     */
    async loadModule(config) {
        try {
            const script = document.createElement('script');
            script.src = config.path;
            script.type = 'text/javascript';
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Failed to load module: ${config.name}`));
                document.head.appendChild(script);
            });
            const ModuleClass = window[config.className];
            if (!ModuleClass) {
                throw new Error(`Module class ${config.className} not found after loading ${config.path}`);
            }
            this.modules.set(config.name, {
                config,
                ModuleClass,
                instance: null
            });


        } catch (error) {
            throw error;
        }
    }

    /**
     * Initialize all loaded modules with UI manager
     */
    initializeModules(uiManager) {
        const initializedModules = {};

        for (const [name, moduleInfo] of this.modules) {
            try {
                const instance = new moduleInfo.ModuleClass(uiManager);
                if (typeof instance.init === 'function') {
                    instance.init();
                }
                moduleInfo.instance = instance;
                initializedModules[name] = instance;
                window[name + 'Module'] = instance;


            } catch (error) {
            }
        }

        return initializedModules;
    }

    /**
     * Get module instance by name
     */
    getModule(name) {
        const moduleInfo = this.modules.get(name);
        return moduleInfo ? moduleInfo.instance : null;
    }

    /**
     * Get all module instances
     */
    getAllModules() {
        const instances = {};
        for (const [name, moduleInfo] of this.modules) {
            if (moduleInfo.instance) {
                instances[name] = moduleInfo.instance;
            }
        }
        return instances;
    }

    /**
     * Check if a module is loaded
     */
    isModuleLoaded(name) {
        return this.modules.has(name) && this.modules.get(name).instance !== null;
    }

    /**
     * Reload a specific module
     */
    async reloadModule(name) {
        const moduleInfo = this.modules.get(name);
        if (!moduleInfo) {
            throw new Error(`Module ${name} not found`);
        }
        await this.loadModule(moduleInfo.config);
    }

    /**
     * Cleanup all modules
     */
    cleanup() {
        for (const [name, moduleInfo] of this.modules) {
            if (moduleInfo.instance && typeof moduleInfo.instance.cleanup === 'function') {
                try {
                    moduleInfo.instance.cleanup();
                } catch (error) {
                }
            }
        }
        
        this.modules.clear();
    }
}
window.moduleLoader = new ModuleLoader();
window.ModuleLoader = ModuleLoader;