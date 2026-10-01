# 2026-10-01 stability fixes

The TypeScript source prevents concurrent discovery, backs off failed handshakes, starts the 30-second keepalive subscription and disposes sockets and timers on Homebridge shutdown. Offline HomeKit reads return SERVICE_COMMUNICATION_FAILURE without repeated error logs.

Run `npm ci`, `npm run build`, `npm test -- --runInBand` and `node --test stability-tests/vacuum.test.cjs`.

`stability-runtime/v0.34.0/` contains the exact runtime overrides tested on the Pi running 0.34.0. The source tree remains at its existing 0.35.0 version. The private homebridge-recovery repository pins these overrides by commit and SHA-256; use its installer to reproduce the deployed version. No device credentials are stored here.
