# Architecture

One self-hosted Supabase (Postgres, RLS, auth, storage), a small Hono API for everything that needs
secrets, a spaCy service for deterministic annotation, and an offline SPA packaged with Capacitor.

```mermaid
flowchart LR
  subgraph Device
    C[Client: Vite + React + Capacitor]
    D[(Dexie: words, lists, review events)]
    P[(SQLite dictionary pack)]
    C --- D
    C --- P
  end
  subgraph Server
    S[(Supabase: Postgres + RLS + GoTrue + Storage)]
    A[Hono API]
    N[spaCy FastAPI]
    T[Piper TTS]
    L[LLM provider]
    M[Listmonk]
  end
  AD[Admin console]
  W[Marketing site + docs]
  C -- "sync push/pull (event log)" --> S
  C -- "story requests" --> A
  A --> S
  A --> N
  A --> L
  A -. "pack builds, audio" .-> T
  AD --> S
  AD --> A
  ST[Stripe] -- webhooks --> A
  RC[RevenueCat] -- webhooks --> A
  A -. "newsletter sync" .-> M
```

Everything runs behind Traefik on one Hetzner box; the web app, admin and site are static files.
