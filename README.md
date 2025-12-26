# 0xio Legacy Projects

**Repository:** Archive of deprecated 0xio projects\
**Status:** Archived (No longer maintained)\
**License:** MIT

---

## ⚠️ ARCHIVED PROJECTS --- FOR EDUCATIONAL PURPOSES ONLY

This repository contains source code for legacy 0xio projects that are no longer actively maintained or officially supported.

These codebases are open-sourced to serve as reference implementations for developers studying blockchain wallet architecture, browser extension development, and the Octra Network's history.

> **⚠️ Do not use these projects in production without updating dependencies and performing your own security audit.**

---

## Projects in this Repository

### [legacy-0xio-extension](./legacy-0xio-extension/)
**Browser Extension Wallet** • Chromium-based (Manifest V3)

A non-custodial cryptocurrency wallet browser extension for the Octra blockchain network. Built with vanilla JavaScript demonstrating:
- Ed25519 signing and BIP39 mnemonic generation
- Client-side balance encryption and private transfers
- Service Worker architecture with DApp bridge
- Secure encrypted key-vault storage

**Status:** Archived\
**Last Version:** 1.2.2\
**Platform:** Chrome, Edge, Brave (Chromium-based browsers)

[View Documentation →](./legacy-0xio-extension/README.md)

---

### [Recovery-Tools](./Recovery-Tools/)
**Wallet Recovery Tool** • Web & CLI

A secure wallet recovery tool to restore 0xio wallet credentials from a 12-word BIP39 seed phrase. Features:
- 100% client-side cryptographic operations
- Web interface (mobile-friendly) and Node.js CLI
- Ed25519 keypair recovery using Octra derivation standards
- Custom derivation path support

**Status:** Archived\
**Platform:** Browser, Node.js

[View Documentation →](./Recovery-Tools/README.md)

---

## Usage & Forking

Since these projects are archived:

- **No Pull Requests** - Will not be merged
- **No Issues** - Will not be addressed
- **No Security Patches** - No official maintenance
- **Fork Freely** - Use as foundation for your own projects

If you choose to fork any project:
1. Update all dependencies to latest secure versions
2. Perform your own security audit
3. Test thoroughly before any production use
4. Take full responsibility for maintenance

---

## License

All projects in this repository are licensed under the MIT License.

See [`LICENSE`](./LICENSE) for details.

---

## Related

- **Website:** [0xio.xyz](https://0xio.xyz)
- **Octra Network:** Research and educational blockchain implementation
- **Community:** Historical reference for crypto wallet developers

---

**Note:** This is an archived repository. The 0xio team does not provide support, updates, or maintenance for these legacy projects.
