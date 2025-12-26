#!/usr/bin/env node

/**
 * 0xio Wallet Recovery CLI Tool
 * Recover wallet address and private key from BIP39 seed phrase
 *
 * Usage:
 * node mnemonic-to-wallet.js "word1 word2 ... word12" [derivation_path]
 *
 * Examples:
 * node mnemonic-to-wallet.js "abandon ... art"
 * node mnemonic-to-wallet.js "abandon ... art" "m/345'/0'/0'/0'/0'/0'/0'/0"
 */

const crypto = require('crypto');
let nacl;

try {
    nacl = require('tweetnacl');
} catch (e) {
    console.error('\x1b[31mError: TweetNaCl not found. Please install dependencies:\x1b[0m');
    console.error('npm install tweetnacl');
    process.exit(1);
}

class WalletRecovery {
    constructor() {
        this.privateKey = null;
        this.publicKey = null;
        this.signingKey = null;
    }

    stringToBytes(str) {
        return Buffer.from(str, 'utf8');
    }

    bytesToBase64(bytes) {
        return Buffer.from(bytes).toString('base64');
    }

    bytesToHex(bytes) {
        return Buffer.from(bytes).toString('hex');
    }

    sha256(data) {
        return crypto.createHash('sha256').update(Buffer.from(data)).digest();
    }

