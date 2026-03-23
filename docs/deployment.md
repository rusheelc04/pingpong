# Render Deployment Guide

Ping Pong Arena ships as a single Render web service backed by Mongo Atlas.

## Production Shape

- Run one Render web service only.
- Do not increase `numInstances` above `1` in v1.
- Use Mongo Atlas for production persistence and transaction support.
- Serve the React app, API, and Socket.IO traffic from the same HTTPS origin.

## Required Render Environment Variables

- `NODE_ENV=production`
- `PORT=10000`
- `CLIENT_URL=https://<your-render-domain-or-custom-domain>`
- `MONGO_URI=<your-mongo-atlas-connection-string>`
- `SESSION_SECRET=<long-random-secret>`

## Deployment Rules

- Deploy during a quiet window.
- Treat any in-progress live match as interruptible during a restart.
- Do not enable horizontal scaling until live queueing and match ownership move out of process memory.

## Release Checklist

1. Run `npm run check`.
2. Run `npm run smoke:prod`.
3. Push the exact tested branch that Render will build.
4. Confirm Render environment variables are set.
5. Deploy on Render.
6. Run `npm run smoke:deploy` with `APP_ORIGIN` set to the deployed HTTPS origin.
7. Run `npm run smoke:cleanup` with `MONGO_URI` set to production so smoke users and their related records do not linger in the ladder.

## Post-Deploy Manual Verification

1. Guest login over HTTPS.
2. Practice match against the Arcade Bot.
3. Ranked pairing across two browser sessions.
4. Private room create and join flow.
5. Disconnect and reconnect within 20 seconds.
6. Disconnect beyond the grace window and confirm a forfeit result.
7. Replay load, profile history, and leaderboard refresh.
8. Mobile landing-page pass.
9. Confirm the leaderboard is clean after smoke cleanup.

## Bounded Load Rehearsal

Run a staged rehearsal against the deployed single instance and watch CPU, memory, event loop lag, Mongo latency, and socket disconnect rate.

1. 10 concurrent live matches
2. 25 concurrent live matches
3. 50 concurrent live matches

Stop the rehearsal if socket disconnects spike or the service becomes unstable.
