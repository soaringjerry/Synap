# Persistence & Encryption (At Rest)

This document explains how to enable encrypted persistence for Synap and avoid data loss after restarts or upgrades while meeting privacy/compliance requirements (e.g., GDPR/PDPA).

## Summary

- Synap persists application data as an encrypted JSON snapshot on disk.
- Encryption is mandatory for persistence. If an encryption key is not provided, Synap intentionally runs in memory‑only mode (no plaintext writes) to protect data.
- If a legacy plaintext snapshot is detected and an encryption key is provided, Synap will transparently re‑save it in encrypted form on the next write.

## Environment Variables

- `SYNAP_DB_PATH` (required for persistence)
  - Path to the on‑disk snapshot file, e.g. `/data/synap.db`.
- `SYNAP_ENC_KEY` (required for persistence)
  - 32‑byte key (Base64 recommended), or any string (SHA‑256 derived). Example key generation:
    - `openssl rand -base64 32`
- `SYNAP_ADDR` (optional)
  - Server listen address (default `:8080`).

If `SYNAP_DB_PATH` or `SYNAP_ENC_KEY` is missing, Synap prints a warning and falls back to in‑memory storage:

```
persistence disabled: set SYNAP_DB_PATH and SYNAP_ENC_KEY to enable encrypted storage
```

## Docker Compose Example

```yaml
services:
  synap:
    image: ghcr.io/soaringjerry/synap:latest
    environment:
      - SYNAP_ADDR=:8080
      - SYNAP_DB_PATH=/data/synap.db
      - SYNAP_ENC_KEY=${SYNAP_ENC_KEY}
      - SYNAP_STATIC_DIR=/public
    volumes:
      - synap-data:/data
    restart: unless-stopped

volumes:
  synap-data:
```

`.env` (example):

```
SYNAP_ENC_KEY=$(openssl rand -base64 32)
```

## Kubernetes (Sketch)

- Store `SYNAP_ENC_KEY` in a Secret.
- Mount a Persistent Volume at `/data`.
- Inject `SYNAP_DB_PATH=/data/synap.db` and `SYNAP_ENC_KEY` from Secret into the Deployment.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: synap }
spec:
  template:
    spec:
      containers:
      - name: synap
        image: ghcr.io/soaringjerry/synap:latest
        env:
        - name: SYNAP_DB_PATH
          value: /data/synap.db
        - name: SYNAP_ENC_KEY
          valueFrom:
            secretKeyRef: { name: synap-secrets, key: enc_key }
        volumeMounts:
        - { name: data, mountPath: /data }
      volumes:
      - name: data
        persistentVolumeClaim: { claimName: synap-pvc }
```

## Verification

- On first run with both env vars set, Synap writes an encrypted file to `SYNAP_DB_PATH`.
- The file begins with the magic header `SYNAPENC`, followed by a random nonce and ciphertext (AES‑256‑GCM).
- To confirm encryption:
  - `hexdump -C /data/synap.db | head` (you should not see readable JSON).

## Migration from Plaintext

- If an existing plaintext snapshot is detected during load and `SYNAP_ENC_KEY` is provided, Synap will re‑save the snapshot in encrypted form on the next write operation.
- Back up before changing keys or performing migrations.

## Backups

- Back up the encrypted file at `SYNAP_DB_PATH` and manage `SYNAP_ENC_KEY` in a secure secret manager (K8s Secret, cloud KMS/Secrets Manager, etc.).
- To restore, place the encrypted file back at the path and provide the same `SYNAP_ENC_KEY`.

## Quick Deploy Script

The repository includes `scripts/quick-deploy.sh` which generates a random encryption key (`SYNAP_ENC_KEY`) when available via `openssl` and writes it to `.env`.

## Notes & Roadmap

- The current persistence uses an application‑level encrypted snapshot for simplicity and portability.
- A relational database backend (SQLite/Postgres) with transparent encryption/migrations is planned.
- When rotating keys or switching backends, schedule a maintenance window and ensure you have verified backups.

