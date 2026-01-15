# Helius getTransactionsForAddress

> **Helius Exclusive** - This RPC method is only available through Helius and requires a Developer plan or higher (100 credits/request).

## Overview

`getTransactionsForAddress` provides transaction history queries with advanced filtering, sorting, and pagination.

## Key Features

- **Flexible sorting**: `asc` (oldest first) or `desc` (newest first)
- **Advanced filtering**: Time ranges, slots, signatures, transaction status
- **Full transaction data**: Complete transaction details in one call
- **Simple pagination**: `slot:position` tokens

## Network Support

| Network | Supported | Retention |
|---------|-----------|-----------|
| Mainnet | ✅ | Unlimited |
| Devnet | ✅ | 2 weeks |
| Testnet | ❌ | N/A |

## Request

```typescript
const response = await fetch(HELIUS_RPC_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getTransactionsForAddress',
    params: [
      'WALLET_ADDRESS',
      {
        transactionDetails: 'full',
        sortOrder: 'desc',
        limit: 100,
        maxSupportedTransactionVersion: 0,
        encoding: 'jsonParsed',
        filters: {
          status: 'succeeded'
        }
      }
    ]
  })
});
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address` | string | **required** | Base-58 wallet/program address |
| `transactionDetails` | string | `"signatures"` | `"signatures"` (faster, up to 1000) or `"full"` (complete data, max 100) |
| `sortOrder` | string | `"desc"` | `"desc"` (newest first) or `"asc"` (oldest first) |
| `limit` | number | 1000 | Max results (1000 for signatures, 100 for full) |
| `paginationToken` | string | - | Token from previous response (`"slot:position"`) |
| `commitment` | string | `"finalized"` | `finalized`, `confirmed`, or `processed` |
| `encoding` | string | - | `json`, `jsonParsed`, `base64`, `base58` (only with full) |
| `maxSupportedTransactionVersion` | number | - | Set to `0` to include versioned transactions |
| `filters` | object | - | Advanced filtering options |

## Filters

### `filters.status`
- `"succeeded"` - Only successful transactions
- `"failed"` - Only failed transactions  
- `"any"` - Both (default)

### `filters.blockTime`
Unix timestamp filtering with operators:
```json
{
  "blockTime": {
    "gte": 1735689600,
    "lte": 1738368000
  }
}
```

### `filters.slot`
Slot number filtering:
```json
{
  "slot": {
    "gte": 1000,
    "lte": 2000
  }
}
```

### Filter Operators
| Operator | Description |
|----------|-------------|
| `gte` | Greater than or equal |
| `gt` | Greater than |
| `lte` | Less than or equal |
| `lt` | Less than |
| `eq` | Equal (blockTime only) |

## Response

### Signatures Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "data": [
      {
        "signature": "5h6xBEauJ3PK...",
        "slot": 1054,
        "err": null,
        "memo": null,
        "blockTime": 1641038400,
        "confirmationStatus": "finalized"
      }
    ],
    "paginationToken": "1055:5"
  }
}
```

### Full Transaction Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "data": [
      {
        "slot": 1054,
        "transaction": {
          "signatures": ["5h6xBEauJ3PK..."],
          "message": {
            "accountKeys": ["...", "..."],
            "instructions": [...]
          }
        },
        "meta": {
          "fee": 5000,
          "preBalances": [1000000, 2000000],
          "postBalances": [999995000, 2000000],
          "preTokenBalances": [...],
          "postTokenBalances": [...]
        }
      }
    ],
    "paginationToken": "1055:5"
  }
}
```

## Pagination

```typescript
let paginationToken = null;
let allTransactions = [];

do {
  const result = await getTransactions(address, paginationToken);
  allTransactions.push(...result.data);
  paginationToken = result.paginationToken;
} while (paginationToken);
```

## vs getSignaturesForAddress

| Feature | getSignaturesForAddress | getTransactionsForAddress |
|---------|------------------------|---------------------------|
| Full tx in one call | ❌ (needs getTransaction) | ✅ |
| Chronological sort | ❌ | ✅ (`asc`) |
| Time-based filter | ❌ | ✅ |
| Status filter | ❌ | ✅ |
| Pagination | `before`/`until` sigs | Simple token |

## Usage in Soljar

Environment variable: `HeliusRpcUrl` (SST Secret)

```typescript
const HELIUS_RPC_URL = Resource.HeliusRpcUrl.value;
```
