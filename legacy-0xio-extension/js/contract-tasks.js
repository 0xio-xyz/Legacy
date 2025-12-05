/**
 * Contract Tasks Module
 * Independent contract interaction system for Octra Extension
 */

class ContractTasks {
    constructor(networkClient, uiManager) {
        this.network = networkClient;
        this.ui = uiManager;
        this.usageStats = this.loadUsageStats();
        this.contractInterface = {
            "contract": "octBUHw585BrAMPMLQvGuWx4vqEsybYH9N7a3WNj1WBwrDn",
            "methods": [
                {
                    "name": "greetCaller",
                    "label": "greeting (get personal msg)",
                    "params": [],
                    "type": "view"
                },
                {
                    "name": "getSpec",
                    "label": "contract info (get contract description)",
                    "params": [],
                    "type": "view"
                },
                {
                    "name": "claimToken",
                    "label": "claim 1 token (only once per address)",
                    "params": [],
                    "type": "call"
                },
                {
                    "name": "getCredits",
                    "label": "check token balance",
                    "params": [
                        {"name": "address", "type": "address"}
                    ],
                    "type": "view"
                },
                {
                    "name": "dotProduct",
                    "label": "dot product (x1 * x2 + y1 * y2)",
                    "params": [
                        {"name": "x1", "type": "number"},
                        {"name": "y1", "type": "number"},
                        {"name": "x2", "type": "number"},
                        {"name": "y2", "type": "number"}
                    ],
                    "type": "view"
                },
                {
                    "name": "vectorMagnitude",
                    "label": "vector magnitude sqrt(x^2 + y^2)",
                    "params": [
                        {"name": "x", "type": "number"},
                        {"name": "y", "type": "number"}
                    ],
                    "type": "view"
                },
                {
                    "name": "power",
                    "label": "power (base^exponent)",
                    "params": [
                        {"name": "base", "type": "number"},
                        {"name": "exponent", "type": "number", "max": 255}
                    ],
                    "type": "view"
                },
                {
                    "name": "factorial",
                    "label": "factorial (n!)",
                    "params": [
                        {"name": "n", "type": "number", "max": 20}
                    ],
                    "type": "view"
                },
                {
                    "name": "fibonacci",
                    "label": "fibonacci number",
                    "params": [
                        {"name": "n", "type": "number", "max": 100}
                    ],
                    "type": "view"
                },
                {
                    "name": "gcd",
                    "label": "greatest common divisor",
                    "params": [
                        {"name": "a", "type": "number"},
                        {"name": "b", "type": "number"}
                    ],
                    "type": "view"
                },
                {
                    "name": "isPrime",
                    "label": "check if number is prime",
                    "params": [
                        {"name": "n", "type": "number"}
                    ],
                    "type": "view"
                },
                {
                    "name": "matrixDeterminant2x2",
                    "label": "2x2 matrix determinant (ad - bc)",
                    "params": [
                        {"name": "a", "type": "number"},
                        {"name": "b", "type": "number"},
                        {"name": "c", "type": "number"},
                        {"name": "d", "type": "number"}
                    ],
                    "type": "view"
                },
                {
                    "name": "linearInterpolate",
                    "label": "linear interpolation",
                    "params": [
                        {"name": "x0", "type": "number"},
                        {"name": "y0", "type": "number"},
                        {"name": "x1", "type": "number"},
                        {"name": "y1", "type": "number"},
                        {"name": "x", "type": "number"}
                    ],
                    "type": "view"
                },
                {
                    "name": "modularExponentiation",
                    "label": "modular exponentiation (base^exp mod m)",
                    "params": [
                        {"name": "base", "type": "number"},
                        {"name": "exp", "type": "number"},
                        {"name": "mod", "type": "number"}
                    ],
                    "type": "view"
                }
            ]
        };
    }

    /**
     * Load usage statistics from storage
     */
    loadUsageStats() {
        try {
            const stored = localStorage.getItem('octra_contract_usage_stats');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            return {};
        }
    }

    /**
     * Save usage statistics to storage
     */
    saveUsageStats() {
        try {
            localStorage.setItem('octra_contract_usage_stats', JSON.stringify(this.usageStats));
        } catch (error) {
        }
    }

