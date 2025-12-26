# 0xio Wallet Recovery Tool

> **Securely recover your 0xio wallet address and private keys from your 12-word BIP39 seed phrase.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org)
[![Security](https://img.shields.io/badge/Security-Client%20Side%20Only-blue)](https://github.com/0xGery/Recovery-tools)

---

## Choose Your Recovery Method

You can use this tool in two ways: instantly in your browser (no setup) or via the command line (for developers/air-gapped devices).

### Web Version (Easiest & Mobile Friendly)

Access the tool directly in your browser. It runs **100% client-side**—your seed phrase is never sent to any server.

**[Launch Recovery Tool](https://0xio-xyz.github.io/Recovery-tools/)**

* **Works on:** Desktop, iPhone, Android, Tablet.
* **No installation required.**
* **Offline Capable:** Load the page, then disconnect your internet for maximum security.

### CLI Version (Advanced / Offline)

Run the tool locally using Node.js. Ideal for developers or use on strictly air-gapped computers.

```bash
# 1. Clone the repository
git clone [https://github.com/0xio-xyz/Recovery-tools.git](https://github.com/0xio-xyz/Recovery-tools.git)
cd Recovery-tools

# 2. Install dependencies (TweetNaCl)
npm install

# 3. Recover your wallet (Standard)
# Usage: node mnemonic-to-wallet.js "your twelve words here"
node mnemonic-to-wallet.js "abandon ability able about above absent absorb abstract absurd abuse access accident"

# 4. Recover with Custom Derivation Path (Optional)
# Usage: node mnemonic-to-wallet.js "seed phrase" "path"
node mnemonic-to-wallet.js "abandon ability able about above absent absorb abstract absurd abuse access accident" "m/345'/0'/0'/0'/0'/0'/0'/0"

```

---

## What This Tool Does
It takes your **12-word seed phrase** (and optional derivation path) and calculates your wallet credentials using the official Octra/0xio derivation standards.

| Input | Output |
| --- | --- |
| **Mnemonic** (Seed Phrase) | ✅ **Wallet Address** (`oct...`) |
| **Derivation Path** (Optional) | ✅ **Private Key** (Base64) |
|  | ✅ **Public Key** (Base64) |

### Recovery Example
**Input:**

> `abandon ability able about above absent absorb abstract absurd abuse access accident`

**Output:**

```text
Address:      octH1gDMfecqW4ExycT6Pd99nmF2avrZcLQQrphvqjgFxfZ
Private Key:  KzNHm/LbrzxPiJTpcHJGw8Ozxtvr3LXN3x+oBFO+TtQ=
Public Key:   U0n18IQBPt+j2DJjHaEFzs3IfmAHiUNFKUhf/a3ImPQ=
```

---

## Security & Privacy
This tool was designed with security as the priority.

1. **Client-Side Only:** All cryptographic calculations happen inside your browser or local Node.js process.
2. **Zero Network Calls:** The tool does not send data to any external server. You can verify this by checking the "Network" tab in your browser's developer tools.
3. **Open Source:** The code is transparent. You can inspect `index.html` and `mnemonic-to-wallet.js` to verify exactly what the code is doing.
4. **Derivation Standards:** Uses industry-standard **BIP39** (mnemonic), **PBKDF2** (seed generation), and **Ed25519** (signing keys via TweetNaCl).

### Maximum Security Recommendation
For recovering wallets containing significant funds, we recommend the **Air-Gap Method**:

1. Download the repository zip file or clone it.
2. Transfer the files to a computer **not connected to the internet**.
3. Run the CLI tool or open `index.html` in a browser.
4. Recover your keys and close the tool before reconnecting.

---

## Technical Details
The tool replicates the exact key derivation logic used by the legacy 0xio extension:

1. **Mnemonic to Seed:** 2048 rounds of PBKDF2-SHA512.
2. **Master Key:** HMAC-SHA512 derivation using the "Octra seed" salt.
3. **Keypair:** Ed25519 signing keypair generated from the master key (or derived child key).
4. **Address:** Base58-encoded SHA-256 hash of the public key, prefixed with `oct`.

---
**[Technical Reference](https://github.com/0xio-xyz/Recovery-tools/blob/main/TECHNICAL_DOCS.md)** - Deep dive into the crypto standards used.

---

## Contributing
Contributions are welcome! Please open an issue or submit a pull request if you find bugs or want to add features.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Disclaimer
**Use at your own risk.**
This tool is provided "as is" without warranty of any kind. Always verify the address generated matches your expectations before sending funds. **NEVER share your seed phrase or private key with anyone.**

---

**[View Live Tool](https://0xio-xyz.github.io/Recovery-tools/)**