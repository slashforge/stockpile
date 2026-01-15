# Jupiter Ultra Swap API Documentation

## Overview

Jupiter Ultra Swap API is the most advanced trading solution on Solana, providing:
- **RPC-less Architecture**: No need to maintain your own RPC
- **Best Executed Price**: Predictive execution and slippage-aware routing
- **Sub-second Landing**: 0-1 block (~50-400ms) via Jupiter Beam
- **MEV Protection**: Complete transaction privacy until on-chain execution
- **Gasless Support**: Multiple mechanisms for fee-free swaps
- **Real-Time Slippage Estimation**: Intelligent slippage optimization

**Base URL**: `https://api.jup.ag/ultra/v1`

## API Key

Required for all endpoints. Generate free at [portal.jup.ag](https://portal.jup.ag).

```typescript
const headers = {
  'x-api-key': 'your-api-key',
  'Content-Type': 'application/json',
};
```

## Core Endpoints

### 1. GET /order - Get Swap Quote & Transaction

Request a quote and unsigned transaction for signing.

```typescript
const orderResponse = await fetch(
  'https://api.jup.ag/ultra/v1/order' +
  '?inputMint=So11111111111111111111111111111111111111112' +
  '&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' +
  '&amount=100000000' +
  '&taker=USER_WALLET_ADDRESS',
  { headers: { 'x-api-key': 'your-api-key' } }
).then(r => r.json());
```

**Query Parameters**:

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `inputMint` | ✅ | string | Input token mint address |
| `outputMint` | ✅ | string | Output token mint address |
| `amount` | ✅ | string | Amount in native units (before decimals) |
| `taker` | ❌ | string | User's wallet address (required for transaction) |
| `receiver` | ❌ | string | Account to receive output tokens (defaults to taker). Expects account address, NOT token account. |
| `payer` | ❌ | string | Account to pay gas on behalf of user. Requires `closeAuthority`. |
| `closeAuthority` | ❌ | string | Close authority for ATAs created during swap. Required with `payer`. |
| `referralAccount` | ❌ | string | Referral account for integrator fees |
| `referralFee` | ❌ | number | Fee in bps (50-255 range) |
| `excludeRouters` | ❌ | string | Comma-separated: `iris`, `jupiterz`, `dflow`, `okx` |
| `excludeDexes` | ❌ | string | Comma-separated DEX names: `Raydium,Orca+V2,Meteora+DLMM` (only applies to Iris router) |

**Response** (200 OK):

```typescript
interface OrderResponse {
  // Core quote info
  mode: string;                      // "ultra"
  inputMint: string;                 // Input token mint address
  outputMint: string;                // Output token mint address
  inAmount: string;                  // Input amount in native units
  outAmount: string;                 // Output amount in native units
  otherAmountThreshold: string;      // Minimum output after slippage
  swapMode: string;                  // "ExactIn" or "ExactOut"
  slippageBps: number;               // Slippage in basis points
  priceImpactPct: string;            // DEPRECATED - use priceImpact instead
  priceImpact?: number;              // Price impact as decimal (0.01 = 1%)
  
  // Route information
  routePlan: RoutePlan[];            // Array of route steps
  
  // Fee information
  feeBps: number;                    // Total fee in bps (Ultra default OR integrator fee)
  platformFee: PlatformFee;          // Platform fee details
  feeMint?: string;                  // Mint address for fee collection
  
  // Gas/Transaction fees
  signatureFeeLamports: number;      // Base network fee in lamports
  signatureFeePayer: string | null;  // Who pays: taker, maker (MM), or payer
  prioritizationFeeLamports: number; // Priority fee + Jito tips in lamports
  prioritizationFeePayer: string | null;
  rentFeeLamports: number;           // ATA rent estimate in lamports
  rentFeePayer: string | null;       // Who pays rent (JupiterZ MM does NOT cover rent)
  
  // Router info
  swapType: string;                  // DEPRECATED - use router instead
  router: "iris" | "jupiterz" | "dflow" | "okx";
  
  // Transaction
  transaction: string | null;        // Base64 unsigned transaction (null if taker not provided)
  gasless: boolean;                  // Whether swap is gasless
  requestId: string;                 // REQUIRED for /execute
  
  // Metadata
  totalTime: number;                 // API response time in ms
  taker: string | null;              // Taker wallet address
  inUsdValue?: number;               // Input USD value
  outUsdValue?: number;              // Output USD value
  swapUsdValue?: number;             // Swap USD value
  
  // Optional fields (RFQ-specific)
  referralAccount?: string;          // Referral account if provided
  quoteId?: string;                  // Quote ID (RFQ)
  maker?: string;                    // Market maker address (RFQ)
  expireAt?: string;                 // Quote expiration (RFQ)
  
  // Error fields (present when transaction is empty string)
  errorCode?: 1 | 2 | 3;             // Error code if transaction failed
  errorMessage?: string;             // Human-readable error
}

interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;                   // Percentage of swap (0-100)
  bps: number;                       // Basis points (0-10000)
  usdValue?: number;                 // USD value of this leg
}

interface SwapInfo {
  ammKey: string;                    // AMM/pool address
  label: string;                     // DEX name (e.g., "Raydium", "MeteoraDLMM")
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

interface PlatformFee {
  feeBps: number;                    // Platform fee in bps
  amount?: string;                   // Fee amount in native units
}
```

**Error Codes** (in response body when transaction is empty):

| errorCode | errorMessage | Description |
|-----------|--------------|-------------|
| 1 | "Insufficient funds" | User doesn't have enough tokens |
| 2 | "Top up `${solAmount}` SOL for gas" | Need SOL for transaction fees |
| 3 | "Minimum `${swapAmount}` for gasless" | Swap too small for gasless (~$10 min) |

**HTTP Error Response** (400/500):

```typescript
interface OrderErrorResponse {
  error: string;  // e.g., "Failed to get quotes"
}
```

### 2. POST /execute - Execute Signed Transaction

Submit signed transaction for execution via Jupiter's transaction engine.

```typescript
const executeResponse = await fetch('https://api.jup.ag/ultra/v1/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key',
  },
  body: JSON.stringify({
    signedTransaction: signedTransactionBase64,
    requestId: orderResponse.requestId,
  }),
}).then(r => r.json());
```

**Request Body**:

```typescript
interface ExecuteRequest {
  signedTransaction: string;  // Base64 serialized signed transaction
  requestId: string;          // From /order response (REQUIRED)
}
```

**Response** (200 OK):

```typescript
interface ExecuteResponse {
  status: "Success" | "Failed";      // Execution status
  code: number;                      // Status code (0 = success)
  signature?: string;                // Transaction signature
  slot?: string;                     // Slot number
  error?: string;                    // Error message if failed
  totalInputAmount?: string;         // Total input (may differ from quote)
  totalOutputAmount?: string;        // Total output (may differ from quote)
  inputAmountResult?: string;        // Actual input amount
  outputAmountResult?: string;       // Actual output amount
  swapEvents?: SwapEvent[];          // Individual swap events
}

interface SwapEvent {
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
}
```

**Execute Error Codes**:

| Code | Category | Description |
|------|----------|-------------|
| 0 | Success | Transaction succeeded |
| -1 | Ultra | Missing cached order (requestId not found/expired) |
| -2 | Ultra | Invalid signed transaction |
| -3 | Ultra | Invalid message bytes |
| -4 | Ultra | Missing request id |
| -5 | Ultra | Missing signed transaction |
| -1000 | Aggregator | Failed to land transaction |
| -1001 | Aggregator | Unknown error |
| -1002 | Aggregator | Invalid transaction |
| -1003 | Aggregator | Transaction not fully signed |
| -1004 | Aggregator | Invalid block height |
| -1005 | Aggregator | Transaction expired |
| -1006 | Aggregator | Timed out |
| -1007 | Aggregator | Gasless unsupported wallet |
| -2000 | RFQ | Failed to land |
| -2001 | RFQ | Unknown error |
| -2002 | RFQ | Invalid payload |
| -2003 | RFQ | Quote expired |
| -2004 | RFQ | Swap rejected |
| -2005 | RFQ | Internal error |
| 6001 | Program | Slippage tolerance exceeded |

### 3. GET /holdings/{address} - Get Token Balances

Get all token balances for a wallet (RPC-less).

```typescript
const holdings = await fetch(
  `https://api.jup.ag/ultra/v1/holdings/${walletAddress}`,
  { headers: { 'x-api-key': 'your-api-key' } }
).then(r => r.json());
```

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `address` | string | Wallet address |

**Response** (200 OK):

```typescript
interface HoldingsResponse {
  amount: string;                    // SOL balance in lamports
  uiAmount: number;                  // SOL balance with decimals applied
  uiAmountString: string;            // SOL balance as string
  tokens: {
    [mintAddress: string]: TokenHolding[];  // Token holdings by mint
  };
}

