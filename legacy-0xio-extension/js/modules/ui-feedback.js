/**
 * UI Feedback Module
 * Handles loading states, messages, and user feedback throughout the application
 */

class UIFeedbackModule {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.messageTimeout = null;
        this.loadingOverlay = null;
    }

    /**
     * Initialize UI feedback functionality
     */
    init() {
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for feedback UI
     */
    setupEventListeners() {
        this.addEventListenerSafe('message-close', 'click', () => this.hideMessage());
    }

    /**
     * Safe event listener helper
     */
    addEventListenerSafe(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...') {
        if (this.loadingOverlay) {
            const messageEl = this.loadingOverlay.querySelector('#loading-text');
            if (messageEl) {
                messageEl.textContent = message;
            }
            this.loadingOverlay.classList.remove('hidden');
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show message to user
     * @param {string} message
     * @param {string} type
     */
    showMessage(message, type = 'info') {
        try {
            const messageContainer = document.getElementById('message-container');
            if (!messageContainer) {
                return;
            }
            if (this.messageTimeout) {
                clearTimeout(this.messageTimeout);
            }
            const validTypes = ['info', 'error', 'success', 'warning'];
            const messageType = validTypes.includes(type) ? type : 'info';
            const messageEl = document.createElement('div');
            messageEl.className = 'message';
            messageEl.classList.add(messageType);
            if (typeof message === 'string' && message.includes('<') && message.includes('>')) {
                messageEl.innerHTML = message;
            } else {
                const sanitizedMessage = String(message).replace(/[\r\n]+/g, ' ').trim();
                messageEl.textContent = sanitizedMessage;
            }
            messageContainer.innerHTML = '';
            messageContainer.appendChild(messageEl);
            const timeout = window.OctraConfig?.UI?.MESSAGE_AUTO_HIDE_TIMEOUT || 5000;
            this.messageTimeout = setTimeout(() => {
                try {
                    if (messageEl.parentNode === messageContainer) {
                        messageContainer.removeChild(messageEl);
                    }
                } catch (removeError) {
                }
            }, timeout);
        } catch (error) {
        }
    }

    /**
     * Hide message immediately
     */
    hideMessage() {
        try {
            const messageOverlay = document.getElementById('message-overlay');
            if (messageOverlay) {
                messageOverlay.classList.add('hidden');
                messageOverlay.style.cssText = '';
            }
            const messageContainer = document.getElementById('message-container');
            if (messageContainer) {
                messageContainer.innerHTML = '';
            }
            if (this.messageTimeout) {
                clearTimeout(this.messageTimeout);
                this.messageTimeout = null;
            }
        } catch (error) {
        }
    }

    /**
     * Handle error for user experience
     */
    handleError(error) {
        this.showMessage(error.message || 'An unexpected error occurred', 'error');
        this.hideLoading();
        if (this.uiManager && typeof this.uiManager.refreshCurrentScreen === 'function') {
            this.uiManager.refreshCurrentScreen();
        }
    }

    /**
     * Show error message 
     * @param {string} message
     */
    showError(message) {
        this.showMessage(message, 'error');
    }

    /**
     * Show success message 
     * @param {string} message
     */
    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    /**
     * Show warning message 
     * @param {string} message
     */
    showWarning(message) {
        this.showMessage(message, 'warning');
    }

    /**
     * Show info message ()
     * @param {string} message
     */
    showInfo(message) {
        this.showMessage(message, 'info');
    }

    /**
     * Clear all feedback (loading and messages)
     */
    clearAll() {
        this.hideLoading();
        this.hideMessage();
    }
}
window.UIFeedbackModule = UIFeedbackModule;