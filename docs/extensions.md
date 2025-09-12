# Extensions / Plugins (Design Notes)

Goals:
- Allow custom scoring, item types, and export hooks
- Clean API boundaries; minimal coupling to core

Ideas:
- Define extension points in services layer (interfaces)
- Register plugins via build tags or runtime config (unsafe mode)
- Sandbox untrusted extensions (future)

