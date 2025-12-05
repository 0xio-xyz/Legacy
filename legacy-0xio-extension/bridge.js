/**
 * 0xio Wallet SDK Bridge
 * Communication bridge between SDK and extension content script
 */

(function() {
    if (window.__0xioSdkBridgeLoaded) {
        return;
    }
    window.__0xioSdkBridgeLoaded = true;

    window.addEventListener('message', function(event) {
        if (event.source !== window || !event.data) return;

        if (event.data.source === '0xio-sdk-request' ||
            event.data.source === 'octra-sdk-request' ||
            event.data.type === '0xio-sdk-request' ||
            event.data.type === 'octra-sdk-request') {

            const request = event.data.request || event.data;
            const requestId = request.id || event.data.id;
            const forwardedMessage = {
                source: '0xio-wallet-injected',
                requestId: requestId,
                method: request.method || event.data.method,
                params: request.params || event.data.params
            };

            window.postMessage(forwardedMessage, '*');
        }
    });

    window.addEventListener('message', function(event) {
        if (event.source !== window || !event.data) return;

        if (event.data.source === '0xio-wallet-content') {
            if (event.data.response) {
                const sdkResponse = {
                    source: '0xio-sdk-bridge',
                    response: {
                        id: event.data.requestId,
                        success: event.data.response.success,
                        data: event.data.response.data,
                        error: event.data.response.error,
                        timestamp: Date.now()
                    }
                };

                window.postMessage(sdkResponse, '*');
            } else if (event.data.type === 'disconnect') {
                window.postMessage({
                    source: '0xio-sdk-bridge',
                    event: {
                        type: 'disconnect',
                        data: event.data.data,
                        timestamp: Date.now()
                    }
                }, '*');
            } else if (event.data.type === 'event') {
                window.postMessage({
                    source: '0xio-sdk-bridge',
                    event: event.data.eventData
                }, '*');
            }
        }
    });
})();