    bytesToBase58(bytes) {
        const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        if (bytes.length === 0) return '';
        let num = 0n;
        for (let i = 0; i < bytes.length; i++) {
            num = num * 256n + BigInt(bytes[i]);
        }
        let encoded = '';
        while (num > 0n) {
            const remainder = num % 58n;
            num = num / 58n;
            encoded = alphabet[Number(remainder)] + encoded;
        }
        for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
            encoded = '1' + encoded;
        }
        return encoded;
    }

    hmacSha512(key, data) {
        return crypto.createHmac('sha512', Buffer.from(key))
            .update(Buffer.from(data))
            .digest();
    }

    async mnemonicToSeed(mnemonic, passphrase = "") {
        return new Promise((resolve, reject) => {
            const mnemonicBuffer = this.stringToBytes(mnemonic);
            const saltBuffer = this.stringToBytes("mnemonic" + passphrase);

            crypto.pbkdf2(
                mnemonicBuffer,
                saltBuffer,
                2048,  
                64,   
                'sha512',
                (err, derivedKey) => {
                    if (err) reject(err);
                    else resolve(new Uint8Array(derivedKey));
                }
            );
        });
    }

    deriveMasterKey(seed) {
        const key = this.stringToBytes("Octra seed");
        const hmac = this.hmacSha512(key, seed);

        return {
            privateKey: new Uint8Array(hmac.slice(0, 32)),
            chainCode: new Uint8Array(hmac.slice(32, 64))
        };
    }

    deriveChildKey(parentKey, parentChainCode, index) {
        const indexBuffer = Buffer.alloc(4);
        indexBuffer.writeUInt32BE(index, 0);
        
        let data;

        if (index >= 0x80000000) {
            data = Buffer.concat([
                Buffer.from([0x00]),
                Buffer.from(parentKey),
                indexBuffer
            ]);
        } else {
            const keyPair = nacl.sign.keyPair.fromSeed(parentKey);
            const publicKey = Buffer.from(keyPair.publicKey);
            
            data = Buffer.concat([
                publicKey,
                indexBuffer
            ]);
        }

        const hmac = this.hmacSha512(parentChainCode, data);

        return {
            privateKey: new Uint8Array(hmac.slice(0, 32)),
            chainCode: new Uint8Array(hmac.slice(32, 64))
        };
    }

    derivePath(rootKey, path) {
        if (!path || path === 'm' || path === '/') {
            return rootKey;
        }

        const segments = path.toLowerCase().split('/');
        let currentKey = rootKey;

        for (const segment of segments) {
            if (segment === 'm' || segment === '') continue;

            const isHardened = segment.endsWith("'") || segment.endsWith("h");
            let index = parseInt(segment.replace(/['h]/, ''), 10);

            if (isNaN(index)) throw new Error(`Invalid path segment: ${segment}`);

            if (isHardened) {
                index += 0x80000000;
            }
            currentKey = this.deriveChildKey(currentKey.privateKey, currentKey.chainCode, index);
        }

        return currentKey;
    }

    deriveAddress(publicKey) {
        try {
            const publicKeyBytes = Buffer.from(publicKey, 'base64');
            const hash = this.sha256(publicKeyBytes);
            const base58Hash = this.bytesToBase58(hash);
            return 'oct' + base58Hash;
        } catch (error) {
            throw new Error('Failed to derive address: ' + error.message);
        }
    }

    async recoverFromMnemonic(mnemonic, derivationPath = null) {
        try {
            const normalizedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
            const words = normalizedMnemonic.split(' ');
            if (words.length !== 12) {
                throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
            }

            const seed = await this.mnemonicToSeed(normalizedMnemonic);
            let activeKey = this.deriveMasterKey(seed);

            if (derivationPath) {
                activeKey = this.derivePath(activeKey, derivationPath);
            }

            this.signingKey = nacl.sign.keyPair.fromSeed(activeKey.privateKey);

            const privateKeyRaw = activeKey.privateKey;
            const publicKeyRaw = this.signingKey.publicKey;

            const privateKeyB64 = this.bytesToBase64(privateKeyRaw);
            const publicKeyB64 = this.bytesToBase64(publicKeyRaw);

            const address = this.deriveAddress(publicKeyB64);

            this.privateKey = privateKeyB64;
            this.publicKey = publicKeyB64;

            return {
                success: true,
                address: address,
                privateKey: privateKeyB64,
                publicKey: publicKeyB64,
                derivationPath: derivationPath || "m (Master)",
                seedHex: this.bytesToHex(seed)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

async function main() {
    console.log('\n\x1b[36m╔════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║    0xio Wallet Recovery Tool + Derivation     ║\x1b[0m');
    console.log('\x1b[36m╚════════════════════════════════════════════════╝\x1b[0m\n');

    const args = process.argv.slice(2);
    
    let mnemonic = "";
    let derivationPath = null;

    if (args.length >= 1) mnemonic = args[0];
    if (args.length >= 2) derivationPath = args[1];

    if (!mnemonic) {
        console.log('\x1b[33mUsage:\x1b[0m');
        console.log('  node mnemonic-to-wallet.js "seed phrase" [derivation_path]\n');
        console.log('\x1b[33mExamples:\x1b[0m');
        console.log('  node mnemonic-to-wallet.js "word1 ... word12"');
        console.log('  node mnemonic-to-wallet.js "word1 ... word12" "m/345\'/0\'/0\'/0\'/0\'/0\'/0\'/0"\n');
        process.exit(1);
    }

    console.log('\x1b[90m Security Warning: Never share your seed phrase or private key!\x1b[0m\n');
    
    if (derivationPath) {
        console.log(`Using derivation path: \x1b[33m${derivationPath}\x1b[0m`);
    } else {
        console.log(`Using default path: \x1b[33mm (Master Key)\x1b[0m`);
    }
    console.log('Processing...\n');

    const recovery = new WalletRecovery();
    const result = await recovery.recoverFromMnemonic(mnemonic, derivationPath);

    if (result.success) {
        console.log('\x1b[32m✓ Wallet recovered successfully!\x1b[0m\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\x1b[1mWallet Information:\x1b[0m');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('\x1b[36mAddress:\x1b[0m');
        console.log('  ' + result.address + '\n');

        console.log('\x1b[36mPrivate Key (Base64):\x1b[0m');
        console.log('  ' + result.privateKey + '\n');

        console.log('\x1b[36mPublic Key (Base64):\x1b[0m');
        console.log('  ' + result.publicKey + '\n');

        console.log('\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    } else {
        console.log('\x1b[31m✗ Failed to recover wallet\x1b[0m');
        console.log('\x1b[31mError: ' + result.error + '\x1b[0m\n');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('\x1b[31mUnexpected error:', error.message, '\x1b[0m');
        process.exit(1);
    });
}

module.exports = { WalletRecovery };