/**
 * Shared configuration constants for 0xio Wallet Extension
 * Centralizes all configuration values to avoid duplication
 */

const globalContext = typeof window !== 'undefined' ? window : self;

globalContext.OctraConfig = {
    NETWORKS: {
        testnet: {
            name: 'Testnet',
            rpc_url: 'https://octra.network',
            explorer_url: 'https://octrascan.io/tx',
            explorer_address_url: 'https://octrascan.io/addr',
            color: '#f59e0b',
            default: true,
            editable: false
        },
        custom: {
            name: 'Custom Network',
            rpc_url: '',
            explorer_url: '',
            explorer_address_url: '',
            color: '#8b5cf6', 
            default: false,
            editable: true
        }
    },
    

    NETWORK: {
        RPC_URL: 'https://octra.network',
        EXPLORER_URL: 'https://octrascan.io/tx',
        EXPLORER_ADDRESS_URL: 'https://octrascan.io/addr',
        REQUEST_TIMEOUT: 30000, 
        RETRY_CONFIG: {
            MAX_RETRIES: 3,
            BASE_DELAY: 2000,     
            MAX_DELAY: 8000,      
            BACKOFF_MULTIPLIER: 2,
            JITTER_FACTOR: 0.1    
        }
    },


    UI: {
        MESSAGE_AUTO_HIDE_TIMEOUT: 5000, 
        SUCCESS_MESSAGE_TIMEOUT: 3000,   
        DOM_WAIT_TIMEOUT: 5000,         
        UI_MANAGER_WAIT_TIMEOUT: 5000,   
        LOADING_DEBOUNCE: 100,           
        ACTIVITY_THROTTLE: 3000          
    },


    WALLET: {
        MAX_WALLETS: 5,
        ADDRESS_LENGTH: 47,
        ADDRESS_PREFIX: 'oct',
        PRIVATE_KEY_LENGTH: 44,       
        PUBLIC_KEY_LENGTH: 44,          
        CACHE_TTL: 30000,               
        BALANCE_CACHE_TTL: 30000,       
        HISTORY_CACHE_TTL: 60000,         
        WALLET_NAME_MAX_LENGTH: 8
    },


    SECURITY: {
        MIN_PASSWORD_LENGTH: 4,          
        RECOMMENDED_PASSWORD_LENGTH: 8,  
        AUTO_LOCK_OPTIONS: [             
            { value: 0, label: 'Never' },
            { value: 60, label: '1 minute' },
            { value: 300, label: '5 minutes' },
            { value: 900, label: '15 minutes' },
            { value: 1800, label: '30 minutes' },
            { value: 3600, label: '1 hour' }
        ],
        DEFAULT_AUTO_LOCK: 300,
        ERROR_DISPLAY_COOLDOWN: 5000
    },


    TRANSACTION: {
        MIN_AMOUNT: 0.000001,
        FEE_TIERS: {
            LOW: 1,
            HIGH: 3
        },
        CONFIRMATION_BLOCKS: 1,
        MAX_MESSAGE_LENGTH: 1000,
        BULK_PRIVATE_TRANSFER: {
            ENABLE_RETRY: false
        }
    },


    STORAGE: {
        KEYS: {
            WALLETS: 'octra_wallets',
            ACTIVE_WALLET: 'octra_active_wallet',
            PASSWORD_HASH: 'octra_password_hash',
            UNLOCK_STATUS: 'octra_unlock_status',
            AUTO_LOCK_SETTING: 'octra_auto_lock_setting',
            USER_PREFERENCES: 'octra_user_preferences',
            CURRENT_NETWORK: 'octra_current_network',
            CUSTOM_NETWORK_CONFIG: 'octra_custom_network_config'
        }
    },


    ENDPOINTS: {
        BALANCE: '/balance/',
        SEND_TX: '/send-tx',
        HISTORY: '/address/',
        STAGING: '/staging',
        STATUS: '/status',

        PRIVATE: {
            VIEW_ENCRYPTED_BALANCE: '/view_encrypted_balance/',
            ENCRYPT_BALANCE: '/encrypt_balance',
            DECRYPT_BALANCE: '/decrypt_balance',
            PRIVATE_TRANSFER: '/private_transfer',
            CLAIM_PRIVATE_TRANSFER: '/claim_private_transfer',
            PENDING_PRIVATE_TRANSFERS: '/pending_private_transfers', 
            PUBLIC_KEY: '/public_key/'
        }
    },


    VERSION: {
        EXTENSION: '1.0.0',
        MANIFEST: 3,
        API_VERSION: 'v1'
    },


    DEV: {
        ENABLE_CONSOLE_LOGS: false,
        ENABLE_DEBUG_FEATURES: false,
        MOCK_NETWORK_CALLS: false
    }
};

Object.freeze(globalContext.OctraConfig);