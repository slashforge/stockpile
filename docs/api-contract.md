# Stockpile API contract (mobile integration)

Product term is **bag** everywhere (formerly basket/pile). Base URL `EXPO_PUBLIC_API_URL` (local: `http://localhost:4040`; device: use LAN IP). JSON. Public routes require no auth. Protected routes require `privy-id-token: <Privy identity token>` (not access token). Backend verifies it with Privy, never accepts client-supplied user IDs or wallet ownership claims. Unconfigured Privy returns 503; missing/invalid token returns 401. Non-2xx JSON errors: `{ "error": "message" }`. Zod-rejected bodies return 400.

## Routes

| Method | Path | SDK function | Auth | Response |
| --- | --- | --- | --- | --- |
| GET | `/health` | `getHealth` | no | `{status:"ok"}` |
| GET | `/bags` | `listBags` | no | `{bags: Bag[]}` |
| GET | `/bags/{id}` | `getBag` | no | `{bag: Bag}`; unknown => 404 |
| GET | `/bags/{id}/stories?limit&cursor&format` | `listBagStories` | no | `StoriesResponse`, filtered to stories whose `bagIds` include that bag; unknown bag => 404 |
| GET | `/stories?limit=10&cursor=<opaque>&format=podcast` | `listStories` | no | `{stories:Story[], nextCursor:string|null}`; newest first, default 10 / max 20; `format` optional (`article`|`podcast`); cursor is an opaque story ID from the previous page, invalid cursor => 400; empty feed => `[]` and `null`. No ingestion/AI call on reads. |
| GET | `/me` | `getMe` | yes | `{user:{id,email:string|null,walletAddress:string|null,createdAt}}` |
| GET | `/saved-bags` | `listSavedBags` | yes | `{bagIds:string[]}` |
| POST | `/saved-bags` body `{bagId}` | `saveBag` | yes | `{bagIds:string[]}`; unknown bag => 404 |
| DELETE | `/saved-bags/{bagId}` | `removeSavedBag` | yes | `{bagIds:string[]}` |
| GET | `/portfolio` | `getPortfolio` | yes | `PortfolioResponse` |
| POST | `/trade/quote` body `TradeRequest` | `quoteBagTrade` | yes | `QuoteResponse`; unknown bag => 404 |
| POST | `/trade/prepare` body `TradeRequest` | `prepareBagTrade` | yes | `PrepareResponse`; unknown bag => 404 |

## Types

```ts
Issuer = "xstocks" | "prestocks"
AssetClass = "public-equity" | "pre-ipo"
Bag = { id, title, subtitle, description, thesis, disclosure: string; sourceType: "editorial"; issuer: Issuer; assetClass: AssetClass;
        risks: string[]; tradable: boolean; sources: { title: string; url: string }[]; assets: BagAsset[] }
BagAsset = { symbol: string; name: string; weightBps: number; mint: string | null; decimals: number | null; uiAmountMultiplier: number;
             issuer: Issuer; assetClass: AssetClass; reference: IssuerReference | null; sourceUrl: string;
             iconUrl: string | null; iconSource: "jupiter-token" | "issuer-token" | "underlying-brand" | null;
             brandColor: string | null }   // "#rrggbb" lowercase, derived from the token icon; null when unavailable
IssuerReference = { markPrice: number; tokenPrice: number; impliedValuation: number; asOf: string }
  // PreStocks only. Issuer-reported USD marks for the private company / token (NOT a quote or a Stockpile price);
  // asOf = when the backend last refreshed the issuer directory. Always null for xStocks.

PortfolioResponse = { walletAddress: string | null; status: "live" | "unavailable"; holdings: Holding[];
                      sol: Balance | null; usdc: Balance | null; asOf: string | null; message: string | null }
Balance = { amount: string; decimals: number }            // raw base units: sol = lamports (9), usdc = 6 decimals
Holding = { mint: string; symbol: string | null; amount: string; decimals: number; uiAmount: string | null; program: "token" | "token-2022" }
  // uiAmount = RPC uiAmountString (already scaled for Token-2022 scaled-UI mints); null if the RPC omitted it

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

Story = { id, title: string; format: "article" | "podcast"; summary, publisher, sourceUrl, publishedAt: string;
          imageUrl: string | null; imageCredit: string | null; bagIds: string[]; bagConnections: StoryBagConnection[];
          provenance: "editorial" | "ai"; status: "published" }
StoryBagConnection = { bagId: string; relationship: "direct" | "inferred"; context: "supporting" | "opposing" | "neutral"; explanation: string }
```

## Semantics

