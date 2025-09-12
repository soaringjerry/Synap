# Performance & Benchmark (Notes)

- Go net/http baseline with minimal allocations in hot paths
- CSV exports are streaming‑friendly (in memory for MVP)
- Considerations:
  - Enable HTTP/2 with reverse proxy (Caddy/Nginx)
  - Use SQLite WAL for write concurrency; VACUUM INTO for backups
  - Add metrics (p50/p95 latency) once persistence is in place

(Contributions with benchmarks are welcome.)

