/**
 * 0xio Wallet Extension - Content Script
 * Selectively injects wallet API only into pages with 0xio SDK integration
 */

/**
 * Check if the current page has 0xio SDK integration
 * Uses signature-based detection instead of port/domain-based detection
 */
function has0xioSDKIntegration() {
    const detectionMethods = [];

    const sdkScripts = document.querySelectorAll('script[src*="@0xgery/0xio-sdk"], script[src*="0xio-sdk"]');
    if (sdkScripts.length > 0) {
        detectionMethods.push('SDK script imports');
        return { detected: true, method: 'SDK script imports', confidence: 'high' };
    }

    const meta = document.querySelector('meta[name="0xio-wallet"], meta[name="0xio-dapp"], meta[name="octra-wallet"], meta[name="octra-dapp"]');
    if (meta && meta.content) {
        try {
            const metaData = JSON.parse(meta.content);
            if (metaData.name || metaData.version) {
                detectionMethods.push('0xio meta tags');
                return { detected: true, method: '0xio meta tags', confidence: 'high' };
            }
        } catch (e) {
            const content = meta.content.toLowerCase();
            if (content.includes('0xio') || content.includes('octra')) {
                detectionMethods.push('Basic meta tag');
                return { detected: true, method: 'Basic meta tag', confidence: 'medium' };
            }
        }
    }

    const sdkElements = document.querySelectorAll('[data-0xio-sdk], .0xio-sdk-app, [data-0xio-app], [data-octra-sdk], [data-octra-app]');
    if (sdkElements.length > 0) {
        detectionMethods.push('SDK DOM markers');
        return { detected: true, method: 'SDK DOM markers', confidence: 'high' };
    }

    if (typeof window.ZeroXIOWallet !== 'undefined' || typeof window.wallet0xio !== 'undefined') {
        detectionMethods.push('Global SDK object');
        return { detected: true, method: 'Global SDK object', confidence: 'high' };
    }

    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
        if (script.textContent) {
            if (script.textContent.includes('@0xgery/0xio-sdk') ||
                script.textContent.includes('ZeroXIOWallet') ||
                script.textContent.includes('create0xioWallet') ||
                script.textContent.includes('new ZeroXIOWallet(')) {
                detectionMethods.push('SDK JavaScript references');
                return { detected: true, method: 'SDK JavaScript references', confidence: 'high' };
            }
        }
    }

    const globals = ['wallet0xio', 'ZeroXIOWallet', '__0XIO_APP__', 'octraWallet'];
    for (const global of globals) {
        if (typeof window[global] !== 'undefined') {
            detectionMethods.push(`Global: ${global}`);
            return { detected: true, method: `Global: ${global}`, confidence: 'medium' };
        }
    }

    const titleSignatures = ['0xio', '0x.io', 'dapp suite', 'wallet integration'];
    const pageTitle = document.title.toLowerCase();
    for (const signature of titleSignatures) {
        if (pageTitle.includes(signature)) {
            const hasUrlMatch = window.location.href.toLowerCase().includes('0xio') ||
                                window.location.href.toLowerCase().includes('octra');
            const hasMetaDescription = document.querySelector('meta[name="description"]')?.content?.toLowerCase()?.includes('0xio') ||
                                      document.querySelector('meta[name="description"]')?.content?.toLowerCase()?.includes('octra');

            if (hasUrlMatch || hasMetaDescription) {
                detectionMethods.push('Page signature');
                return { detected: true, method: 'Page signature', confidence: 'low' };
            }
        }
    }

    return { detected: false, method: null, confidence: null };
}


/**
 * Inject the SDK bridge into the page
 */
function injectSDKBridge() {
    if (document.querySelector('[data-0xio-sdk-bridge]')) {
        return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('bridge.js');
    script.setAttribute('data-0xio-sdk-bridge', 'true'); 
    script.onload = function() {
        this.remove(); 
    };
    script.onerror = function() {
    };

    (document.head || document.documentElement).appendChild(script);
}

/**
 * Check for integration and inject if found
 */
function checkAndInject() {
    const detection = has0xioSDKIntegration();

    if (detection.detected) {
        injectSDKBridge();
        setupMessageHandlers();
        return true;
    } else {
        return false;
    }
}

let injected = false;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        injected = checkAndInject();
    });
} else {
    injected = checkAndInject();
}

let checkCount = 0;
const maxChecks = 5;
const checkInterval = setInterval(() => {
    checkCount++;
    
    if (!injected && checkCount < maxChecks) {
        injected = checkAndInject();
    }
    
    if (injected || checkCount >= maxChecks) {
        clearInterval(checkInterval);
    }
}, 1000); 

function setupMessageHandlers() {
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        if (!event.data || event.data.source !== '0xio-wallet-injected') return;

        chrome.runtime.sendMessage({
            type: 'DAPP_MESSAGE',
            data: event.data,
            origin: window.location.origin,
            hostname: window.location.hostname,
            url: window.location.href
        }, (response) => {
            if (chrome.runtime.lastError) {
                return;
            }

            window.postMessage({
                source: '0xio-wallet-content',
                requestId: event.data.requestId,
                response: response
            }, '*');
        });
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === 'DAPP_EVENT') {
            window.postMessage({
                source: '0xio-wallet-content',
                type: 'event',
                eventData: message.eventData
            }, '*');
        } else if (message.source === '0xio-wallet-disconnect') {
            window.postMessage({
                source: '0xio-wallet-content',
                type: 'disconnect',
                data: message.data
            }, '*');
        }

        sendResponse({ success: true });
    });
}
