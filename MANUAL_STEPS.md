# Manual steps

What a human must still do (everything else is built and tested). See STEAM.md for the full Steam checklist.

## Steam (details in STEAM.md)
1. Create a Steamworks partner account and pay the Steam Direct app fee.
2. Create the app; put its App ID in `steam.config.json` (currently the test app 480).
3. Upload the rich presence localization token `#Status`.
4. Build on each OS (`npm run dist` on Windows, macOS, Linux); sign/notarize the macOS build.
5. Set up depots and upload the unpacked builds with SteamPipe / steamcmd; set launch options.
6. Create the store page (art, screenshots, trailer, description) and pass Valve review.
7. Test online play with two Steam accounts on two machines.

## Online (browser)
8. Host the signaling server somewhere public (`npm run server`, any Node 20+ host; put it behind TLS so browsers can use `wss://`). Point clients at it with the `signalingUrl` setting or `?signal=wss://your.host`.
9. Optional but recommended for players behind strict NATs: run a TURN server (e.g. coturn) and add it to `iceServers` in `src/net/config.ts`. Only Google's public STUN server is configured today.
10. Host the built game (`npm run build` → `dist/`) on any static web host (HTTPS).

## Verification that needs real hardware
11. Play-test with physical gamepads (Xbox / PlayStation / generic) — gamepad support was verified with a mocked standard-mapping gamepad only.
12. Check frame rate on a real mid-range laptop GPU (headless tests here use software rendering; see the final report for measured CPU cost per frame).
13. Listen to the synthesized placeholder sounds and replace or tune them (`src/audio/`).
14. Test online play across two different networks (only same-machine WebRTC was tested here).

## Art / release polish
15. App icons (`electron/build/icon.png`, `.icns`, `.ico`) — the default Electron icon is used now.
16. Game balancing (see the `balance-tuning` skill and the table in DECISIONS.md).