interface TokenHolding {
  account: string;                   // Token account address
  amount: string;                    // Raw amount (before decimals)
  uiAmount: number;                  // Amount with decimals applied
  uiAmountString: string;            // Amount as string
  isFrozen: boolean;                 // Whether account is frozen
  isAssociatedTokenAccount: boolean; // Is ATA
  decimals: number;                  // Token decimals
  programId: string;                 // Token program (SPL or Token-2022)
}
```

**Error Response**:

```typescript
interface HoldingsErrorResponse {
  error: string;  // e.g., "Invalid address"
}
```

### 4. GET /shield - Token Security Info

Get warnings and security info for tokens.

```typescript
const shield = await fetch(
  'https://api.jup.ag/ultra/v1/shield?mints=TOKEN_MINT_1,TOKEN_MINT_2',
  { headers: { 'x-api-key': 'your-api-key' } }
).then(r => r.json());
```

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `mints` | string | Comma-separated mint addresses |

**Response** (200 OK):

```typescript
interface ShieldResponse {
  warnings: {
    [mintAddress: string]: Warning[];
  };
}

interface Warning {
  type: WarningType;
  message: string;                   // Human-readable description
  severity: "info" | "warning" | "critical";
  source?: "RugCheck";               // External data source
}

type WarningType =
  | "NOT_VERIFIED"
  | "LOW_LIQUIDITY"
  | "NOT_SELLABLE"
  | "LOW_ORGANIC_ACTIVITY"
  | "HAS_MINT_AUTHORITY"
  | "HAS_FREEZE_AUTHORITY"
  | "HAS_PERMANENT_DELEGATE"
  | "NEW_LISTING"
  | "VERY_LOW_TRADING_ACTIVITY"
  | "HIGH_SUPPLY_CONCENTRATION"
  | "NON_TRANSFERABLE"
  | "MUTABLE_TRANSFER_FEES"
  | "SUSPICIOUS_DEV_ACTIVITY"
  | "SUSPICIOUS_TOP_HOLDER_ACTIVITY"
  | "HIGH_SINGLE_OWNERSHIP"
  | string;  // Can include dynamic types like "5%_TRANSFER_FEES"
