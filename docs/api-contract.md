# Stockpile API contract (mobile integration)

Product term is **bag** everywhere (formerly basket/pile). Base URL `EXPO_PUBLIC_API_URL` (local: `http://localhost:4040`; device: use LAN IP). JSON. Public routes require no auth. Protected routes require `privy-id-token: <Privy identity token>` (not access token). Backend verifies it with Privy, never accepts client-supplied user IDs or wallet ownership claims. Unconfigured Privy returns 503; missing/invalid token returns 401. Non-2xx JSON errors: `{ "error": "message" }`. Zod-rejected bodies return 400.

## Routes

| Method | Path | SDK function | Auth | Response |
| --- | --- | --- | --- | --- |
| GET | `/health` | `getHealth` | no | `{status:"ok"}` |
| GET | `/bags` | `listBags` | no | `{bags: Bag[]}` |
| GET | `/bags/{id}` | `getBag` | no | `{bag: Bag}`; unknown => 404 |
| GET | `/bags/{id}/chart?range=1D` | `getBagChart` | no | `BagChartResponse` (tokens.xyz bag index); `range` = `1D`\|`1W`\|`1M`\|`1Y`\|`ALL` (default `1D`, other values => 400); unknown bag => 404; never 500 for provider problems (200 + `reason`) |
| GET | `/assets/{mint}/chart?range=1D` | `getAssetChart` | no | `AssetChartResponse` for one allowlisted bag-asset mint; same ranges; non-allowlisted mint => 404, malformed mint => 400 |
| GET | `/bags/sparklines?range=1D` | `getBagSparklines` | no | `BagSparklinesResponse`: last-24h hourly bag index for every bag in one call (only `range=1D`), cached 5 min |
| GET | `/bags/returns` | `getBagReturns` | no | `BagReturnsResponse`: 1M / 1Y / ALL bag-index returns (%) + 30-day daily sparkline for every bag in one call, from one 2-year daily tokens.xyz series per mint, cached 5 min |
| GET | `/bags/{id}/history?range=7d` | `getBagHistory` | no | `BagHistoryResponse` (per-asset candles + index, with snapshot fallback); `range` = `24h`\|`7d`\|`30d`\|`1y` (default `7d`); unknown bag => 404 |
| GET | `/bags/{id}/stories?limit&cursor&format` | `listBagStories` | no | `StoriesResponse`, filtered to stories whose `bagIds` include that bag; unknown bag => 404 |
| GET | `/stories?limit=10&cursor=<opaque>&format=podcast` | `listStories` | no | `{stories:Story[], nextCursor:string|null}`; newest first, default 10 / max 20; `format` optional (`article`|`podcast`); cursor is an opaque story ID from the previous page, invalid cursor => 400; empty feed => `[]` and `null`. No ingestion/AI call on reads. |
| GET | `/me` | `getMe` | yes | `{user:{id,email:string|null,walletAddress:string|null,createdAt}}` |
| GET | `/saved-bags` | `listSavedBags` | yes | `{bagIds:string[]}` |
| POST | `/saved-bags` body `{bagId}` | `saveBag` | yes | `{bagIds:string[]}`; unknown bag => 404 |
| DELETE | `/saved-bags/{bagId}` | `removeSavedBag` | yes | `{bagIds:string[]}` |
| GET | `/portfolio` | `getPortfolio` | yes | `PortfolioResponse` |
| GET | `/activity?limit=20&cursor=<token>` | `listActivity` | yes | `ActivityResponse`; newest first, default 20 / max 100; `cursor` = `nextCursor` (Helius pagination token `<slot>:<position>`) from the previous page; malformed or rejected cursor / bad limit => 400 |
| POST | `/trade/quote` body `TradeRequest` | `quoteBagTrade` | yes | `QuoteResponse`; unknown bag => 404 |
| POST | `/trade/prepare` body `TradeRequest` | `prepareBagTrade` | yes | `PrepareResponse`; unknown bag => 404 |

## Types

