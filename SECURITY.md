# Security Policy

## Reporting a Vulnerability

Please report security issues privately via email to the maintainer (see README Contact). Do not open public GitHub issues for security reports.

Include:
- Affected component/version
- Steps to reproduce (PoC if possible)
- Impact assessment

We will acknowledge receipt within 3 business days and coordinate a fix and disclosure timeline.

## Supported Versions

The `main` branch and the latest release are actively maintained. Older releases may receive fixes at the maintainers’ discretion.

## Data protection and encryption at rest

- All persistent data written by the application is encrypted at rest using AES‑256‑GCM.
- To enable persistence, you MUST provide an encryption key via `SYNAP_ENC_KEY`. Without it, the server will automatically fall back to in‑memory mode to avoid writing plaintext to disk.
- Environment variables:
  - `SYNAP_DB_PATH`: Path to the JSON snapshot file (application‑level storage). Example: `/data/synap.db`.
  - `SYNAP_ENC_KEY`: 32‑byte key (Base64 or arbitrary string). Recommended: generate with `openssl rand -base64 32`.
- Key management:
  - Treat `SYNAP_ENC_KEY` as highly sensitive secret. Store it securely (e.g., Docker/K8s secret, cloud secret manager).
  - For rotation, provision new key and perform a controlled migration (planned feature). In the meantime, change key only when data can be safely re‑ingested or after an export/import migration.
- Compliance:
  - Combined with existing deletion endpoints and data minimization, the app aligns with GDPR/PDPA best practices. Review your deployment’s logging and backups to ensure secrets and encrypted snapshots are handled appropriately.