```

### 5. GET /search - Search Tokens

Search tokens by symbol, name, or mint address.

```typescript
const tokens = await fetch(
  'https://api.jup.ag/ultra/v1/search?query=USDC',
  { headers: { 'x-api-key': 'your-api-key' } }
).then(r => r.json());
```

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Symbol, name, or mint address. Comma-separate for multiple. Max 100 mints. |

**Response** (200 OK) - Array:

```typescript
type SearchResponse = TokenSearchResult[];

interface TokenSearchResult {
  id: string;                        // Mint address
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  tokenProgram: string;              // Token program address
  
  // Social links
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  
  // Token info
  dev?: string | null;               // Developer address
  circSupply?: number | null;
  totalSupply?: number | null;
  holderCount?: number | null;
  
  // Market data
  fdv?: number | null;               // Fully diluted valuation
  mcap?: number | null;              // Market cap
  usdPrice?: number | null;
  priceBlockId?: number | null;
  liquidity?: number | null;
  
  // Time-based stats
  stats5m?: TokenStats;
  stats1h?: TokenStats;
  stats6h?: TokenStats;
  stats24h?: TokenStats;
  
  // Launch info
  launchpad?: string | null;
  partnerConfig?: string | null;
  graduatedPool?: string | null;
  graduatedAt?: string | null;
  firstPool?: FirstPool;
  
