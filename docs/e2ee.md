# End-to-End Encryption (E2EE) — v1

This document describes Synap's E2EE design and how to use it today.

## Goals

- Content-level encryption done in the browser; server stores only ciphertext + envelope-wrapped DEKs.
- Multi-recipient envelope (PI/DM/IRB), key rotation via re-wrap without touching plaintext.
- Region-aware defaults and clear UX warnings; platform is technically unable to see plaintext.

## Algorithms

- Preferred: X25519 (ECDH) + HKDF-SHA256 → KEK; content AEAD: XChaCha20-Poly1305
- Fallback (WebCrypto-only env): RSA-OAEP-SHA256 + AES-GCM
- Envelope metadata: `alg=x25519+xchacha20|rsa+aesgcm`, `kdf=hkdf-sha256`

## Data Flow

1) Browser generates a random 32-byte DEK
2) Payload (answers [+ optional email]) encrypted via AEAD with DEK
3) For each project public key PMK_pub: compute encDEK_i
4) Upload `{ciphertext, nonce, encDEK[], aad_hash, pmk_fingerprint}` to `/api/responses/e2ee`
5) Server stores opaque fields only; no plaintext is processed

## Key Management (Client-side)

- Admin → Key Management (`/admin/keys`):
  - Generate X25519 key pair locally (libsodium)
  - Encrypt private key with passphrase (PBKDF2 + AES-GCM) and store locally
  - Show public key (base64 raw 32B) and fingerprint (SHA-256 base64)
  - Register the public key to a project (scale)

Future (planned):
- Passkey-based local encryption (WebAuthn)
- Mnemonic / Shamir (SLIP-39) for private-key recovery
- RSA generation UI for environments without WASM

## Server APIs (MVP)

- GET `/api/projects/{id}/keys` — list registered public keys (public)
- POST `/api/projects/{id}/keys` — add a public key (auth)
  - `{ alg, kdf, public_key, fingerprint }`
- POST `/api/responses/e2ee` — submit encrypted payload
  - `{ scale_id, ciphertext, nonce, enc_dek:[], aad_hash, pmk_fingerprint? }`

### Export & Evidence (MVP)

- POST `/api/exports/e2ee` — create export job (auth + `X-Step-Up: true`)
  - Body: `{ scale_id }`
  - Returns `{ url, expires_at }` — short‑lived link to download
- GET `/api/exports/e2ee?job=...&token=...` — download `{ manifest, signature, responses }`
  - Encrypted bundle (.json) contains:
    - `manifest`: `{ version, type=e2ee-bundle, scale_id, count, created_at }`
    - `signature`: Ed25519 signature over `JSON(manifest)`; seed from `SYNAP_SIGN_SEED` (base64 32B) or ephemeral per boot.
    - `responses`: encrypted payloads (ciphertext, nonce, encDEK[])
  - Audit: `export_e2ee_request` and `export_e2ee_download` recorded with actor and manifest hash.
  - Basic per‑tenant rate limit enforced.
  - Legacy: `GET /api/exports/e2ee?scale_id=...` with `X-Step-Up: true` still works.

### Re-wrap (MVP, pure E2EE offline)

- POST `/api/rewrap/jobs` `{ scale_id, from_fp, to_fp }`
  - Returns job payload of `{ items:[{response_id, enc_dek:[]}] }` for client-side rewrap
- POST `/api/rewrap/submit` `{ scale_id, to_fp, items:[{ response_id, enc_dek_new }] }`
  - Appends the new encDEK to corresponding responses

## Admin UI (Project)

- E2EE toggle (default ON) and Region (auto|gdpr|pipl|pdpa|ccpa)
- Project Keys section: add and list public keys
- Disabling E2EE triggers a red double confirmation and an audit record (`e2ee_disable`).
- Export behavior:
  - When E2EE is ON: server produces only encrypted bundle; plaintext export happens locally in the browser (JSONL). CSV (long/wide/score) must be generated client‑side or in your analysis tools.
  - When E2EE is OFF: server CSV exports are available (`/api/export?format=long|wide|score`).

Planned UX:
- Strong red warning + audit when turning E2EE OFF (especially gdpr/pipl projects)
- Region-linked default hints and export policies

## Export & Evidence (Planned)

- Export encrypted-only bundles: Parquet (default) or JSONL.enc
- Evidence: `manifest.json` + `manifest.sig` (Ed25519 by default)
- Access control: Step-up MFA + one-time short URL + IP/region throttling

## Re-wrap / Rotation (Planned)

- Pure E2EE: Offline rewrap job (download encDEK_old, rewrap client-side with new PMK_pub', upload encDEK_new)
- KMS proxy (feature flag, default OFF): HSM/KMS-based decrypt/rewrap without plaintext leaving KMS (enterprise BYOK)

## Storage & Compliance

- E2EE ciphertext coexists with at-rest encrypted snapshot (AES-256-GCM via `SYNAP_ENC_KEY`).
- Data minimization: no IP in content data; aggregate-only metrics; logs follow region policy.

## Roadmap

- Key UX: WebAuthn passkey crypto, mnemonic/SLIP-39, multi-device sync
- Re-wrap tooling: CLI and UI workflows, KMS connectors (AWS/GCP/Azure/Alibaba)
- Export pipeline: streaming parquet writer, evidence chain (Merkle), public transparency log anchors
- Blind index optional column (deterministic HMAC per project) for limited server-side query
- Step-up MFA integration: WebAuthn/TOTP binding, short-lived JWT for export endpoints
- KMS proxy rewrap: AWS/GCP/Azure/Alibaba KMS providers (feature flag)
