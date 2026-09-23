# AI Interview Prep Kit — Backend

Node.js + Express + MongoDB + TypeScript backend starter based on the supplied assessment.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

MongoDB must be reachable using `MONGO_URI`.

For deterministic local development, keep `LLM_PROVIDER=mock`. To connect Gemini, set:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
```

## Batch command

The required entry point is:

```bash
npm run evaluate -- --input cases.json --output kits.json
```

The command uses the same pipeline as the HTTP API and continues after individual case failures.

## Architecture

- `retrieval/` — robots-aware fetching, link ranking and discussion discovery
- `generation/` — LLM abstraction and structured generation
- `pipeline/` — deliberate research → extraction → generation → coverage loop → deterministic schedule
- `models/` — MongoDB persistence
- `routes/` — authentication and kit APIs
- `validation/` — runtime structure validation
- `cli/` — mandatory batch entry point

The mock provider makes the project runnable without paid credentials. Replace it with a real provider before deployment.

## State model

Each editable item carries `sourceState` (`generated`, `edited`, or `pinned`) where useful. Regeneration replaces only generated items in the selected section; edited/pinned items are retained.

## Important security notes

External pages are treated as untrusted content. The fetcher rejects loopback/private IPv4 targets, restricts content type/size, obeys robots.txt, rate-limits requests and never places retrieved page text in a privileged instruction position.
