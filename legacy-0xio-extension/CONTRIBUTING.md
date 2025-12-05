# Contributing to 0xio Wallet (Legacy)

## ⚠️ ARCHIVED PROJECT --- NO LONGER MAINTAINED

This repository has been archived and is read-only.\
It is preserved for historical reference and educational purposes only.

**No pull requests, issues, or security reports will be reviewed or
accepted.**

Thank you for your interest in the 0xio Wallet project history!\
While this repository is no longer active, you are welcome to fork the
code and use it as a foundation for your own independent projects.

------------------------------------------------------------------------

## Usage & Forking

Since this project is archived:

-   **Do not submit Pull Requests** --- they will not be merged.
-   **Do not open Issues** --- they will not be addressed.
-   **Fork freely** --- you are encouraged to fork this repository to
    study, modify, or revive the codebase under your own maintenance.

------------------------------------------------------------------------

## Getting Started with a Fork

If you choose to fork this project for your own development:

### 1. Fork the repository

Use GitHub's "Fork" button.

### 2. Clone your fork

    git clone https://github.com/YourUsername/Legacy.git
    cd Legacy/legacy-0xio-extension

### 3. Load the extension

Use your browser's **Developer Mode** to load the extension as an
unpacked project.

------------------------------------------------------------------------

## Security Warning

This codebase uses **legacy cryptographic libraries** (such as older
TweetNaCl builds) and has **not undergone recent audits**.

-   **Do NOT use this code as-is for handling real funds on mainnet.**
-   **A full audit and dependency update is required** before any
    production usage.

------------------------------------------------------------------------

## Code Overview for Researchers

This repository may be useful if you are studying:

### **Manifest V3 Architecture**

Understanding the migration from MV2 background pages to MV3 service
workers (`service-worker.js`).

### **Vanilla JS Wallet UI**

How to build a lightweight crypto wallet interface without frameworks
like React or Vue.

### **Encrypted Local Storage**

Implementation of encrypted key storage (`js/wallet-storage.js`).

------------------------------------------------------------------------

## License

This project is licensed under the **MIT License**.\
See [`../LICENSE`](../LICENSE) for details.
