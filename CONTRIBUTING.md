# Contributing

Thanks for taking the time to work on Ping Pong Arena.

This repo is organized as a TypeScript monorepo:

- `apps/web` contains the React frontend.
- `apps/server` contains the Express API, Socket.IO handlers, and live match engine.
- `packages/shared` contains shared types, schemas, physics helpers, and rating logic.
- `docs/` contains diagrams, screenshots, and supporting documentation.

## Local Setup

### Recommended path

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:5173`.

`npm run dev` starts Docker Mongo first, then runs the shared watcher, backend, and frontend together.

### Fallback path

If Docker is unavailable, remove `MONGO_URI` from `.env`. The server will use an in-memory MongoDB instance for local work. That mode is convenient for quick edits, but sessions and history are temporary.

## Development Workflow

1. Make the change in the smallest workspace that owns it.
2. If a payload shape or match rule changes, update `packages/shared` first.
3. Run the focused check for the area you changed.
4. Run the full repo checks before shipping the work.

## Quality Checks

Use these commands from the repo root:

- `npm run lint` for type checks, ESLint, and Prettier validation
- `npm test` for unit and integration tests
- `npm run e2e` for browser flows
- `npm run build` for a production build
- `npm run audit` for dependency audit results
- `npm run clean` to remove generated artifacts
- `npm run check` to run the full local gate

## Project Scripts

| Command               | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `npm run dev`         | Start Docker Mongo, the shared watcher, the server, and the web app |
| `npm run mongo:up`    | Start the local Mongo container                                     |
| `npm run mongo:down`  | Stop the local Mongo container                                      |
| `npm run mongo:logs`  | Tail Mongo container logs                                           |
| `npm run mongo:reset` | Recreate the local Mongo volume                                     |
| `npm run build`       | Build all workspaces                                                |
| `npm start`           | Run the built server                                                |

## Testing Notes

- Server tests live in `apps/server/test`.
- Web component tests live beside the page code in `apps/web/src/pages`.
- End-to-end flows live in `apps/web/src/landing.e2e.ts`.
- Shared math tests live in `packages/shared/src`.

If you change real-time behavior, verify at least one manual local match in addition to the automated suites.

## Diagram And Asset Workflow

- Mermaid sources live in `docs/diagrams`.
- Static diagram exports live in `docs/assets/diagrams`.
- README screenshots live in `docs/assets/screenshots`.

When a flow changes, update the Mermaid source and the matching README section together so the top-level documentation stays honest.

## Troubleshooting

### Port 3001 is already in use

Another backend process is already running. Stop it or change `PORT`.

### Port 5173 is already in use

Another Vite server is already running. Stop it or change the web port.

### Docker Mongo is unavailable

Use the in-memory fallback by removing `MONGO_URI` from `.env`.

### The first in-memory Mongo startup is slow

`mongodb-memory-server` may need to download a MongoDB binary the first time it runs.
