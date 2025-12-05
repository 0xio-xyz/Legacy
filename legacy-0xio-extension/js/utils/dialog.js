/**
 * Custom Confirmation Dialog Utility
 * Provides a branded confirmation dialog for the 0xio Wallet extension
 */

/**
 * Show custom confirmation dialog
 * @param {string} title
 * @param {string} message
 * @param {string} confirmText
 * @param {string} cancelText
 * @returns {Promise<boolean>}
 */
function showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {

        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
            <h3 class="dialog-title">${title}</h3>
            <p class="dialog-message">${message.replace(/\n/g, '<br>')}</p>
            <div class="dialog-buttons">
                <button class="btn btn-secondary dialog-cancel">${cancelText}</button>
                <button class="btn btn-danger dialog-confirm">${confirmText}</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const confirmBtn = dialog.querySelector('.dialog-confirm');
        const cancelBtn = dialog.querySelector('.dialog-cancel');

        const cleanup = () => {
            document.body.removeChild(overlay);
        };

        confirmBtn.addEventListener('click', () => {
            cleanup();
            resolve(true);
        });

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', handleEscape);
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
    });
}

// Export for ES modules and make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showConfirmDialog };
}
if (typeof window !== 'undefined') {
    window.showConfirmDialog = showConfirmDialog;
}