  // Security
  audit?: TokenAudit;
  organicScore: number;
  organicScoreLabel: "high" | "medium" | "low";
  isVerified?: boolean | null;
  
  // Metadata
  cexes?: string[] | null;           // Listed exchanges
  tags?: string[] | null;
  updatedAt?: string;                // ISO timestamp
}

interface TokenStats {
  priceChange?: number | null;
  holderChange?: number | null;
  liquidityChange?: number | null;
  volumeChange?: number | null;
  buyVolume?: number | null;
  sellVolume?: number | null;
  buyOrganicVolume?: number | null;
  sellOrganicVolume?: number | null;
  numBuys?: number | null;
  numSells?: number | null;
  numTraders?: number | null;
  numOrganicBuyers?: number | null;
  numNetBuyers?: number | null;
}

interface TokenAudit {
  isSus?: boolean | null;
  mintAuthorityDisabled?: boolean | null;
  freezeAuthorityDisabled?: boolean | null;
  topHoldersPercentage?: number | null;
  devBalancePercentage?: number | null;
  devMigrations?: number | null;
}

interface FirstPool {
  id: string;
  createdAt: string;
}
```

### 6. GET /order/routers - Available Routers

```typescript
const routers = await fetch(
  'https://api.jup.ag/ultra/v1/order/routers',
  { headers: { 'x-api-key': 'your-api-key' } }
).then(r => r.json());
```

**Response** (200 OK) - Array:

```typescript
type RoutersResponse = RouterInfo[];

interface RouterInfo {
  id: string;
  name: "Iris" | "JupiterZ" | "DFlow" | "OKX DEX Router";
  icon: string;
}
```

## Fees

### Default Fees

| Token Type | Fee (bps) |
|------------|-----------|
| Jupiter-related (SOL/Stable → JUP/JLP/jupSOL) | 0 |
| Pegged Assets (LST-LST, Stable-Stable) | 0 |
| SOL-Stable | 2 |
| LST-Stable | 5 |
| Everything else | 10 |
| New Tokens (< 24 hours) | 50 |

### Integrator Fees

- Configure 50-255 bps via `referralFee` parameter
- Jupiter takes 20% of integrator fees
- Requires referral account setup via `@jup-ag/referral-sdk`

```typescript
import { ReferralProvider } from '@jup-ag/referral-sdk';

const provider = new ReferralProvider(connection);
const projectPubKey = 'DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc'; // Ultra Referral Project

// 1. Create referral account (once)
const { tx, referralAccountPubKey } = await provider.initializeReferralAccountWithName({
  payerPubKey: wallet.publicKey,
  partnerPubKey: wallet.publicKey,
  projectPubKey,
  name: 'my-app',
});

// 2. Create token account for each fee mint (SOL, USDC, etc.)
await provider.initializeReferralTokenAccountV2({
  payerPubKey: wallet.publicKey,
  referralAccountPubKey,
  mint: SOL_MINT,
});

// 3. Use in /order
const order = await fetch(
  `https://api.jup.ag/ultra/v1/order?...&referralAccount=${referralAccountPubKey}&referralFee=100`
);

// 4. Claim fees
const transactions = await provider.claimAllV2({
  payerPubKey: wallet.publicKey,
  referralAccountPubKey,
});
```

## Gasless Support

### Overview

| Mechanism | Coverage | Requirements |
|-----------|----------|--------------|
| Ultra Gasless | Base fee, priority, ATA rent, other rent | Taker < 0.01 SOL, min ~$10 swap |
| JupiterZ (RFQ) | Base fee, priority | MM provides quote, **NO ATA rent** |
| Integrator Payer | Everything | Use `payer` + `referralAccount` params |

### Integrator Payer

Pay gas for your users with the `payer` parameter:

```typescript
const order = await fetch(
  'https://api.jup.ag/ultra/v1/order' +
  '?inputMint=...' +
  '&outputMint=...' +
  '&amount=...' +
  '&taker=USER_WALLET' +
  '&payer=YOUR_PAYER_WALLET' +
  '&closeAuthority=USER_WALLET' +  // or your wallet
  '&referralAccount=YOUR_REFERRAL_ACCOUNT' +
  '&referralFee=100'
);

