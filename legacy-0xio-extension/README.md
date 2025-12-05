# 0XIO WALLET (LEGACY)

**License:** MIT\
**Status:** Archived (No longer maintained)\
**Platform:** Chromium

------------------------------------------------------------------------

## ⚠️ ARCHIVED PROJECT --- FOR EDUCATIONAL PURPOSES ONLY

This repository contains the source code for the legacy 0xio Wallet
extension. It is no longer actively maintained.

This codebase is open‑sourced to serve as a reference implementation for
developers building non‑custodial browser extensions, studying Manifest
V3 architecture, or researching the Octra Network's history.

> **Do not use this wallet to store significant value without updating
> dependencies and performing your own security audit.**

------------------------------------------------------------------------

## Overview

0xio Wallet was a non‑custodial cryptocurrency wallet designed for the
Octra blockchain network. Built entirely with Vanilla JavaScript, it
demonstrates how to build a fully functional crypto wallet without heavy
frontend frameworks, optimized for performance and low resource usage
within the Chrome Extension Manifest V3 environment.

------------------------------------------------------------------------

## Key Features

-   **Cryptography:** Ed25519 signing and BIP39 mnemonic generation
    using TweetNaCl.
-   **Privacy:** Client-side balance encryption and private transfers
    using ephemeral keys.
-   **Architecture:** Service Worker background system, Content Script
    injection, and Popups communicating via Chrome messaging.
-   **DApp Bridge:** Custom provider injected into webpages to allow
    DApps to communicate with the wallet.
-   **State Management:** Secure encrypted key‑vault stored locally.

------------------------------------------------------------------------

## Tech Stack

-   **Core:** Vanilla JavaScript (ES6+)
-   **Manifest:** Version 3
-   **Crypto:** nacl.min.js (TweetNaCl), Web Crypto API
-   **Styling:** CSS3 Variables (Dark/Light mode)
-   **Build System:** None (runs natively in browser)

------------------------------------------------------------------------

## Project Structure

    my-legacy-wallet/
    ├── manifest.json           # Extension configuration (permissions, V3 definitions)
    ├── service-worker.js       # Background tasks (transactions, RPC)
    ├── popup.html              # Main wallet UI
    ├── popup.js                # UI logic
    ├── content.js              # Injected script for DApps
    ├── injected.js             # Provider injected as window.wallet0xio
    ├── bridge.js               # Communication bridge
    ├── js/
    │   ├── wallet.js           # Core wallet logic
    │   ├── crypto.js           # Crypto functions
    │   ├── network.js          # RPC calls
    │   └── modules/            # UI components
    ├── css/                    # Styling
    └── icons/                  # Icons

------------------------------------------------------------------------

## 🚀 Installation (Developer Mode)

Since this project is archived, it is not on the Chrome Web Store. You
can still run it locally:

### 1. Clone the repository

    git clone https://github.com/0xio-xyz/Legacy.git
    cd Legacy/legacy-0xio-extension

### 2. Open Chrome Extensions

Visit: `chrome://extensions/`

### 3. Enable Developer Mode

Toggle the switch in the top‑right.

### 4. Load Unpacked

Select the cloned repository folder.

### 5. Pin

Pin the extension to your toolbar.

------------------------------------------------------------------------

## Educational Value

This codebase is great for learning:

-   **Manifest V3 migration:** Handling asynchronous service workers.
-   **CORS bypassing:** Using background scripts as RPC proxies.
-   **Security patterns:** Auto‑lock timer, password hashing in pure
    JS.
-   **Provider injection:** Exposing APIs like `window.octraWallet` for
    DApps.

------------------------------------------------------------------------

## Security & Disclaimer

-   This software is provided **"as is"**, without warranty.
-   Dependencies may be outdated.
-   No recent security audit.
-   Recommended only for testnet or research usage.

------------------------------------------------------------------------

## Contributing

This is a legacy archive --- no new features will be accepted.\
Forks are welcome.

To revive or reuse the project:

1.  Fork the repository.
2.  Update **manifest.json** name & description.
3.  Replace RPC endpoints in `js/config.js`.
4.  Perform a security audit on `js/crypto.js` and
    `js/password-manager.js`.

------------------------------------------------------------------------

## License

Distributed under the **MIT License**.\
See [`../LICENSE`](../LICENSE) for details.