**Bags.** Six editorial bags: three xStocks public-equity bags (`megacap-builders`, `ai-infrastructure`, `consumer-frontiers`) and three PreStocks pre-IPO bags (`frontier-ai-labs` = OPENAI/ANTHROPIC/FIGUREAI/NEURALINK, `prediction-markets` = KALSHI/POLYMARKET, `defense-space` = SPACEX/ANDURIL). `issuer`/`assetClass` are set on the bag and repeated on every asset. `risks` is an ordered list of plain-language risk statements (PreStocks bags include the issuer's disclaimer points: SPV economic exposure only, no ownership/voting/dividend/information rights, not available to U.S. persons, no guaranteed liquidity, total loss possible); `disclosure` is the one-paragraph string to show before buying. `tradable` is `true` only when every asset has `mint != null`. xStocks assets resolve from the operator allowlist `STOCKPILE_ALLOWED_MINTS`. PreStocks assets additionally require that the allowlisted mint equals the issuer's current `contract_address` from `https://prestocks.com/api/prestocks` (cached 10 min, stale-on-failure) **and** passes a runtime Jupiter verification (exact mint id, same symbol, integer decimals, `verified` + `prestocks` tags, live 1 USDC quote route; cached 1h) — otherwise the asset is `mint:null` and the bag is research-only. `decimals` is the token's on-chain decimals when tradable (xStocks 8, PreStocks 9). `uiAmountMultiplier` is the Token-2022 scaled-UI multiplier (currently OPENAI 1.4861347 and SPACEX 5; all others 1): raw `outAmount`/`Holding.amount` must be multiplied by it to match wallet-displayed units and issuer `tokenPrice`. Only PreStocks-issued tokens are used for pre-IPO exposure. With the verified allowlist in `.env.example`, all six bags are tradable; without it they are research-only. `weightBps` per bag sums to 10000. Icons: the server resolves image metadata by exact mint against Jupiter Tokens V2 using an issuer-directory snapshot (`apps/api/src/lib/issuer-assets.ts`), cached in-process (24h positive / 5m negative, stale-on-failure, bounded to 100 mints); Jupiter failure falls back to issuer-hosted artwork (`issuer-token`), then an explicitly mapped underlying-company logo (`underlying-brand`) or `null`. An icon is not proof of tradability; use `mint`/`tradable`. The server never sends its Jupiter API key to the client. Editorial bag inclusion and weighting are Stockpile inference, not source claims or recommendations.

**Brand colour.** `brandColor` is computed server-side when an icon is resolved (same in-process cache path as icons: 24h positive / 5m negative TTL, stale-on-failure, bounded to 100 URLs, warmed at API start) by fetching the PNG only from the issuer (`xstocks-metadata.backed.fi`, `www.prestocks.com`/`prestocks.com`, following at most one redirect within those hosts) or Jupiter (`*.jup.ag`) hosts over HTTPS with a 4s timeout, 512KB cap, and `image/*` content-type check, decoding it in pure TypeScript (no native deps; Workers-safe), sampling ~32px, discarding transparent/near-white pixels, quantizing, and taking the most frequent saturated bucket; mono logos fall back to their dominant grey/dark tone, and overly light picks are darkened so the colour is usable on a white background. Any failure or a non-allowlisted host (e.g. `underlying-brand` SVG fallbacks) yields `null`; use a palette fallback in that case. Colours can differ between deployments if issuer artwork changes. Set `STOCKPILE_BRAND_COLORS=0` to disable. Current live values: AAPLx `#1a1a1a`, MSFTx `#fdb92c`, NVDAx `#78b808`, AMDx `#1a1a1a`, GOOGLx `#f71603`, AMZNx `#f89808`, TSLAx `#ef0027`, NFLXx `#b1060f`, OPENAI `#0ea982`, ANTHROPIC `#ba8f70`, FIGUREAI `#000000`, NEURALINK `#010101`, KALSHI `#08c386`, POLYMARKET `#2f5cff`, SPACEX `#054b83`, ANDURIL `#000000`.

**Portfolio.** One batched Helius RPC call: `getBalance` (SOL), `getTokenAccountsByOwner` for the SPL Token program and the Token-2022 program (xStocks are Token-2022). `usdc.amount` is the sum of all USDC (6-decimal) accounts; `sol.amount` is lamports. `holdings` lists non-zero accounts; `symbol` is `"USDC"` or the allowlisted xStock symbol for that exact mint, else `null`. `status:"unavailable"` (with `sol`/`usdc` `null`, `holdings` `[]`, `message`) when no verified wallet, Helius unconfigured, or any RPC error; no invented balances. The mobile fund/buy sheet should treat `usdc` as the spendable balance and `sol` as the fee balance (each prepared transaction needs a small SOL fee from the wallet).

**Quote.** The USDC amount is split per leg by `weightBps` (last leg absorbs rounding, legs sum exactly to `amount`); each leg is quoted on Jupiter `/swap/v1/quote` (USDC -> asset, `restrictIntermediateTokens`). All-or-nothing: on the first failing leg the response is `status:"unavailable"`, `legs:[]`, and `error` identifies the code plus `legIndex`/`symbol` where applicable (`null` for request-level errors such as `UNSUPPORTED_INPUT_MINT`/`PROVIDER_NOT_CONFIGURED`). `BAG_NOT_TRADABLE` names the first asset whose mint could not be resolved (unlisted, unverified, or allowlist mismatch). `AMOUNT_TOO_SMALL` triggers when a leg would receive 0 base units; `NO_ROUTE` is Jupiter's `NO_ROUTES_FOUND` (seen live for 1 base unit); `TOKEN_NOT_TRADABLE` mirrors Jupiter's code; `SLIPPAGE_REJECTED` maps Jupiter slippage errors; `PROVIDER_TIMEOUT` after 8s. `minOutAmount` is Jupiter's `otherAmountThreshold` for the requested `slippageBps`; `priceImpactPct` is Jupiter's raw string (pass through, do not reinterpret). `message` is a human-readable summary (`error.message` when unavailable). Quotes are indicative and can expire.

**Prepare.** Same validation and quoting, then Jupiter `/swap/v1/swap` per leg with `userPublicKey = walletAddress` (the Privy-verified Solana wallet). Each `PreparedTransaction` carries the full `QuoteLeg` label (`index`, `symbol`, `outputMint`, `inputAmount`, `outAmount`, `minOutAmount`) so the client can title each signing step (e.g. "Leg 1 of 3: 1.05 USDC -> AAPLx") without neutral labels, plus the base64 unsigned **versioned (v0)** transaction and Jupiter's `lastValidBlockHeight` (transaction expires after that block height). Before returning, the backend parses each transaction and rejects it (`INVALID_TRANSACTION`) unless it is unsigned and its fee payer (first static account) equals `walletAddress`. The client must sign each transaction with the wallet and submit them itself (one per leg, independently; a later leg can fail after an earlier one lands). The backend never signs, never submits, and never claims a fill. `status:"unavailable"` returns `transactions:[]` with a typed `error`, never a partial set.

**Stories.** Sources are fixed publisher feeds (Microsoft, NVIDIA, Apple, Amazon, Google, OpenAI newsrooms) plus multi-company press feeds (TechCrunch AI, Ars Technica, CNBC Technology, Breaking Defense, SpaceNews) from which only items explicitly mentioning a mapped company are kept; pre-IPO names (OpenAI, Anthropic, Figure AI, Neuralink, Kalshi, Polymarket, SpaceX/Starlink, Anduril) map to the PreStocks bags. Summary is an attributed source-derived excerpt or validated AI paraphrase; never invented. `imageUrl:null` means UI artwork fallback. `direct` = the source explicitly mentions a mapped company; `inferred` = editorial/AI thematic relevance. `provenance:"editorial"` = deterministic source-derived mapping. No story implies a supported mint, trade, or price. Stories are ingested offline (`bun run stories:ingest`); no public endpoint triggers AI.

## Runtime and SDK

Root gitignored `.env`: `DATABASE_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `HELIUS_API_KEY` (portfolio), `JUPITER_API_KEY` (icons, quote, prepare), `STOCKPILE_ALLOWED_MINTS` (comma-separated `SYMBOL:verifiedSolanaMint`; see `.env.example` for the eight xStocks and eight PreStocks mints verified 2026-09-25 against each issuer directory and Jupiter), `STOCKPILE_PRESTOCKS=0` to disable the PreStocks directory (pre-IPO bags become research-only), optional `OPENAI_API_KEY`/`STOCKPILE_AI_MODEL`, `CORS_ORIGINS`, `PORT` (4040). Root `bun run generate:sdk` regenerates `@stockpile/api-client` (`packages/api-client/openapi.json`, `src/generated/`). SDK functions: `getHealth`, `listBags`, `getBag`, `listBagStories`, `listStories`, `getMe`, `listSavedBags`, `saveBag`, `removeSavedBag`, `getPortfolio`, `quoteBagTrade`, `prepareBagTrade`. Generated types: `Bag`, `BagAsset`, `Issuer`, `AssetClass`, `IssuerReference`, `PortfolioResponse`, `Holding`, `Balance`, `TradeRequest`, `TradeError`, `QuoteLeg`, `QuoteResponse`, `PreparedTransaction`, `PrepareResponse`, `Story`, `StoryBagConnection`, `StoriesResponse`, `SavedBagsResponse`. Legacy `/baskets*`, `/saved-baskets*`, `basketId`, `pileIds`, `pileConnections` no longer exist (404 / 400).
