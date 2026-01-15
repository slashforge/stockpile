# Jupiter Tokens V2 API

> **Status**: Beta  
> **Base URL**: `https://api.jup.ag/tokens/v2`  
> **Auth**: `x-api-key` header required (get from https://portal.jup.ag)

## Overview

The Jupiter Tokens V2 API provides comprehensive token information for Solana tokens including metadata, market data, trading statistics, and audit information.

## Endpoints

### 1. Search Tokens

Search for tokens by symbol, name, or mint address.

```
GET /search?query={query}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Symbol, name, or mint address. Comma-separate for multiple mint addresses (max 100) |

**Notes:**
- Default returns 20 mints when searching by symbol/name
- For exact mint lookups, comma-separate addresses (e.g., `So111...,JUPy...`)

**Example:**
```ts
const response = await fetch(
  'https://api.jup.ag/tokens/v2/search?query=So11111111111111111111111111111111111111112',
  { headers: { 'x-api-key': 'YOUR_API_KEY' } }
);
```

---

### 2. Get Tokens by Tag

Get all tokens belonging to a specific tag.

```
GET /tag?query={tag}
```

**Parameters:**
| Parameter | Type | Required | Options |
|-----------|------|----------|---------|
| `query` | enum | Yes | `lst`, `verified` |

**Notes:**
- Returns the entire array of mints for the tag
- `lst` = Liquid Staked Tokens
- `verified` = Jupiter verified tokens

---

### 3. Get Tokens by Category

Get top tokens in trading categories.

```
GET /{category}/{interval}?limit={limit}
```

**Parameters:**
| Parameter | Type | Required | Options |
|-----------|------|----------|---------|
| `category` | enum | Yes | `toporganicscore`, `toptraded`, `toptrending` |
| `interval` | enum | Yes | `5m`, `1h`, `6h`, `24h` |
| `limit` | integer | No | 1-100 (default: 50) |

**Notes:**
- Filters out generic top tokens (SOL, USDC, etc.)
- Useful for discovery features

**Example:**
```ts
const response = await fetch(
  'https://api.jup.ag/tokens/v2/toptrending/24h?limit=50',
  { headers: { 'x-api-key': 'YOUR_API_KEY' } }
);
```

---

### 4. Get Recent Tokens

Get tokens that recently had their first pool created.

```
GET /recent
```

**Notes:**
- "Recent" = first pool creation time (not token mint timestamp)
- Default returns 30 mints

---

### 5. Get Content for Multiple Mints (Pro Only)

Get curated content for multiple tokens.

```
GET /content?mints={mints}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mints` | string | Yes | Comma-separated mint addresses (max 50) |

**Example:**
```ts
const response = await fetch(
  'https://api.jup.ag/tokens/v2/content?mints=JUPy...,So11...',
  { headers: { 'x-api-key': 'YOUR_API_KEY' } }
);
```

---

### 6. Get Content for Trending Tokens (Pro Only)

Get content for currently trending tokens.

```
GET /content/cooking
```

---

### 7. Get Paginated Content Feed (Pro Only)

Get paginated content feed for a specific token.

```
GET /content/feed?mint={mint}&page={page}&limit={limit}
```

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `mint` | string | Yes | - | Token mint address |
| `page` | integer | No | 1 | Page number |
| `limit` | integer | No | 50 | Items per page (max 100) |

---

## Response Schema

All token endpoints return an array of token objects:

```ts
interface TokenInfo {
  // Identity
  id: string;                    // Mint address
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  
  // Social/Links
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  
  // Developer
  dev: string | null;            // Developer address
  
  // Supply
  circSupply: number | null;
  totalSupply: number | null;
  
  // Program
  tokenProgram: string;          // Token program address
  
  // Launch info
  launchpad: string | null;
  partnerConfig: string | null;
  graduatedPool: string | null;
  graduatedAt: string | null;
  
  // Market data
  holderCount: number | null;
  fdv: number | null;            // Fully diluted valuation
  mcap: number | null;           // Market cap
  usdPrice: number | null;
  priceBlockId: number | null;
  liquidity: number | null;
  
  // Trading stats (5m, 1h, 6h, 24h)
  stats5m: TokenStats;
  stats1h: TokenStats;
  stats6h: TokenStats;
  stats24h: TokenStats;
  
  // Pool info
  firstPool: {
    id: string;
    createdAt: string;
  };
  
  // Audit/Security
  audit: {
    isSus: boolean | null;
    mintAuthorityDisabled: boolean | null;
    freezeAuthorityDisabled: boolean | null;
    topHoldersPercentage: number | null;
    devBalancePercentage: number | null;
    devMigrations: number | null;
  };
  
  // Scores
  organicScore: number;
  organicScoreLabel: 'high' | 'medium' | 'low';
  
  // Verification
  isVerified: boolean | null;
  cexes: string[] | null;        // Centralized exchanges listing
  tags: string[] | null;
  
  updatedAt: string;             // ISO datetime
}

interface TokenStats {
  priceChange: number | null;
  holderChange: number | null;
  liquidityChange: number | null;
  volumeChange: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  buyOrganicVolume: number | null;
  sellOrganicVolume: number | null;
  numBuys: number | null;
  numSells: number | null;
  numTraders: number | null;
  numOrganicBuyers: number | null;
  numNetBuyers: number | null;
}
```

## Content Response Schema (Pro Only)

```ts
interface ContentResponse {
  data: Array<{
    mint: string;
    contents: Array<{
      contentId: string;
      content: string;
      contentType: 'text' | 'tweet';
      status: 'pending' | 'approved';
      source: string | null;
      submittedAt: string;
      submittedBy: {
        id: string | null;
        username: string | null;
        role: string | null;
      };
      updatedAt: string | null;
      updatedBy: {
        id: string | null;
        username: string | null;
        role: string | null;
      };
      postedAt: string | null;
    }>;
    tokenSummary: {
      summaryFull: string | null;
      summaryShort: string | null;
      updatedAt: string;
      citations: string[];
    };
    newsSummary: {
      summaryFull: string | null;
      summaryShort: string | null;
      updatedAt: string;
      citations: string[];
    };
  }>;
}
```

## Native SOL Token

The native SOL token uses a special "wrapped" mint address:

```
So11111111111111111111111111111111111111112
```

This is the standard Wrapped SOL mint that Jupiter and other DeFi protocols use.

## Usage Patterns

### Fetching Token Metadata for Wallet Balances

When you have a list of token mints from wallet balances, use the search endpoint with comma-separated mints:

```ts
const mints = ['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
const response = await fetch(
  `https://api.jup.ag/tokens/v2/search?query=${mints.join(',')}`,
  { headers: { 'x-api-key': 'YOUR_API_KEY' } }
);
const tokens = await response.json();
```

### Rate Limits

- Free tier: Limited requests
- Pro tier: Higher limits, access to Content API
- Check https://portal.jup.ag for current limits

## Error Responses

| Status | Description |
|--------|-------------|
| 400 | Bad request (invalid parameters) |
| 401 | Missing or invalid API key |
| 500 | Server error |

## Important Notes

1. **API Key Required**: All endpoints require `x-api-key` header
2. **Content API**: Only available on Pro tiers
3. **Response Changes**: Schema may change as API is in beta
4. **Deprecation**: `lite-api.jup.ag` deprecated Jan 31, 2026 - use `api.jup.ag`
