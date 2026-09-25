# Stockpile Mobile

Expo (SDK 56) app for discovering source-backed baskets of tokenized stocks, saving them, viewing on-chain
holdings, and buying a basket through user-approved Jupiter swaps signed by a Privy embedded Solana wallet.

## Setup

```bash
bun install                      # from repo root
cp apps/mobile/.env.example apps/mobile/.env   # then fill in values
```

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Stockpile API base URL. Simulator: `http://localhost:4040`; device: `http://<LAN-IP>:4040`. |
| `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID` | Privy app + mobile client IDs. Leave empty for browse-only mode. |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | RPC used to submit user-signed swaps, read mint decimals and poll confirmations. Defaults to public mainnet RPC (rate limited; use a dedicated RPC in practice). |

`EXPO_PUBLIC_*` values are inlined at bundle time; restart the bundler after changing `.env`. The app no
longer depends on SST. The Privy client ID's allowed app identifiers must include the bundle ID
(`sh.nitish.stockpile.app[.<env>]`) and URL scheme from `app.config.ts`.

**Native modules changed** (`@privy-io/expo`, `@privy-io/expo-native-extensions`, `expo-application`,
`@solana/web3.js` runtime). Rebuild the dev client (`bunx expo run:ios` / `run:android` or an EAS dev
build) before running.

## Behaviour

- **Browse-only (no Privy IDs):** Discover, basket detail (thesis, weights, per-asset source links,
  evidence, disclosure and risks) work against the public API. Saves, portfolio and trading show why they
  are unavailable. The Privy SDK is never evaluated.
- **Signed in:** email OTP via Privy creates an embedded Solana wallet. API calls send the Privy
  **identity token** in the `privy-id-token` header (`src/services/api/client.ts`).
