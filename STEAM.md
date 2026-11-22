# Shipping Limb Clash on Steam

Everything in code is done: Steam initializes only in the Electron build when Steam is running
(`electron/steam-core.cjs`), with lobbies (host / invite / join from the overlay), P2P packets
relayed by Steam (`src/net/steam-transport.ts`) and rich presence ("In match: Humanoid vs Crab").
It is tested against a fake Steam layer (`tests/steam.test.ts`). The app ID comes from
`steam.config.json` (placeholder **480**, Valve's "Spacewar" test app) — never hardcoded.

These are the steps only a human with a Steamworks account can do.

## 1. Steamworks account and app
1. Create a Steamworks partner account: https://partner.steamgames.com/ (company or individual; tax and bank info required).
2. Pay the Steam Direct app fee (USD 100 per app, recoupable after USD 1,000 gross revenue).
3. Create the app. Note the **App ID** and the default **Depot IDs** (one per OS you ship: Windows, macOS, Linux).
4. Put the App ID in `steam.config.json` (`"appId": <your id>`). Keep `"enabled": true`.

## 2. Steamworks settings for this game
1. **Community → Rich Presence**: upload a localization file with the token used by the game:
   ```
   "lang" { "Language" "english" "Tokens" { "#Status" "{#status}" } }
   ```
   (The game sets `status` to e.g. "In match: Humanoid vs Crab" and `steam_display` to `#Status`.)
2. **Networking**: nothing to enable — the game uses `ISteamNetworking` P2P (SendP2PPacket), which works for any app.
3. **Matchmaking**: lobbies are friends-only with 2 members; no extra configuration needed.
4. Optionally enable **Steam Input** and **Steam Cloud** later (not used yet; settings live in the user data folder).

## 3. SDK files
The `steamworks.js` npm package already bundles the Steamworks redistributables (`libsteam_api.so`, `steam_api64.dll`, `libsteam_api.dylib`) and is kept outside the asar archive by `electron/builder.config.cjs` (`asarUnpack`). If Valve requires a newer SDK than the package ships, update `steamworks.js` (`npm i steamworks.js@latest`) and re-run `npm run dist`. You do not need to download the SDK separately unless you want the `steamcmd`/ContentBuilder tools (step 5).

## 4. Build per OS
`npm run dist` builds for the OS it runs on (electron-builder cannot reliably cross-build installers):
- Windows: run on Windows → `release/Limb Clash Setup <version>.exe` and `release/win-unpacked/`.
- macOS: run on a Mac → `release/*.dmg` and `release/mac*/Limb Clash.app`. Sign and notarize with your Apple Developer ID (set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` before `npm run dist`).
- Linux: run on Linux → `release/linux-unpacked/` (upload this folder, not the AppImage).

For Steam, upload the **unpacked** folders (`win-unpacked`, `mac/Limb Clash.app`, `linux-unpacked`), not installers.

## 5. Depots and uploading builds
1. Download the Steamworks SDK zip from the partner site and use `tools/ContentBuilder`.
2. Create one depot build script per OS (`depot_build_<depotid>.vdf`) pointing `ContentRoot` at the matching unpacked folder, and an `app_build_<appid>.vdf` listing the depots.
3. Upload: `steamcmd +login <builder account> +run_app_build ../scripts/app_build_<appid>.vdf +quit`.
4. In Steamworks → **SteamPipe → Builds**, set the uploaded build live on a branch (e.g. `beta`, then `default`).
5. **Installation → General**: set launch options per OS:
   - Windows: `Limb Clash.exe`
   - macOS: `Limb Clash.app`
   - Linux: `limb-clash` (also add the launch option `--no-sandbox` if the Steam Linux runtime blocks Chromium's sandbox).

## 6. Store page
Fill in **Store page admin**: description, capsule images (header 920×430, small 462×174, main 1232×706, vertical 748×896), at least 5 screenshots (use `?demo=humanoid,crab` in a dev build for action shots), a trailer, tags (Fighting, Physics, Local Multiplayer, PvP, Online PvP), supported controllers (Xbox / PlayStation), and the content survey. Submit the store page and the build for Valve review (allow a few business days each).

## 7. Testing with two accounts
1. You need two Steam accounts on two machines (or one machine + Steam Deck); both must own the app — add the second account as a tester or generate keys (**Request Steam product keys**).
2. Install the build from the Steam client on both (branch with the build live).
3. Account A: Play → Online → **Steam: host lobby**, then **Steam: invite friend** → pick account B in the overlay.
4. Account B: accept the invite in the Steam overlay/chat → the game joins the lobby automatically and both reach fighter select.
5. Verify: both pick, the match starts, the HUD net status shows ping/rollbacks, rich presence shows "In match: …" in the friends list, leaving shows "Opponent left".
6. Desync reports (if any) are written to the user data folder: Windows `%APPDATA%/limb-clash/desync-reports`, macOS `~/Library/Application Support/limb-clash/desync-reports`, Linux `~/.config/limb-clash/desync-reports`.

## 8. Before release
- Replace the default Electron icon: add `electron/build/icon.png` (1024×1024), `icon.icns` (macOS) and `icon.ico` (Windows).
- Set `appId`/`productName` in `electron/builder.config.cjs` if you want a different bundle identifier.
- Consider `restartAppIfNecessary(appId)` in `electron/steam-core.cjs` once the real App ID is set, so launching outside Steam relaunches through Steam.