// Transaction requires BOTH user AND payer signatures
```

## Rate Limits

Dynamic rate limiting based on swap volume:

| Swap Volume (24h) | Requests / 10 seconds |
|-------------------|----------------------|
| $0 | 50 |
| $10,000 | 51 |
| $100,000 | 61 |
| $1,000,000 | 165 |

Handle `429` responses with exponential backoff.

## Backend Integration Pattern (Soljar API)

Our backend at `apps/api` provides these routes:

| Route | Method | Description |
|-------|--------|-------------|
| `/swap/order` | GET | Get quote and unsigned transaction |
| `/swap/execute` | POST | Execute signed transaction |
| `/swap/holdings/:address` | GET | Get wallet token balances |
| `/swap/shield` | GET | Get token security warnings |
| `/swap/search` | GET | Search tokens |
| `/swap/routers` | GET | Get available routers |

### Flow: Backend creates order, mobile signs, backend executes

```typescript
// 1. Mobile requests quote from backend
const { transaction, requestId, quote, gasInfo } = await api.get('/swap/order', {
  inputMint: SOL_MINT,
  outputMint: USDC_MINT,
  amount: '100000000',
  taker: userWallet.publicKey,
});

// 2. Mobile signs transaction
import { VersionedTransaction } from '@solana/web3.js';
const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
tx.sign([userWallet]);
const signedTransaction = Buffer.from(tx.serialize()).toString('base64');

// 3. Mobile sends to backend for execution
const result = await api.post('/swap/execute', { signedTransaction, requestId });

if (result.status === 'Success') {
  console.log('Swap successful:', result.signature);
} else {
  console.error('Swap failed:', result.error);
}
```

## Latency Reference

| Endpoint | P50 Average |
|----------|-------------|
| /order | 300ms |
| /execute (Iris) | 700ms |
| /execute (JupiterZ) | 2s |
| /holdings | 70ms |
| /shield | 150ms |
| /search | 15ms |

## TypeScript Types

The client uses SST Resource for the API key (configured in `infra/secrets.ts`):

```typescript
// infra/secrets.ts
export const jupiterApiKey = new sst.Secret("JupiterApiKey");

// infra/api.ts - linked to API worker
link: [databaseUrl, heliusRpcUrl, jupiterApiKey],

// apps/api/src/lib/jupiter-ultra.ts - accessed via Resource
import { Resource } from "sst";
const client = new JupiterUltraClient(Resource.JupiterApiKey.value);
```

All types are exported from `apps/api/src/lib/jupiter-ultra.ts`:

```typescript
export {
  JupiterUltraClient,
  getJupiterClient,
  JUPITER_ULTRA_BASE_URL,
  // Types
  type OrderParams,
  type OrderResponse,
  type ExecuteRequest,
  type ExecuteResponse,
  type HoldingsResponse,
  type TokenHolding,
  type ShieldResponse,
  type Warning,
  type SearchResponse,
  type TokenSearchResult,
  type TokenStats,
  type TokenAudit,
  type RoutersResponse,
  type RouterInfo,
  type RoutePlan,
  type SwapInfo,
  type PlatformFee,
  type SwapEvent,
} from './lib/jupiter-ultra';
```

## Resources

- [Developer Docs](https://dev.jup.ag/docs/ultra)
- [API Reference](https://dev.jup.ag/api-reference/ultra)
- [TypeScript Examples](https://github.com/Jupiter-DevRel/typescript-examples/tree/main/ultra)
- [Portal (API Keys)](https://portal.jup.ag)
- [Discord Support](https://discord.gg/jup)