- **Saves:** server-side (`/saved-baskets`), optimistic toggle.
- **Portfolio:** `/portfolio` raw on-chain balances only. If the backend reports `unavailable`, nothing is
  estimated or invented. No USD values are shown (the API doesn't provide prices).
- **Trade:** USDC amount + slippage → `/trade/quote` (indicative) → `/trade/prepare` (unsigned base64
  Jupiter transactions). Each transaction is decoded and checked on-device (fee payer and sole signer must be
  your wallet, size limit, supported version, program list) and signed individually after an explicit
  confirmation. The wallet signs and submits; the backend never submits. Confirmation is polled from RPC and
  linked to Solscan. Prepared transactions expire after roughly a minute and can be rebuilt.
  Baskets with any asset lacking a verified mint (`mint: null`) cannot be traded.

## Layout

```
app/(tabs)/            Expo Router native tabs: Feed (index, story reels), Piles, Saved, Portfolio, Account
app/basket/[id].tsx    Pile detail: holdings/allocation, related stories, thesis, evidence, risks (collapsible)
app/trade/[id].tsx     Quote → build → inspect → sign each swap
app/login.tsx          Privy email OTP (modal)
src/config/env.ts      Public runtime config + PRIVY_CONFIGURED
src/providers/auth-*   Auth context; Privy mounted only when configured
src/lib/privy/         All @privy-io/expo usage (provider bridge, login form)
src/lib/solana/        Transaction inspection, RPC helpers
src/services/api/      Generated SDK client config, typed wrappers (contract types in types.ts)
src/hooks/             TanStack Query hooks (baskets, account, trade, mint decimals)
src/components/stockpile/  Design system: type scale (T), Screen/Card/Section/states, buttons, fields, tab bar, basket cards
src/config/theme.ts    Tokens: `theme.ds` (paper/ink/green palette), `theme.chart`, `theme.fonts`
```

Design system: bright, light-only UI with system fonts (SF Pro / Roboto), cool white canvas and blue/coral/mint (cyan tertiary)
accents (`theme.ds`, `theme.gradients`, `theme.chart` in `src/config/theme.ts`). Piles render as gradient artwork with
oversized real token logos (`basket-art.tsx`). Stories render as full-screen vertical reels (`story-reel.tsx`) from
`GET /stories` via the generated SDK (`src/services/api/feed.ts`); missing story images use designed fallback artwork,
never stock photos. Tapping a reel's pile opens `PileSheetProvider`'s bottom sheet. Tabs use
`expo-router/unstable-native-tabs` (Liquid Glass on iOS 26+, Material bottom navigation on Android).

Token logos: `TokenAvatar` (`src/components/stockpile/token-avatar.tsx`) renders the API's `asset.iconUrl` with `expo-image`
(`cachePolicy="memory-disk"`), accepting HTTPS URLs only. It falls back to a ticker monogram when the URL is missing or fails
to load. Logos are branding only: tradability still depends solely on `asset.mint` (see `basketTradable`). The app
never calls Jupiter directly; icon URLs are resolved and cached server-side.

API contract: `docs/api-contract.md`. After backend changes run `bun run generate:sdk` at the root;
`src/services/api/stockpile.ts` assigns SDK responses to the contract types so drift fails typecheck.

## Checks

```bash
cd apps/mobile
bunx tsc --noEmit
bun test src
bunx eslint app src/components/stockpile src/lib src/hooks src/services src/config
```

Unit coverage (`bun test src`):

- `src/config/env.test.ts`: Privy gating needs both IDs (whitespace ignored), API URL defaults and normalisation.
- `src/providers/auth-provider.test.tsx`: without IDs the provider is browse-only, cannot sign, and never loads `@privy-io`.
- `src/services/api/stockpile.test.ts`: the real generated SDK client against a mocked `fetch`. Covers public calls without a token, the `privy-id-token` header when signed in, a failing token getter, server error messages, 401/404/503 mapping, network failure, and unavailable prepare as data.
- `src/lib/solana/transaction.test.ts`: on-device transaction inspection (fee payer / sole signer / no wallet / bad base64).
- `src/lib/trade/signing.test.ts`: the approval and signing state machine. Unsafe or undecodable transactions never reach the wallet; a user rejection is retryable; anything broadcast is never re-sent; partial completion is tracked without claiming success; prepared transactions expire.
- `src/utils/amounts.test.ts`: exact decimal/base-unit conversion.

## Wallet funding

"Add funds" opens a sheet from three places: the Portfolio wallet card, the Account wallet row, and the buy sheet's "Add USDC" button. The sheet (`src/components/stockpile/fund-sheet.tsx`) shows:

- A QR code of the embedded Solana wallet address, drawn with `react-native-qrcode-styled`. It's pure JS on `react-native-svg` and is a required peer of `@privy-io/expo/ui`, so no dev-client rebuild is needed.
- The address, with Copy and Share buttons.
- A "Solana" network chip.
- A low-SOL fee note when the known SOL balance is under 0.005 SOL.

**Buy with card (Privy onramp).** `@privy-io/expo@0.63` exports `useFundSolanaWallet` from `@privy-io/expo/ui`. Its flow is rendered by `<PrivyElements />`, which is mounted in `src/lib/privy/privy-auth-provider.tsx`. The "Buy USDC with card" button only appears when the app's Privy config (`client.app.getConfig().funding_config`) lists a card provider (`moonpay` or `coinbase-onramp`). Otherwise it stays hidden.

As of Sep 25 2026, this app's `funding_config` is `null`: no funding methods are enabled, so the button is hidden. To turn it on:

1. In the Privy Dashboard → your app → Wallets → **Funding**, enable **Pay with card** (MoonPay and/or Coinbase Onramp) for **Solana**.
2. Set the default asset to **USDC** and a default amount.
3. Complete any provider onboarding the dashboard asks for.

Nothing in code needs to change. The button appears after the app next loads its Privy config.

**Transfer from another wallet (Android MWA)** is not implemented, because `@solana-mobile/mobile-wallet-adapter-protocol-web3js` is not installed. Adding it is a native change that needs a dev-client rebuild.

## Troubleshooting

### `POST /v1/quarantine/intents 404` in the local API log

These requests don't come from the app. They come from a host daemon.

- Neither the app bundle nor the mobile SDKs (`@privy-io/*`, `@solana/*`, `expo-*`) contain the string `quarantine`. The only match in `node_modules` is an unrelated Cloudflare Queues comment in `wrangler`.
- `lsof -nP -iTCP:4040` shows the peer is `~/.local/bin/cred daemon --foreground`. That is the opencred daemon, started by `~/Library/LaunchAgents/xyz.opencred.daemon.plist`. The binary polls `/v1/quarantine/intents`.
- `~/.config/opencred/config.json` sets `cloud.url` to `http://localhost:4040`. That is the same port as the Stockpile API, so the daemon polls our API and gets 404s.

The app needs no changes. To stop the noise, point opencred's `cloud.url` at its own server, or run the API on a different port and update `EXPO_PUBLIC_API_URL`.

## Android release build (no Metro)

Verified on macOS with JDK 17, Android SDK platforms 34–36, NDK 27.1 and build-tools 36. The build embeds the JS bundle,
so it runs without a dev server. `android/` is generated and gitignored.

```bash
cd apps/mobile
CI=1 bunx expo prebuild --platform android --no-install   # note: prebuild rewrites the android/ios scripts in package.json; revert them
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb reverse tcp:4040 tcp:4040        # emulator reaches the host API at localhost:4040
adb install -r app/build/outputs/apk/release/app-release.apk
```

- `EXPO_PUBLIC_*` values are baked in at bundle time. Gradle does not track them as inputs, so after changing
  `.env` delete `android/app/build/generated/assets/react/release` before rebuilding.
- The release APK is signed with the template debug keystore. Use EAS or your own keystore for distribution.
- Cleartext HTTP is enabled only when `EXPO_PUBLIC_API_URL` starts with `http://` (local testing).
- The API must be the Stockpile API. If another process already holds port 4040, run the API on a free port and point the
  emulator at it with `adb reverse tcp:4040 tcp:<port>`.
- Buying needs the backend's `JUPITER_API_KEY` (mints are resolved live from the issuers and verified on Jupiter): baskets whose assets have `mint: null` are research only.

## iOS simulator release build (no Metro)

Verified with Xcode 26.4 and CocoaPods 1.16 on the iPhone 17 Pro (iOS 26.4) simulator. The build embeds the JS bundle.

```bash
cd apps/mobile
CI=1 bunx expo prebuild --platform ios --no-install   # revert the android/ios scripts prebuild writes to package.json
cd ios && LANG=en_US.UTF-8 pod install
xcodebuild -workspace Stockpile.xcworkspace -scheme Stockpile -configuration Release \
  -destination 'id=<simulator-udid>' -derivedDataPath build/dd CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
xcrun simctl install <simulator-udid> build/dd/Build/Products/Release-iphonesimulator/Stockpile.app
xcrun simctl launch <simulator-udid> sh.nitish.stockpile.app
```

- Keep ad-hoc signing (`CODE_SIGN_IDENTITY=-`). Building with `CODE_SIGNING_ALLOWED=NO` removes the keychain
  entitlement, so SecureStore and Privy session storage fail on the simulator.
- The simulator can reach the host API at `http://localhost:4040` directly (ATS allows local networking).