```ts
Issuer = "xstocks" | "prestocks"
AssetClass = "public-equity" | "pre-ipo"
Curator = { kind: "person" | "aggregate" | "editorial"; name: string; description: string }
Bag = { id, title, subtitle, description, thesis, disclosure: string; sourceType: "editorial" | "disclosure"; issuer: Issuer; assetClass: AssetClass;
        curator: Curator; risks: string[]; tradable: boolean; tradableReason: string | null; market: BagMarket | null;
        sources: { title: string; url: string }[]; assets: BagAsset[] }
BagMarket = { change24hPct: number | null; change24hSource: "snapshot" | "jupiter" | null; premiumPct: number | null; coverage: number;
              worstLiquidityUsd: number | null; worstLiquiditySymbol: string | null; worstImpactPct: number | null; worstImpactSymbol: string | null; asOf: string }
  // weight-averaged over legs that have data; coverage = fraction (0..1) of bag weight with a price; null when no leg has data.
  // worstLiquidity* = the leg with the smallest Jupiter pool TVL ("thinnest pool"); worstImpact* = the leg with the highest price impact on
  // the server's fixed 10 USDC probe quote ("costliest to buy") - these can name different assets, label them differently.
  // asOf = the market snapshot every leg was read from; list and detail return identical numbers while asOf is equal (60s window).
BagAsset = { symbol: string; name: string; weightBps: number; mint: string | null; decimals: number | null; uiAmountMultiplier: number;
             issuer: Issuer; assetClass: AssetClass; reference: IssuerReference | null;
             market: AssetMarket | null; liquidityTier: "deep" | "ok" | "thin" | null; evidence: Evidence[]; sourceUrl: string;
             iconUrl: string | null; iconSource: "jupiter-token" | "issuer-token" | "underlying-brand" | null;
             brandColor: string | null }   // "#rrggbb" lowercase, derived from the token icon; null when unavailable
AssetMarket = { usdPrice: number | null; priceChange24hPct: number | null; change24hSource: "snapshot" | "jupiter" | null; liquidityUsd: number | null;
                organicScore: number | null; organicScoreLabel: string | null; holderCount: number | null; volume24hUsd: number | null;
                underlying: { source: "pyth" | "prestocks" | "jupiter-stock"; price: number; asOf: string } | null;
                premiumPct: number | null; probe: { sizeUsdc: number; priceImpactPct: number; asOf: string } | null; asOf: string }
  // usdPrice from Jupiter Price v3; liquidity (pool TVL, not route depth)/organic/holders/volume (buy+sell 24h) from Jupiter Tokens v2.
  // priceChange24hPct (a percent): "snapshot" = usdPrice vs the server's own hourly price snapshot closest to 24h ago (fixed reference,
  // changes only when the price does); "jupiter" = Jupiter's rolling 24h last-trade window (single field `priceChange24h`, identical in
  // Price v3 and Tokens v2), which re-anchors on every trade and every trade ageing out, so on thinly traded tokens it can move several
  // points between refreshes with an unchanged price. Show change24hSource / asOf; the server falls back to "jupiter" until 24h of
  // snapshots exist for that mint. probe = Jupiter's priceImpactPct (percent) for a 10 USDC buy of this asset, refreshed every 5 min;
  // on orderbook routes this is effectively the spread. underlying = reference price of what the token tracks: "pyth" = Pyth Hermes
  // Equity.US.<TICKER>/USD (real stock; asOf = publish time, stale outside market hours) when the server has PYTH_API_KEY; "jupiter-stock"
  // = Jupiter's xStocks stock reference price (asOf = its updatedAt); "prestocks" = issuer markPrice. premiumPct = (usdPrice /
  // underlying.price - 1) * 100; null when either side is missing.
  // liquidityTier = the worse of the TVL tier (deep >= $1M, ok >= $100k, else thin) and the probe tier (thin >= 1% impact, ok >= 0.3%).
  // market is null when the mint is unresolved or no snapshot exists yet.
Evidence = { kind: "disclosure"; member: string; chamber: "House" | "Senate"; txnType: "buy" | "sell" | "exchange"; txnDate: string;
             disclosedDate: string; amountRange: string; amountMidUsd: number; url: string }   // url = official filing (House Clerk PDF / Senate eFD)
BagHistoryResponse = { bagId: string; source: "tokens" | "snapshot"; range: "24h" | "7d" | "30d" | "1y"; interval: "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
                       from: number; to: number; assets: AssetSeries[]; bag: { t: number; value: number }[]; changePct: number | null; asOf: string | null }
AssetSeries = { symbol: string; mint: string | null; weightBps: number; candles: Candle[] }
Candle = { t: number; o: number; h: number; l: number; c: number; v: number | null }   // t = unix seconds (candle open); v = volume when the provider has it
  // BagHistoryResponse: source "tokens" = real OHLCV candles from tokens.xyz per asset (interval by range: 24h->15m, 7d->1H, 30d->4H, 1y->1D; cached 60s per
  // mint+interval). source "snapshot" = fallback when tokens.xyz is unconfigured, fails, or cannot resolve every mint of the bag: the API's
  // hourly price snapshots rendered as flat candles (o=h=l=c, v=null), thinned to the range's step; sparse until snapshots accumulate -
  // render a plain line and say "limited history". from/to are the requested window (unix seconds). bag = weighted index using close,
  // base 100 at the first timestamp where every asset has a candle (only such timestamps are included); changePct = first->last of the
  // index (asset chart: first->last close), null with fewer than 2 points. Assets with mint null have no candles and block the index.
ChartRange = "1D" | "1W" | "1M" | "1Y" | "ALL"     // riven-cash period mapping: 1D -> 15m candles over 24h, 1W -> 1H over 7d, 1M -> 4H over 30d, 1Y -> 1D over 365d, ALL -> 1D candles over 2 years
  // (tokens.xyz only returns a few days when asked without a window, so ALL sends from/to explicitly; xStocks candles start 2025-12-24, PreStocks vary)
ChartReason = "unconfigured" | "unresolved" | "unavailable" | "not_tradable" | "insufficient_data"
  // unconfigured = no TOKENS_API_KEY on the server; unresolved = tokens.xyz does not know the mint; unavailable = provider error/timeout;
  // not_tradable = asset/bag has no verified mint (research-only); insufficient_data = fewer than 2 points. Any non-null reason => hide the chart.
AssetChartResponse = { mint: string; symbol: string | null; range: ChartRange; interval: CandleInterval; points: { t: number; close: number }[]; candles: Candle[];
                       change: { abs: number; pct: number } | null; source: "tokens.xyz"; reason: ChartReason | null; asOf: string | null }
  // points = candle closes, ascending, t > 0 and close > 0 (unix seconds); candles = the same series as OHLCV. change = first -> last close
  // (abs in USD, pct in percent), null with fewer than 2 points. Cached 60s per mint+interval (tokens.xyz resolve results cached 24h).
BagChartResponse = { bagId: string; range: ChartRange; interval: CandleInterval; points: { t: number; value: number }[]; change: { pct: number } | null;
                     legs: ChartLeg[]; source: "tokens.xyz"; reason: ChartReason | null; asOf: string | null }
ChartLeg = { mint: string | null; symbol: string; weight: number; weightBps: number; change: { pct: number } | null; ok: boolean; reason: ChartReason | null }
  // Every leg is fetched in parallel (Promise.allSettled). points = weight-normalised bag index, base 100 at the first bucket: each ok leg's
  // closes are bucketed to the interval, normalised to 100 at that leg's first close, forward-filled through gaps (flat 100 before its first
  // close), and summed by bag weight renormalised over ok legs; buckets missing more than one leg are dropped. Legs with ok:false (failed,
  // unresolved, research-only) are excluded from the index but still listed with their reason; weight = weightBps / 10000 (bag weight, not
  // renormalised). change.pct = first -> last index value. When the key is missing, every leg fails, or the bag is research-only: 200 with
  // points [], change null and a top-level reason. Cached 60s per bag+range. For 1Y and ALL every charted leg must have a close before a
  // bucket is emitted (the index starts on the first day all legs trade; a newly listed token shortens the window instead of counting flat).
BagSparklinesResponse = { range: "1D"; interval: "1H"; source: "tokens.xyz"; reason: ChartReason | null; sparklines: { [bagId: string]: { t: number; value: number }[] } }
BagReturnsResponse = { source: "tokens.xyz"; interval: "1D"; asOf: string | null; reason: ChartReason | null;
                       returns: { [bagId: string]: { "1M": number | null; "1Y": number | null; ALL: number | null; since: string | null; sparkline1M: { t: number; value: number }[] } } }
  // Single definition of a period change: a bag's 1M / 1Y / ALL here are exactly `GET /bags/{id}/chart?range=1M|1Y|ALL`.change.pct (same
  // candles, interval, window start and leg rule: 1M = 4H candles over 30d with the one-late-leg tolerance; 1Y / ALL = daily candles over
  // 365d / 2y, index starting on the first day every leg has a close). A card figure therefore always equals the detail-screen figure. A range
  // whose chart has a `reason` (unconfigured, provider down, research-only bag) is null. since = first point of the ALL index (ISO); when
  // history is shorter than a year, 1Y equals ALL and `since` tells the client how long the window really is. sparkline1M = the 1M index
  // thinned to one point per calendar day plus the final point (base 100). Upstream cost: one 4H/30d and one 1D/2y tokens.xyz call per
  // distinct mint per refresh (1Y is clipped from the 2y series, never fetched separately). Cached 5 min; every bag id is a key.
  // Cards should show 1M and 1Y from here and keep /bags/sparklines for the intraday line.
  // One entry per bag (all eight ids always present). Same index maths as BagChartResponse over the last 24h of 1H closes (~25 points, base
  // 100); [] for bags that cannot be charted. reason is null when at least one bag has points. Cached 5 minutes for all bags at once.
IssuerReference = { markPrice: number; tokenPrice: number; impliedValuation: number; asOf: string }
  // PreStocks only. Issuer-reported USD marks for the private company / token (NOT a quote or a Stockpile price);
  // asOf = when the backend last refreshed the issuer directory. Always null for xStocks.

PortfolioResponse = { walletAddress: string | null; status: "live" | "unavailable"; holdings: Holding[];
                      sol: Balance | null; usdc: Balance | null; totalUsd: number | null; unpricedCount: number;
                      asOf: string | null; message: string | null }
Balance = { amount: string; decimals: number; uiAmount: string; usdPrice: number | null; usdValue: number | null }
  // raw base units: sol = lamports (9), usdc = 6 decimals; uiAmount is the exact decimal string
Holding = { mint: string; symbol: string | null; name: string | null; iconUrl: string | null; amount: string; decimals: number;
            uiAmount: string | null; program: "token" | "token-2022"; usdPrice: number | null; usdValue: number | null; bagIds: string[] }
  // uiAmount = RPC uiAmountString (already scaled for Token-2022 scaled-UI mints); null if the RPC omitted it.
  // symbol = "USDC" / allowlisted bag symbol (e.g. "NVDAx") / Jupiter symbol / null; name = editorial name / Jupiter name / null;
  // usdPrice = Jupiter Tokens v2 price per UI unit; usdValue = uiAmount * usdPrice rounded to 6 dp, null when either is unknown
  // (a zero balance is 0). bagIds = every bag (editorial or tracker) whose current assets include this exact mint, catalogue order.
  // totalUsd = sum of holdings[].usdValue + sol.usdValue (null only when status is "unavailable"); unpricedCount = holdings (+ SOL)
  // with usdValue null, so the client can say "excludes N unpriced tokens" instead of implying the total is complete.

ActivityResponse = { status: "live" | "unavailable"; walletAddress: string | null; items: Activity[]; nextCursor: string | null;
                     asOf: string | null; error: ActivityError | null; message: string | null }
ActivityError = { code: "NO_WALLET" | "PROVIDER_NOT_CONFIGURED" | "PROVIDER_UNAVAILABLE" | "INVALID_CURSOR"; message: string }
Activity = { signature: string; ts: string | null; kind: "swap" | "transfer-in" | "transfer-out" | "other"; status: "confirmed" | "failed";
             summary: string; legs: ActivityLeg[]; feeLamports: number; bagId: string | null; explorerUrl: string }
ActivityLeg = { mint: string; symbol: string | null; amount: string; direction: "in" | "out" }
  // Legs are the wallet's own net balance changes in that transaction, "out" legs first: token deltas per mint over accounts the
  // wallet owns (Token + Token-2022) plus the wallet's SOL delta with the network fee it paid and rent it paid/recovered for its own
  // token accounts excluded. Native SOL uses mint So11111111111111111111111111111111111111112, symbol "SOL"; a wrapped-SOL account
  // nets into the same leg. amount is a UI decimal string in wallet-displayed units (RPC uiAmountString, so Token-2022 scaled-UI mints
  // such as OPENAI/SPACEX are already scaled - do not multiply again). symbol: SOL / USDC / allowlisted bag symbol / Jupiter symbol / null.
  // kind: exactly one out + one in = "swap"; only in = "transfer-in"; only out = "transfer-out"; anything else = "other".
  // summary: "Bought 0.002823 KALSHI for 2.5 USDC", "Sold 0.021 NVDAx for 4.9 USDC", "Swapped 1 SOL for 150 USDC", "Received 10 USDC
  // from ACv7…Eek5", "Sent 0.1 SOL to 9xQe…VFin"; multi-leg other = "Sent …; received …"; no-leg other = program label ("Token account
  // setup", "Jupiter transaction", "System transaction", "Vote"), prefixed "Failed: " when status is "failed". Never a raw instruction name.
  // feeLamports = the transaction fee only when this wallet was the fee payer (first account key), else 0 (relayer-paid deposits show 0).
  // bagId = first bag (catalogue order) whose assets include the received mint when a swap paid USDC; null otherwise. explorerUrl = solscan.
  // status "failed" = meta.err set; legs are always [] for failed transactions. cursor/nextCursor = Helius' opaque pagination token
  // ("<slot>:<position>"); pass nextCursor back unchanged, stop when null. A page can legitimately contain fewer than `limit` items while
  // nextCursor is non-null (server-side filtering); only null means the end.

TradeRequest = { bagId: string; inputMint: string; amount: string; slippageBps?: number }
  // inputMint must be mainnet USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v; amount = integer USDC base units (6 decimals)
  // as a string, 1..20 digits; slippageBps integer 1..500, default 50.
TradeError = { code: TradeErrorCode; message: string; legIndex: number | null; symbol: string | null }
TradeErrorCode = "NO_WALLET" | "UNSUPPORTED_INPUT_MINT" | "PROVIDER_NOT_CONFIGURED" | "BAG_NOT_TRADABLE" | "AMOUNT_TOO_SMALL"
               | "NO_ROUTE" | "TOKEN_NOT_TRADABLE" | "SLIPPAGE_REJECTED" | "QUOTE_MISMATCH" | "PROVIDER_ERROR" | "PROVIDER_TIMEOUT" | "INVALID_TRANSACTION"
QuoteLeg = { index: number; symbol: string; weightBps: number; inputMint: string; outputMint: string; outputDecimals: number | null;
             uiAmountMultiplier: number; inputAmount: string; outAmount: string; minOutAmount: string | null; priceImpactPct: string | null; routeSteps: number }
  // display tokens = outAmount / 10^outputDecimals * uiAmountMultiplier (multiplier is 1 except Token-2022 scaled-UI mints)
QuoteResponse = { status: "available" | "unavailable"; bagId; inputMint; amount: string; slippageBps: number;
                  legs: QuoteLeg[]; error: TradeError | null; message: string | null }
PreparedTransaction = QuoteLeg & { transaction: string /* base64 unsigned v0 tx */; lastValidBlockHeight: number | null }
PrepareResponse = { status: "ready" | "unavailable"; bagId; inputMint; amount; slippageBps; walletAddress: string | null;
                    transactions: PreparedTransaction[]; error: TradeError | null; message: string | null }

Story = { id, title: string; format: "article" | "podcast" | "disclosure"; summary, publisher, sourceUrl, publishedAt: string;
          imageUrl: string | null; imageCredit: string | null; bagIds: string[]; bagConnections: StoryBagConnection[];
          provenance: "editorial" | "ai"; status: "published" }
StoryBagConnection = { bagId: string; relationship: "direct" | "inferred"; context: "supporting" | "opposing" | "neutral"; explanation: string }
```