    /**
     * Track method usage
     */
    trackMethodUsage(methodName) {
        if (!this.usageStats[methodName]) {
            this.usageStats[methodName] = {
                count: 0,
                lastUsed: null
            };
        }
        this.usageStats[methodName].count++;
        this.usageStats[methodName].lastUsed = new Date().toISOString();
        this.saveUsageStats();
    }

    /**
     * Create a persistent overlay that doesn't auto-close
     */
    showPersistentDialog(content) {
        this.hidePersistentDialog();
        const overlay = document.createElement('div');
        overlay.id = 'contract-dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--card-gradient);
            backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 8px;
            padding: 12px;
            width: 95%;
            max-width: 340px;
            max-height: 80vh;
            overflow-y: auto;
            color: var(--text-primary);
            box-shadow: var(--glass-shadow-strong);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            word-wrap: break-word;
            overflow-wrap: break-word;
        `;
        
        dialog.innerHTML = content;
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hidePersistentDialog();
            }
        });
        this.bindDialogEvents();
        
        document.body.appendChild(overlay);
    }

    /**
     * Bind event listeners for dialog elements
     */
    bindDialogEvents() {
        setTimeout(() => {
            const closeBtn = document.querySelector('[data-action="contract-close-dialog"]');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hidePersistentDialog());
            }
            document.querySelectorAll('[data-action="execute-method"]').forEach(btn => {
                const methodIndex = parseInt(btn.dataset.methodIndex);
                btn.addEventListener('click', () => this.executeMethod(methodIndex));
            });
            const submitBtn = document.querySelector('[data-action="submit-parameters"]');
            if (submitBtn) {
                const paramCount = parseInt(submitBtn.dataset.paramCount);
                submitBtn.addEventListener('click', () => this.submitParameters(paramCount));
            }
            const cancelBtn = document.querySelector('[data-action="cancel-parameters"]');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => this.cancelParameters());
            }
            const confirmBtn = document.querySelector('[data-action="contract-confirm-transaction"]');
            if (confirmBtn) {
                const methodName = confirmBtn.dataset.methodName;
                const params = JSON.parse(confirmBtn.dataset.params || '[]');
                confirmBtn.addEventListener('click', () => this.confirmTransaction(methodName, params));
            }
            document.querySelectorAll('[data-action="contract-back-to-methods"]').forEach(btn => {
                btn.addEventListener('click', () => this.showContractMethodsMenu());
            });
            document.querySelectorAll('[data-action="contract-start-task"]').forEach(btn => {
                btn.addEventListener('click', () => this.startOCS01Task());
            });
            document.querySelectorAll('[data-action="contract-close-dialog"]').forEach(btn => {
                btn.addEventListener('click', () => this.hidePersistentDialog());
            });
            document.querySelectorAll('input[data-focus-color]').forEach(input => {
                input.addEventListener('focus', function() {
                    this.style.borderColor = this.dataset.focusColor;
                });
                input.addEventListener('blur', function() {
                    this.style.borderColor = this.dataset.blurColor;
                });
                if (input.type === 'number') {
                    input.addEventListener('wheel', function(e) {
                        e.preventDefault();
                        this.blur();
                    }, { passive: false });
                    
                    input.addEventListener('keydown', function(e) {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                        }
                    });
                }
            });
        }, 10);
    }

    /**
     * Hide persistent dialog
     */
    hidePersistentDialog() {
        const existing = document.getElementById('contract-dialog-overlay');
        if (existing) {
            existing.remove();
        }
    }

    /**
     * Start the OCS01 contract testing interface
     */
    async startOCS01Task() {
        try {
            const walletManager = this.ui.getWalletManager();
            const wallet = walletManager?.getActiveWallet();
            if (!wallet) {
                this.ui.showMessage('Error', 'No active wallet found. Please create or select a wallet first.');
                return;
            }
            this.showContractMethodsMenu();
        } catch (error) {
            this.ui.showMessage('Error', `Failed to start contract task: ${error.message}`);
        }
    }

    /**
     * Display contract methods menu
     */
    showContractMethodsMenu() {
        const methodsHtml = this.contractInterface.methods.map((method, index) => {
            const usageCount = this.usageStats[method.name]?.count || 0;
            const typeColor = method.type === 'view' ? 'var(--primary-color)' : 'var(--secondary-color)';
            const typeIcon = method.type === 'view' ? 'VIEW' : 'CALL';
            
            return `
                <div class="contract-method" 
                     data-action="execute-method" 
                     data-method-index="${index}"
                     style="
                        margin: 8px 0; 
                        padding: 12px; 
                        background: linear-gradient(135deg, var(--glass-bg-subtle) 0%, var(--glass-bg-subtle) 100%);
                        border: 1px solid var(--glass-bg);
                        border-radius: 8px; 
                        cursor: pointer; 
                        transition: all 0.2s ease;
                     ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <div style="font-weight: 500; color: var(--text-primary); font-size: 13px;">
                            ${typeIcon} ${method.label}
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="background: ${typeColor}; color: white; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 500;">
                                ${method.type.toUpperCase()}
                            </span>
                            ${usageCount > 0 ? `<span style="color: var(--text-muted); font-size: 10px;">${usageCount}x</span>` : ''}
                        </div>
                    </div>
                    <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 3px;">
                        <code style="background: var(--code-bg); padding: 1px 4px; border-radius: 3px; font-size: 10px;">
                            ${method.name}
                        </code>
                    </div>
                    <div style="color: #a0aec0; font-size: 10px;">
                        ${method.params.length > 0 ? ` ${method.params.length} param${method.params.length > 1 ? 's' : ''}` : ' No params'}
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div style="text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h2 style="margin: 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">
                        OCS01 Testing
                    </h2>
                    <button data-action="contract-close-dialog" 
                            style="
                                background: var(--glass-bg); 
                                border: 1px solid var(--glass-border); 
                                color: var(--text-primary); 
                                padding: 6px 10px; 
                                border-radius: 6px; 
                                cursor: pointer; 
                                font-size: 11px;
                            ">
                        ✕
                    </button>
                </div>
                
                <div style="background: var(--info-box-bg); padding: 10px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 3px;">Contract:</div>
                    <code style="color: var(--primary-color); font-size: 10px; word-break: break-all;">${this.contractInterface.contract}</code>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <h3 style="color: var(--text-primary); font-size: 14px; margin-bottom: 10px;">
                         Methods (${this.contractInterface.methods.length})
                    </h3>
                    <div style="max-height: 350px; overflow-y: auto;">
                        ${methodsHtml}
                    </div>
                </div>
                
                <div style="background: var(--button-secondary-bg); border: 1px solid var(--glass-border-medium); border-radius: 6px; padding: 10px;">
                    <div style="color: var(--text-primary); font-size: 11px; font-weight: 500; margin-bottom: 6px;">Note:</div>
                    <div style="font-size: 10px; line-height: 1.4;">
                        <div strong style="color: var(--primary-color);">VIEW</strong> - Read-only, instant</div>
                        <div strong style="color: var(--secondary-color);">CALL</strong> - Requires transaction</div>
                    </div>
                </div>
            </div>
        `;

        this.showPersistentDialog(content);
    }

    /**
     * Execute a specific contract method
     */
    async executeMethod(methodIndex) {
        try {
            const method = this.contractInterface.methods[methodIndex];
            if (!method) {
                throw new Error('Method not found');
            }
            this.trackMethodUsage(method.name);
            const params = await this.getMethodParameters(method);
            if (params === null) return; 
            const walletManager = this.ui.getWalletManager();
            const wallet = walletManager?.getActiveWallet();
            if (!wallet) {
                throw new Error('No active wallet found');
            }
            if (method.type === 'view') {
                await this.executeViewMethod(method, params, wallet);
            } else if (method.type === 'call') {
                await this.executeCallMethod(method, params, wallet);
            } else {
                throw new Error(`Unknown method type: ${method.type}`);
            }

        } catch (error) {
            this.showPersistentDialog(`
                <div style="text-align: center; padding: 20px;">
                    <h3 style="color: var(--error-color); margin-bottom: 16px;"> Execution Error</h3>
                    <p style="color: var(--text-primary); margin-bottom: 20px;">${error.message}</p>
                    <button data-action="contract-back-to-methods" 
                            style="background: var(--primary-gradient); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;">
                        Back to Methods
                    </button>
                </div>
            `);
        }
    }

    /**
     * Get parameters for a method from user input
     */
    async getMethodParameters(method) {
        if (method.params.length === 0) {
            return [];
        }

        return new Promise((resolve) => {
            const paramInputs = method.params.map((param, index) => {
                const placeholder = param.example || `Enter ${param.name}`;
                const maxAttr = param.max ? `max="${param.max}"` : '';
                return `
                    <div style="margin: 16px 0;">
                        <label style="display: block; margin-bottom: 8px; color: var(--text-primary); font-weight: 500; font-size: 14px;">
                             ${param.name} 
                            <span style="color: var(--text-muted); font-weight: 400;">(${param.type})</span>
                            ${param.max ? `<span style="color: var(--warning-color); font-size: 12px;"> - max: ${param.max}</span>` : ''}
                        </label>
                        <input type="${param.type === 'number' ? 'number' : 'text'}" 
                               id="param_${index}" 
                               placeholder="${placeholder}"
                               ${maxAttr}
                               style="
                                   width: 100%; 
                                   padding: 12px; 
                                   border: 1px solid var(--glass-border-light); 
                                   border-radius: 8px; 
                                   background: rgba(0, 0, 0, 0.3); 
                                   color: var(--text-primary);
                                   font-size: 14px;
                                   transition: border-color 0.3s ease;
                                   -moz-appearance: textfield;
                               "
                               data-focus-color="var(--primary-color)"
                               data-blur-color="var(--glass-border-light)"
                        ${param.example ? `<div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">Note: Example: ${param.example}</div>` : ''}
                    </div>
                `;
            }).join('');

            const content = `
                <div style="text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h2 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;">
                            ${method.label}
                        </h2>
                        <button data-action="contract-back-to-methods" 
                                style="
                                    background: var(--glass-bg); 
                                    border: 1px solid var(--glass-border); 
                                    color: var(--text-primary); 
                                    padding: 6px 10px; 
                                    border-radius: 6px; 
                                    cursor: pointer; 
                                    font-size: 11px;
                                ">
                            ←
                        </button>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 10px; border-radius: 6px; margin-bottom: 16px;">
                        <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 3px;">Method:</div>
                        <code style="color: var(--primary-color); font-size: 12px;">${method.name}</code>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: var(--text-primary); font-size: 14px; margin-bottom: 12px;">
                             Parameters (${method.params.length})
                        </h3>
                        ${paramInputs}
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button data-action="submit-parameters" 
                                data-param-count="${method.params.length}"
                                style="
                                    background: var(--primary-gradient); 
                                    color: white; 
                                    border: none; 
                                    padding: 10px 20px; 
                                    border-radius: 6px; 
                                    cursor: pointer; 
                                    font-size: 13px;
                                    font-weight: 500;
                                ">
                             Execute
                        </button>
                        <button data-action="contract-back-to-methods" 
                                style="
                                    background: var(--glass-bg); 
                                    color: var(--text-primary); 
                                    border: 1px solid var(--glass-border); 
                                    padding: 10px 20px; 
                                    border-radius: 6px; 
                                    cursor: pointer; 
                                    font-size: 13px;
                                ">
                            Back
                        </button>
                    </div>
                </div>
            `;

            this.showPersistentDialog(content);
            this.parameterResolver = resolve;
        });
    }

    /**
     * Submit parameters from the form
     */
    submitParameters(paramCount) {
        const params = [];
        let hasErrors = false;
        
        for (let i = 0; i < paramCount; i++) {
            const input = document.getElementById(`param_${i}`);
            if (input) {
                const value = input.value.trim();
                if (!value) {
                    input.style.borderColor = 'var(--error-color)';
                    hasErrors = true;
                } else {
                    input.style.borderColor = 'var(--primary-color)';
                    params.push(value);
                }
            }
        }
        
        if (hasErrors) {
            const errorDiv = document.createElement('div');
            errorDiv.id = 'param-error';
            errorDiv.style.cssText = `
                background: rgba(255, 107, 107, 0.1);
                border: 1px solid rgba(255, 107, 107, 0.3);
                color: var(--error-color);
                padding: 12px;
                border-radius: 8px;
                margin: 16px 0;
                text-align: center;
                font-size: 14px;
            `;
            errorDiv.innerHTML = ' Please fill in all required parameters';
            const existingError = document.getElementById('param-error');
            if (existingError) {
                existingError.remove();
            }
            const dialog = document.querySelector('#contract-dialog-overlay > div');
            if (dialog) {
                const buttons = dialog.querySelector('div[style*="display: flex"]') || 
                               dialog.querySelector('.button-container') ||
                               dialog.lastElementChild;
                
                if (buttons && buttons.parentNode === dialog) {
                    dialog.insertBefore(errorDiv, buttons);
                } else {
                    dialog.appendChild(errorDiv);
                }
            }
            
            return;
        }
        
        if (this.parameterResolver) {
            this.parameterResolver(params);
            this.parameterResolver = null;
        }
        
        this.hidePersistentDialog();
    }

    /**
     * Cancel parameter input and go back to methods
     */
    cancelParameters() {
        if (this.parameterResolver) {
            this.parameterResolver(null);
            this.parameterResolver = null;
        }
        
        this.showContractMethodsMenu();
    }

    /**
     * Execute a view method (read-only)
     */
    async executeViewMethod(method, params, wallet) {
        try {
            this.showPersistentDialog(`
                <div style="text-align: center; padding: 40px;">
                    <div style="
                        width: 32px;
                        height: 32px;
                        border: 3px solid var(--glass-border);
                        border-top: 3px solid var(--primary-color);
                        border-radius: 50%;
                        margin: 0 auto 16px;
                        animation: spin 1s linear infinite;
                    "></div>
                    <h3 style="color: var(--text-primary); margin-bottom: 8px; font-size: 16px;">Executing View Method</h3>
                    <p style="color: var(--text-muted); margin: 0; font-size: 14px;">${method.label}</p>
                </div>
            `);
            const response = await this.network.contractCallView(
                this.contractInterface.contract,
                method.name,
                params,
                wallet.address
            );
            const content = `
                <div style="text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h2 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;">
                            ${method.label} - Result
                        </h2>
                        <button data-action="contract-close-dialog" 
                                style="
                                    background: var(--glass-bg); 
                                    border: 1px solid var(--glass-border); 
                                    color: var(--text-primary); 
                                    padding: 6px 10px; 
                                    border-radius: 6px; 
                                    cursor: pointer; 
                                    font-size: 11px;
                                ">
                            ✕
                        </button>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 8px; border-radius: 6px; margin-bottom: 10px;">
                        <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 2px;">Method:</div>
                        <code style="color: var(--primary-color); font-size: 12px;">${method.name}</code>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 8px; border-radius: 6px; margin-bottom: 12px;">
                        <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 2px;">Parameters:</div>
                        <code style="color: var(--text-primary); font-size: 12px;">${params.length > 0 ? params.join(', ') : 'none'}</code>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: var(--text-primary); font-size: 14px; margin-bottom: 8px;">Result:</h3>
                        <div style="
                            background: rgba(0, 0, 0, 0.4); 
                            border: 1px solid rgba(102, 126, 234, 0.3);
                            padding: 12px; 
                            border-radius: 6px; 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; 
                            font-size: 13px;
                            color: var(--success-color);
                            word-break: break-word;
                            overflow-wrap: break-word;
                            line-height: 1.4;
                        ">
                            ${(response || 'No result returned').toString().trim()}
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button data-action="contract-back-to-methods" 
                                style="
                                    background: var(--primary-gradient); 
                                    color: white; 
                                    border: none; 
                                    padding: 12px 24px; 
                                    border-radius: 8px; 
                                    cursor: pointer; 
                                    font-size: 14px;
                                    font-weight: 500;
                                    transition: transform 0.2s ease;
                                ">
                             Back to Methods
                        </button>
                    </div>
                </div>
            `;

            this.showPersistentDialog(content);

        } catch (error) {
            this.showPersistentDialog(`
                <div style="text-align: center; padding: 20px;">
                    <h3 style="color: var(--error-color); margin-bottom: 16px;"> View Method Failed</h3>
                    <p style="color: var(--text-primary); margin-bottom: 20px;">${error.message}</p>
                    <button data-action="contract-back-to-methods" 
                            style="background: var(--primary-gradient); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;">
                        Back to Methods
                    </button>
                </div>
            `);
        }
    }

    /**
     * Execute a call method (transaction)
     */
    async executeCallMethod(method, params, wallet) {
        try {            
            const content = `
                <div style="text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h2 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;">
                             ${method.label} - Confirm Transaction
                        </h2>
                        <button data-action="contract-close-dialog" 
                                style="
                                    background: var(--glass-bg); 
                                    border: 1px solid var(--glass-border); 
                                    color: var(--text-primary); 
                                    padding: 6px 10px; 
                                    border-radius: 6px; 
                                    cursor: pointer; 
                                    font-size: 11px;
                                ">
                            ✕
                        </button>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                        <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 4px;">Method:</div>
                        <code style="color: var(--primary-color); font-size: 13px;">${method.name}</code>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                        <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 4px;">Parameters:</div>
                        <code style="color: var(--text-primary); font-size: 13px;">${params.length > 0 ? params.join(', ') : 'none'}</code>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                        <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 4px;">Contract:</div>
                        <code style="color: var(--text-primary); font-size: 11px; word-break: break-all;">${this.contractInterface.contract}</code>
                    </div>
                    
                    <div style="background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                        <div style="color: var(--warning-color); font-size: 14px; font-weight: 500;"> This will create a transaction on the blockchain</div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">Transaction fees will apply</div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button data-action="contract-confirm-transaction" 
                                data-method-name="${method.name}"
                                data-params='${JSON.stringify(params)}'
                                style="
                                    background: var(--warning-color); 
                                    color: white; 
                                    border: none; 
                                    padding: 12px 20px; 
                                    border-radius: 8px; 
                                    cursor: pointer; 
                                    font-size: 14px;
                                    font-weight: 500;
                                ">
                             Confirm & Send
                        </button>
                        <button data-action="contract-back-to-methods" 
                                style="
                                    background: var(--glass-bg); 
                                    color: var(--text-primary); 
                                    border: 1px solid var(--glass-border); 
                                    padding: 12px 20px; 
                                    border-radius: 8px; 
                                    cursor: pointer; 
                                    font-size: 14px;
                                ">
                            Back
                        </button>
                    </div>
                </div>
            `;
            
            this.showPersistentDialog(content);

        } catch (error) {
            this.ui.showMessage('Error', `Call method failed: ${error.message}`);
        }
    }

    /**
     * Confirm and execute transaction
     */
    async confirmTransaction(methodName, params) {
        try {
            const walletManager = this.ui.getWalletManager();
            const wallet = walletManager?.getActiveWallet();
            if (!wallet) {
                throw new Error('No active wallet found');
            }
            if (methodName === 'claimToken') {
                this.showPersistentDialog(`
                    <div style="text-align: center; padding: 40px;">
                        <div style="
                            width: 32px;
                            height: 32px;
                            border: 3px solid var(--glass-border);
                            border-top: 3px solid var(--primary-color);
                            border-radius: 50%;
                            margin: 0 auto 16px;
                            animation: spin 1s linear infinite;
                        "></div>
                        <h3 style="color: var(--text-primary); margin-bottom: 8px; font-size: 16px;">Checking Eligibility</h3>
                        <p style="color: var(--text-muted); margin: 0; font-size: 14px;">Verifying if tokens can be claimed...</p>
                    </div>
                `);

                try {
                    const currentCredits = await this.network.contractCallView(
                        this.contractInterface.contract,
                        'getCredits',
                        [wallet.address],
                        wallet.address
                    );

                    const creditsBalanceRaw = parseInt(currentCredits || '0');

                    if (creditsBalanceRaw > 0) {
                        let formattedBalance;
                        let decimals = 12; 
                        const balance6 = creditsBalanceRaw / 1_000_000; // 6 decimals
                        const balance12 = creditsBalanceRaw / 1_000_000_000_000; // 12 decimals  
                        const balance18 = creditsBalanceRaw / Math.pow(10, 18); // 18 decimals 
                        if (balance12 >= 0.1 && balance12 <= 1_000_000) {
                            formattedBalance = balance12.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 6
                            });
                            decimals = 12;
                        } else if (balance6 >= 0.1 && balance6 <= 1_000_000) {
                            formattedBalance = balance6.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 6
                            });
                            decimals = 6;
                        } else {
                            formattedBalance = creditsBalanceRaw.toLocaleString();
                            decimals = 0;
                        }
                        const errorContent = `
                            <div style="text-align: center; padding: 20px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                    <h2 style="margin: 0; color: var(--error-color); font-size: 16px; font-weight: 600;">
                                        Already Claimed
                                    </h2>
                                    <button data-action="contract-close-dialog" 
                                            style="
                                                background: var(--glass-bg); 
                                                border: 1px solid var(--glass-border); 
                                                color: var(--text-primary); 
                                                padding: 6px 10px; 
                                                border-radius: 6px; 
                                                cursor: pointer; 
                                                font-size: 11px;
                                            ">
                                        Close
                                    </button>
                                </div>
                                
                                <div style="background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                                    <div style="color: var(--warning-color); font-size: 14px; font-weight: 500; margin-bottom: 8px;">Tokens Already Claimed</div>
                                    <div style="color: var(--text-muted); font-size: 13px; line-height: 1.4;">
                                        You have already claimed ${formattedBalance} test tokens. Each address can only claim once.
                                    </div>
                                </div>
                                
                                <div style="text-align: center;">
                                    <button data-action="contract-back-to-methods" 
                                            style="
                                                background: var(--primary-gradient); 
                                                color: white; 
                                                border: none; 
                                                padding: 12px 20px; 
                                                border-radius: 8px; 
                                                cursor: pointer; 
                                                font-size: 14px;
                                                font-weight: 500;
                                            ">
                                        Back to Methods
                                    </button>
                                </div>
                            </div>
                        `;
                        this.showPersistentDialog(errorContent);
                        return;
                    }
                } catch (error) {
                }
            }
            this.showPersistentDialog(`
                <div style="text-align: center; padding: 40px;">
                    <div style="
                        width: 32px;
                        height: 32px;
                        border: 3px solid var(--glass-border);
                        border-top: 3px solid var(--primary-color);
                        border-radius: 50%;
                        margin: 0 auto 16px;
                        animation: spin 1s linear infinite;
                    "></div>
                    <h3 style="color: var(--text-primary); margin-bottom: 8px; font-size: 16px;">Creating Transaction</h3>
                    <p style="color: var(--text-muted); margin: 0; font-size: 14px;">Signing and broadcasting transaction...</p>
                </div>
            `);
            const txHash = await this.network.contractCall(
                this.contractInterface.contract,
                methodName,
                params,
                wallet.address,
                wallet.privateKey
            );
            const successContent = `
                <div style="text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h2 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;">
                             Transaction Sent
                        </h2>
                        <button data-action="contract-close-dialog" 
                                style="
                                    background: var(--glass-bg); 
                                    border: 1px solid var(--glass-border); 
                                    color: var(--text-primary); 
                                    padding: 6px 10px; 
                                    border-radius: 6px; 
                                    cursor: pointer; 
                                    font-size: 11px;
                                ">
                            ✕
                        </button>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                        <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 4px;">Method:</div>
                        <code style="color: var(--primary-color); font-size: 13px;">${methodName}</code>
                    </div>
                    
                    <div style="background: var(--info-box-bg); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                        <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 4px;">Transaction Hash:</div>
                        <code style="color: var(--success-color); font-size: 11px; word-break: break-all; font-family: monospace;">${txHash}</code>
                    </div>
                    
                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                        <div style="color: var(--success-color); font-size: 14px; font-weight: 500;"> Transaction sent successfully!</div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">The transaction is now pending confirmation on the blockchain.</div>
                    </div>
                    
                    <div style="text-align: center;">
                        <button data-action="contract-back-to-methods" 
                                style="
                                    background: var(--success-color); 
                                    color: white; 
                                    border: none; 
                                    padding: 12px 20px; 
                                    border-radius: 8px; 
                                    cursor: pointer; 
                                    font-size: 14px;
                                    font-weight: 500;
                                ">
                            Back to Methods
                        </button>
                    </div>
                </div>
            `;
            
            this.showPersistentDialog(successContent);

        } catch (error) {            
            let errorMessage = error.message;
            if (errorMessage.includes('already claimed') || errorMessage.includes('once per address')) {
                errorMessage = 'Token already claimed for this address. Each address can only claim once.';
            }
            
            const errorContent = `
                <div style="text-align: center; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h2 style="margin: 0; color: var(--error-color); font-size: 16px; font-weight: 600;">
                            Transaction Failed
                        </h2>
                        <button data-action="contract-close-dialog" 
                                style="
                                    background: var(--glass-bg); 
                                    border: 1px solid var(--glass-border); 
                                    color: var(--text-primary); 
                                    padding: 6px 10px; 
                                    border-radius: 6px; 
                                    cursor: pointer; 
                                    font-size: 11px;
                                ">
                            Close
                        </button>
                    </div>
                    
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                        <div style="color: var(--error-color); font-size: 14px; font-weight: 500; margin-bottom: 8px;">Error Details</div>
                        <div style="color: var(--text-muted); font-size: 13px; line-height: 1.4;">${errorMessage}</div>
                    </div>
                    
                    <div style="text-align: center;">
                        <button data-action="contract-back-to-methods" 
                                style="
                                    background: var(--primary-gradient); 
                                    color: white; 
                                    border: none; 
                                    padding: 12px 20px; 
                                    border-radius: 8px; 
                                    cursor: pointer; 
                                    font-size: 14px;
                                    font-weight: 500;
                                ">
                            Back to Methods
                        </button>
                    </div>
                </div>
            `;
            
            this.showPersistentDialog(errorContent);
        }
    }

    /**
     * Show contract info and details
     */
    viewOCS01Info() {
        const viewMethods = this.contractInterface.methods.filter(m => m.type === 'view');
        const callMethods = this.contractInterface.methods.filter(m => m.type === 'call');
        const totalUsage = Object.values(this.usageStats).reduce((sum, stat) => sum + stat.count, 0);
        const mostUsedMethod = Object.entries(this.usageStats)
            .sort(([,a], [,b]) => b.count - a.count)[0];

        const content = `
            <div style="text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">
                        OCS01 Task Details
                    </h2>
                    <button data-action="contract-close-dialog" 
                            style="
                                background: var(--glass-bg); 
                                border: 1px solid var(--glass-border); 
                                color: var(--text-primary); 
                                padding: 6px 10px; 
                                border-radius: 6px; 
                                cursor: pointer; 
                                font-size: 11px;
                                transition: all 0.3s ease;
                            ">
                        Close
                    </button>
                </div>
                
                <div style="background: var(--button-secondary-bg); border: 1px solid var(--glass-border-medium); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <p style="text-align: center; color: var(--text-muted); margin: 0; font-size: 14px;">Testing environment for OCS01</p>
                </div>
                
                <div style="background: var(--info-box-bg); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 8px;">Contract Address:</div>
                    <code style="color: var(--primary-color); font-size: 11px; word-break: break-all;">${this.contractInterface.contract}</code>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div style="background: var(--button-secondary-bg); border: 1px solid rgba(102,126,234,0.2); border-radius: 6px; padding: 12px;">
                        <div style="color: var(--primary-color); font-size: 14px; margin-bottom: 6px; font-weight: 600;">VIEW</div>
                        <div style="color: var(--text-primary); font-size: 16px; font-weight: 600;">${viewMethods.length}</div>
                        <div style="color: var(--text-muted); font-size: 11px;">View Methods</div>
                        <div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">Read-only operations</div>
                    </div>
                    <div style="background: rgba(118,75,162,0.1); border: 1px solid rgba(118,75,162,0.2); border-radius: 6px; padding: 12px;">
                        <div style="color: var(--secondary-color); font-size: 14px; margin-bottom: 6px; font-weight: 600;">CALL</div>
                        <div style="color: var(--text-primary); font-size: 16px; font-weight: 600;">${callMethods.length}</div>
                        <div style="color: var(--text-muted); font-size: 11px;">Call Methods</div>
                        <div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">Requires transactions</div>
                    </div>
                </div>
                
                ${totalUsage > 0 ? `
                <div style="background: var(--info-box-bg); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="color: var(--text-primary); margin: 0 0 12px 0; font-size: 14px;"> Usage Statistics</h4>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="color: var(--text-muted); font-size: 12px;">Total Executions</div>
                            <div style="color: var(--success-color); font-size: 16px; font-weight: 600;">${totalUsage}</div>
                        </div>
                        ${mostUsedMethod ? `
                        <div style="text-align: right;">
                            <div style="color: var(--text-muted); font-size: 12px;">Most Used Method</div>
                            <div style="color: var(--primary-color); font-size: 14px; font-weight: 500;">${mostUsedMethod[0]} (${mostUsedMethod[1].count}x)</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button data-action="contract-start-task" 
                            style="
                                background: var(--primary-gradient); 
                                color: white; 
                                border: none; 
                                padding: 12px 24px; 
                                border-radius: 8px; 
                                cursor: pointer; 
                                font-size: 14px;
                                font-weight: 500;
                                transition: transform 0.2s ease;
                            ">
                         Start Testing
                    </button>
                </div>
            </div>
        `;

        this.showPersistentDialog(content);
    }
}
window.ContractTasks = ContractTasks;