# 0xio Recovery Tool - Technical Documentation

This document provides deep technical details, cryptographic specifications, and advanced usage examples for the 0xio Wallet Recovery Tool.

## File Structure

* `index.html` - The standalone browser-based tool (User Interface).
* `mnemonic-to-wallet.js` - The Node.js CLI script (Logic & Automation).
* `libs/nacl.min.js` - TweetNaCl cryptographic library (Required for browser version).

## Command Line (CLI) Usage

### Installation

```bash
# Install dependencies
npm install tweetnacl

```

### Standard Recovery (Master Key)
Recovers the default wallet address derived at path `m`.

```bash
node mnemonic-to-wallet.js "abandon ability able about above absent absorb abstract absurd abuse access accident"

```

### Advanced: Custom Derivation Path
Recovers a derived address/key using a specific path (e.g., Octra derived path).

```bash
# Syntax: node mnemonic-to-wallet.js "mnemonic" "path"
node mnemonic-to-wallet.js "abandon ability able about above absent absorb abstract absurd abuse access accident" "m/345'/0'/0'/0'/0'/0'/0'/0"

```

> **Note:** Enclose the derivation path in quotes to prevent your shell from interpreting the apostrophes (`'`).

## How It Works (Derivation Logic)
The tool replicates the official 0xio wallet generation process:

1. **Mnemonic to Seed (BIP39):**
* Converts 12 words to a binary seed.
* Algorithm: PBKDF2-SHA512.
* Iterations: 2048.
* Salt: "mnemonic" (plus optional passphrase).


2. **Master Key Derivation:**
* Derives the root key using HMAC-SHA512.
* Key: "Octra seed".
* Data: The BIP39 binary seed.


3. **Hierarchical Derivation (SLIP-0010):**
* If a path is provided (e.g., `m/345'/...`), it derives child keys.
* Standard: **SLIP-0010** (Edwards-curve Digital Signature Algorithm derivation).
* Constraint: Ed25519 only supports **Hardened Derivation** (indexes must use `'` or be >= 2^31).


4. **Address Generation:**
* Generates Ed25519 Public Key.
* SHA-256 hash of the Public Key.
* Base58 encoding of the hash.
* Prefix with `oct`.



## Developer Integration Example
You can use the logic in your own Node.js projects by importing the class:

```javascript
const { WalletRecovery } = require('./mnemonic-to-wallet.js');

async function main() {
    const recovery = new WalletRecovery();
    const mnemonic = "your twelve words here...";
    
    // Option 1: Default Master Key
    const master = await recovery.recoverFromMnemonic(mnemonic);
    console.log('Master Address:', master.address);

    // Option 2: Specific Derivation Path
    const derived = await recovery.recoverFromMnemonic(mnemonic, "m/345'/0'/0'/0'/0'/0'/0'/0");
    console.log('Derived Address:', derived.address);
    console.log('Derived Private Key:', derived.privateKey);
}

main();

```

## Cryptographic Standards| Component | Standard / Library |
| --- | --- |
| **Mnemonic** | BIP39 |
| **KDF** | PBKDF2 (2048 rounds) |
| **Signatures** | Ed25519 (via TweetNaCl) |
| **HD Wallets** | SLIP-0010 (Hardened) |
| **Hashing** | SHA-256, HMAC-SHA512 |
| **Encoding** | Base58 (Bitcoin alphabet), Base64 |

## Troubleshooting
### "Invalid mnemonic: expected 12 words"* Ensure single spaces between words.
* Check for trailing spaces at the end of the string.

### "TweetNaCl not found"* Run `npm install tweetnacl` in the tool directory.

### "Ed25519 only supports hardened derivation"* You tried to use a path like `m/345/0`.
* Ed25519 requires "hardened" indexes. Add an apostrophe: `m/435'/0'`.

---

**Disclaimer:** This documentation is for educational and recovery purposes. Always verify code before using it with high-value wallets.