## Semantics

**Bags.** Twelve bags. Ten editorial bags: seven xStocks public-equity bags (`megacap-builders`, `ai-infrastructure`, `consumer-frontiers`, `crypto-fintech-rails`, `cloud-software`, `everyday-brands`, `index-basics`; 5-8 assets each except `index-basics` (3 ETF tokens), every symbol gated by `apps/api/scripts/probe-xstocks.ts`: 10 USDC Jupiter quote routes with <= 2.5% price impact, TVL >= $500, implied price within 10% of Jupiter usdPrice) and three PreStocks pre-IPO bags (`frontier-ai-labs` = OPENAI/ANTHROPIC/FIGUREAI/NEURALINK, `prediction-markets` = KALSHI/POLYMARKET, `defense-space` = SPACEX/ANDURIL). `issuer`/`assetClass` are set on the bag and repeated on every asset. `risks` is an ordered list of plain-language risk statements (PreStocks bags include the issuer's disclaimer points: SPV economic exposure only, no ownership/voting/dividend/information rights, not available to U.S. persons, no guaranteed liquidity, total loss possible); `disclosure` is the one-paragraph string to show before buying. `tradable` is `true` only when every asset has `mint != null`. xStocks assets resolve from the operator allowlist `STOCKPILE_ALLOWED_MINTS`. PreStocks assets additionally require that the allowlisted mint equals the issuer's current `contract_address` from `https://prestocks.com/api/prestocks` (cached 10 min, stale-on-failure) **and** passes a runtime Jupiter verification (exact mint id, same symbol, integer decimals, `verified` + `prestocks` tags, live 1 USDC quote route; cached 1h) — otherwise the asset is `mint:null` and the bag is research-only. `decimals` is the token's on-chain decimals when tradable (xStocks 8, PreStocks 9). `uiAmountMultiplier` is the Token-2022 scaled-UI multiplier (currently OPENAI 1.4861347 and SPACEX 5; all others 1): raw `outAmount`/`Holding.amount` must be multiplied by it to match wallet-displayed units and issuer `tokenPrice`. Only PreStocks-issued tokens are used for pre-IPO exposure. With the verified allowlist in `.env.example`, all ten editorial bags are tradable; without it they are research-only. `tradableReason` is a short human-readable reason when `tradable` is false (null when tradable).

**Congress-disclosure bags** (`sourceType:"disclosure"`, `issuer:"xstocks"`): `pelosi-tracker` (curator kind `person`) = purchases disclosed in the last 12 months by Nancy Pelosi (filings include spouse trades), intersected with the 8 tradable xStocks tickers, weighted by amount-range midpoint; `congress-consensus` (curator kind `aggregate`) = net (buys minus sells, midpoints) across all members over the last 90 days of transaction dates, only net-positive tickers, weighted by net. Assets are computed at request time from persisted STOCK Act rows (CongressInvests, ingested by `bun run congress:ingest`; cached 5 min); each asset carries `evidence[]` citing every filing that contributed. If fewer than 2 tickers overlap, the bag is returned with the assets it has but `tradable:false` and `tradableReason` explaining it is research-only (`/trade/*` returns `BAG_NOT_TRADABLE`). Weights use midpoints of disclosed ranges; `disclosure`/`risks` state the 30-45 day lag, ranges-not-amounts, spouse trades, and not-a-live-portfolio caveats — show `curator` and `disclosure` before any buy. Empty `assets` means no qualifying disclosure was found. `weightBps` per bag sums to 10000. Icons: the server resolves image metadata by exact mint against Jupiter Tokens V2 using an issuer-directory snapshot (`apps/api/src/lib/issuer-assets.ts`), cached in-process (24h positive / 5m negative, stale-on-failure, bounded to 100 mints); Jupiter failure falls back to issuer-hosted artwork (`issuer-token`), then an explicitly mapped underlying-company logo (`underlying-brand`) or `null`. An icon is not proof of tradability; use `mint`/`tradable`. The server never sends its Jupiter API key to the client. Editorial bag inclusion and weighting are Stockpile inference, not source claims or recommendations.

**Brand colour.** `brandColor` is computed server-side when an icon is resolved (same in-process cache path as icons: 24h positive / 5m negative TTL, stale-on-failure, bounded to 100 URLs, warmed at API start) by fetching the PNG only from the issuer (`xstocks-metadata.backed.fi`, `www.prestocks.com`/`prestocks.com`, following at most one redirect within those hosts) or Jupiter (`*.jup.ag`) hosts over HTTPS with a 4s timeout, 512KB cap, and `image/*` content-type check, decoding it in pure TypeScript (no native deps; Workers-safe), sampling ~32px, discarding transparent/near-white pixels, quantizing, and taking the most frequent saturated bucket; mono logos fall back to their dominant grey/dark tone, and overly light picks are darkened so the colour is usable on a white background. Any failure or a non-allowlisted host (e.g. `underlying-brand` SVG fallbacks) yields `null`; use a palette fallback in that case. Colours can differ between deployments if issuer artwork changes. Set `STOCKPILE_BRAND_COLORS=0` to disable. Current live values: AAPLx `#1a1a1a`, MSFTx `#fdb92c`, NVDAx `#78b808`, AMDx `#1a1a1a`, GOOGLx `#f71603`, AMZNx `#f89808`, TSLAx `#ef0027`, NFLXx `#b1060f`, OPENAI `#0ea982`, ANTHROPIC `#ba8f70`, FIGUREAI `#000000`, NEURALINK `#010101`, KALSHI `#08c386`, POLYMARKET `#2f5cff`, SPACEX `#054b83`, ANDURIL `#000000`.

**Portfolio.** Balances come from one batched Helius RPC call (`getBalance` for SOL, `getTokenAccountsByOwner` for the SPL Token program and the Token-2022 program; xStocks are Token-2022) and are the source of truth. `usdc.amount` is the sum of all USDC (6-decimal) accounts; `sol.amount` is lamports. `holdings` lists non-zero accounts in RPC order (SOL is not a holding; use `sol`). Every mint (plus wrapped SOL and USDC for pricing) is then looked up in one Jupiter Tokens v2 batch (`/tokens/v2/search?query=<mints>`, cached 60s per mint, stale-on-failure) for `symbol`/`name`/`iconUrl`/`usdPrice`; allowlisted bag symbols and editorial names take precedence over Jupiter's. A Jupiter failure or an unlisted token never hides a balance: those holdings keep `usdPrice`/`usdValue` `null` and are counted in `unpricedCount`. `status:"unavailable"` (with `sol`/`usdc`/`totalUsd` `null`, `holdings` `[]`, `message`) when no verified wallet, Helius unconfigured, or any RPC error; no invented balances or prices. The mobile fund/buy sheet should treat `usdc` as the spendable balance and `sol` as the fee balance (each prepared transaction needs a small SOL fee from the wallet).

**Activity.** Helius RPC `getTransactionsForAddress` (`POST https://mainnet.helius-rpc.com`, params `[wallet, { transactionDetails:"full", encoding:"jsonParsed", maxSupportedTransactionVersion:1, limit, sortOrder:"desc", commitment:"confirmed", paginationToken, filters:{ tokenAccounts:"balanceChanged" } }]`; the Enhanced Transactions REST API is legacy), fetched on demand for the Privy-verified wallet and cached 30s per wallet+cursor+limit (concurrent requests share one fetch; failures are not cached). Legs are computed from `meta` only, the way riven-cash's transaction helpers do: `preTokenBalances`/`postTokenBalances` filtered to `owner == wallet` summed per mint, and `postBalances - preBalances` at the wallet's account-key index (static keys followed by `loadedAddresses` writable then readonly) with the fee added back when the wallet is the fee payer and the rent of token accounts the wallet opened/closed in that transaction added back/removed (only when the wallet actually paid/received it). Helius `type`/`description` labels are never used, so a Jupiter buy whose first instruction creates the wallet's Token-2022 ATA is still a swap. SOL residue under 0.00001 SOL next to token legs is dropped. Symbols for unknown mints are resolved through the same Jupiter batch as the portfolio (one call per page). `status:"unavailable"` with a typed `error` when no wallet (`NO_WALLET`), Helius unconfigured (`PROVIDER_NOT_CONFIGURED`), or the provider fails / times out after 15s (`PROVIDER_UNAVAILABLE`); a cursor Helius rejects returns 400 `{error:"Invalid activity cursor"}`. Never an invented history; the endpoint reads only and never submits anything.

**Quote.** The USDC amount is split per leg by `weightBps` (last leg absorbs rounding, legs sum exactly to `amount`); each leg is quoted on Jupiter `/swap/v1/quote` (USDC -> asset, `restrictIntermediateTokens`). All-or-nothing: on the first failing leg the response is `status:"unavailable"`, `legs:[]`, and `error` identifies the code plus `legIndex`/`symbol` where applicable (`null` for request-level errors such as `UNSUPPORTED_INPUT_MINT`/`PROVIDER_NOT_CONFIGURED`). `BAG_NOT_TRADABLE` names the first asset whose mint could not be resolved (unlisted, unverified, or allowlist mismatch). `AMOUNT_TOO_SMALL` triggers when a leg would receive 0 base units; `NO_ROUTE` is Jupiter's `NO_ROUTES_FOUND` (seen live for 1 base unit); `TOKEN_NOT_TRADABLE` mirrors Jupiter's code; `SLIPPAGE_REJECTED` maps Jupiter slippage errors; `PROVIDER_TIMEOUT` after 8s. `minOutAmount` is Jupiter's `otherAmountThreshold` for the requested `slippageBps`; `priceImpactPct` is Jupiter's raw string (pass through, do not reinterpret). `message` is a human-readable summary (`error.message` when unavailable). Quotes are indicative and can expire.

**Prepare.** Same validation and quoting, then Jupiter `/swap/v1/swap` per leg with `userPublicKey = walletAddress` (the Privy-verified Solana wallet). Each `PreparedTransaction` carries the full `QuoteLeg` label (`index`, `symbol`, `outputMint`, `inputAmount`, `outAmount`, `minOutAmount`) so the client can title each signing step (e.g. "Leg 1 of 3: 1.05 USDC -> AAPLx") without neutral labels, plus the base64 unsigned **versioned (v0)** transaction and Jupiter's `lastValidBlockHeight` (transaction expires after that block height). Before returning, the backend parses each transaction and rejects it (`INVALID_TRANSACTION`) unless it is unsigned and its fee payer (first static account) equals `walletAddress`. The client must sign each transaction with the wallet and submit them itself (one per leg, independently; a later leg can fail after an earlier one lands). The backend never signs, never submits, and never claims a fill. `status:"unavailable"` returns `transactions:[]` with a typed `error`, never a partial set.

**Stories.** `format:"disclosure"` stories are generated from each newly ingested STOCK Act row (title like "Pelosi disclosed buying GOOGL (range $500K–$1M)", `sourceUrl` = the official filing plus a `#fragment`, `publishedAt` = disclosure date, publisher "House Clerk PTR"/"Senate eFD PTR", provenance `editorial`); they link to `congress-consensus` and, for Pelosi purchases, `pelosi-tracker`, with `context` supporting for buys / opposing for sells. Filter with `format=disclosure`. Other sources are fixed publisher feeds (Microsoft, NVIDIA, Apple, Amazon, Google, OpenAI newsrooms) plus multi-company press feeds (TechCrunch AI, Ars Technica, CNBC Technology, Breaking Defense, SpaceNews) from which only items explicitly mentioning a mapped company are kept; pre-IPO names (OpenAI, Anthropic, Figure AI, Neuralink, Kalshi, Polymarket, SpaceX/Starlink, Anduril) map to the PreStocks bags. Summary is an attributed source-derived excerpt or validated AI paraphrase; never invented. `imageUrl:null` means UI artwork fallback. `direct` = the source explicitly mentions a mapped company; `inferred` = editorial/AI thematic relevance. `context` is an editorial tone label derived from the publisher's own wording (rule-based: e.g. launches/expands/partnership/funding round/wins contract/awarded/unique access => `supporting`; lawsuit/sued/breach/hacked/layoffs/ban/shut down/defies/investigation/antitrust => `opposing`; mixed or no signal => `neutral`), never a price call; the `explanation` ends with `Tone <context>: the source says "<matched words>"` when a stance was assigned. AI-provided stances are accepted only when the same rules agree. Disclosure stories: buy => supporting, sell => opposing. `bun run stories:recontext` re-derives the tone for stored editorial article/podcast stories after rule changes. `provenance:"editorial"` = deterministic source-derived mapping. No story implies a supported mint, trade, or price. Stories are ingested offline (`bun run stories:ingest`); no public endpoint triggers AI.

## Runtime and SDK

Root gitignored `.env`: `DATABASE_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `HELIUS_API_KEY` (portfolio balances, activity), `JUPITER_API_KEY` (icons, market data, portfolio metadata/prices, quote, prepare), `STOCKPILE_ALLOWED_MINTS` (comma-separated `SYMBOL:verifiedSolanaMint`; see `.env.example` for the eight xStocks and eight PreStocks mints verified 2026-09-25 against each issuer directory and Jupiter), `STOCKPILE_PRESTOCKS=0` to disable the PreStocks directory (pre-IPO bags become research-only), `STOCKPILE_MARKET=0` to disable market data (all `market` null), optional `PYTH_API_KEY` (Hermes now requires a key; without it xStocks underlying falls back to `jupiter-stock`), optional `TOKENS_API_KEY` (tokens.xyz candles for `/assets/{mint}/chart`, `/bags/{id}/chart`, `/bags/sparklines` and `/bags/{id}/history`; deployed stages use the `TokensApiKey` SST secret; without it the chart endpoints return `points: []` with `reason:"unconfigured"` and history falls back to `source:"snapshot"`), optional `STOCKPILE_CONGRESS_API_KEY` (CongressInvests Pro; free tier needs none), optional `OPENAI_API_KEY`/`STOCKPILE_AI_MODEL`, `CORS_ORIGINS`, `PORT` (4040). Root `bun run generate:sdk` regenerates `@stockpile/api-client` (`packages/api-client/openapi.json`, `src/generated/`). SDK functions: `getHealth`, `listBags`, `getBag`, `getBagChart`, `getBagSparklines`, `getBagHistory`, `getAssetChart`, `listBagStories`, `listStories`, `getMe`, `listSavedBags`, `saveBag`, `removeSavedBag`, `getPortfolio`, `listActivity`, `quoteBagTrade`, `prepareBagTrade`. Generated types: `Bag`, `BagAsset`, `Issuer`, `AssetClass`, `IssuerReference`, `Curator`, `Evidence`, `AssetMarket`, `BagMarket`, `UnderlyingPrice`, `BagHistoryResponse`, `AssetChartResponse`, `BagChartResponse`, `BagSparklinesResponse`, `ChartLeg`, `ChartRange`, `ChartReason`, `ChartSource`, `PricePoint`, `IndexPoint`, `AssetSeries`, `Candle`, `HistoryRange`, `HistorySource`, `CandleInterval`, `PortfolioResponse`, `Holding`, `Balance`, `ActivityResponse`, `Activity`, `ActivityLeg`, `ActivityError`, `TradeRequest`, `TradeError`, `QuoteLeg`, `QuoteResponse`, `PreparedTransaction`, `PrepareResponse`, `Story`, `StoryBagConnection`, `StoriesResponse`, `SavedBagsResponse`. Legacy `/baskets*`, `/saved-baskets*`, `basketId`, `pileIds`, `pileConnections` no longer exist (404 / 400).
