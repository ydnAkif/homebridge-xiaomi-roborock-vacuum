# 2026-10-01 stability fixes

The TypeScript source prevents concurrent discovery, backs off failed handshakes, starts the 30-second keepalive subscription and disposes sockets and timers on Homebridge shutdown. Offline HomeKit reads return SERVICE_COMMUNICATION_FAILURE without repeated error logs.

Run `npm ci`, `npm run build`, `npm test -- --runInBand` and `node --test stability-tests/vacuum.test.cjs`.

`stability-runtime/v0.34.0/` contains the exact runtime overrides tested on the Pi running 0.34.0. The source tree remains at its existing 0.35.0 version. The private homebridge-recovery repository pins these overrides by commit and SHA-256; use its installer to reproduce the deployed version. No device credentials are stored here.

## 2026-11-04 update

Merged official v0.36.0, retaining shared discovery, reconnect backoff, shutdown cleanup, Homebridge 2 storage compatibility, and charging log deduplication. Version 0.36.1-ydnakif.1 is based on official 0.36.0. Polling begins after 30 seconds to avoid extra work during startup.

## 2026-11-07 audit fixes

Duplicate room names/subtypes are rejected before HAP registration; serviceId is declared in the UI schema. Failed room starts clear the selection. A command that never reaches a cleaning state expires after five minutes. Returning/docking/temporary unknown states preserve active room sessions until a terminal idle/charging state. Concurrent starts coalesce, cancel the selection timer, and honor deselection during reconnect without falling back to whole-house cleaning. Shutdown clears room timers. Map IDs and stable serviceIds are unchanged. Source installs build through prepare.

## 2026-11-08 routine read logging

Repeated HomeKit getter diagnostics for maintenance, speed, dock/cleaning state, firmware/serial, water speed, pause/go-to state and dust collection now use debug instead of info (15 statements). Actual command, state-change, startup, warning and error logs retain their existing levels. Global silent mode is not enabled; device reads, returned values, polling cadence, commands, configuration and HomeKit service identities are unchanged.
