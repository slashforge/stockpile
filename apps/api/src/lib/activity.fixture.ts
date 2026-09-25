// Real `getTransactionsForAddress` payloads (Helius RPC, transactionDetails "full", encoding "jsonParsed"; mainnet 2026-09-25) for the
// test wallet: two Jupiter bag buys (USDC -> KALSHI, USDC -> POLYMARKET; Prediction Markets bag) whose first instruction creates the
// wallet's Token-2022 ATA, a 0.02 SOL deposit, and a 10 USDC deposit where the sender created and paid for the wallet's USDC ATA.
// Trimmed to the fields the parser reads (logMessages, innerInstructions, rewards and instruction data dropped); values are unchanged.
// PreStocks mints carry a 1% Token-2022 transfer fee, so the received amount is below what the pool sent.
export const TEST_WALLET = "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj";
export const KALSHI_MINT = "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua";
export const POLYMARKET_MINT = "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP";
export const kalshiBuy = {
  "slot": 450291856,
  "blockTime": 1790323057,
  "transaction": {
    "signatures": [
      "3T6xn9BCgarqZxqQv7EbKDj2AFnAVCCxQJH3HksKu54Szfrm9y4haaEax2LPBMeodTZiN3zz39wB67QVYXei7hyR"
    ],
    "message": {
      "accountKeys": [
        {
          "pubkey": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
          "writable": true,
          "signer": true,
          "source": "transaction"
        },
        {
          "pubkey": "9a7H9WYPx8EbwpBsNrhEYWf6nsTUPqu7TTu96VMvL8nQ",
          "writable": true,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "A5JpFiMv1ZuKJA93rdY6Z8WAVr6YAxz2NJViQ2HvdZjA",
          "writable": true,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "11111111111111111111111111111111",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "ComputeBudget111111111111111111111111111111",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "4G9UXiyaoUg2KV7RH7EQ3fK8FDmmBxBduJNZWdk8ZRgn",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "5RgVpvuyywAH77iZ9khFTFUuMSMwdczD26gjGwFpYJGA",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "D1dLLKHD1eViULePJcCd1bYSeyLW5SbA9cxgMp94ANVc",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "F2UWQXcpm3yqXW5NW4snK94YQs6kxS7depXL7zmDfNY6",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "J159YpjWfoDk93oCVGfecJ1GxrWzoQNpz5NE6pBRD7PW",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        }
      ],
      "instructions": [
        {
          "programId": "ComputeBudget111111111111111111111111111111"
        },
        {
          "program": "spl-associated-token-account",
          "programId": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "parsed": {
            "type": "createIdempotent"
          }
        },
        {
          "programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
        }
      ]
    }
  },
  "meta": {
    "err": null,
    "fee": 5000,
    "preBalances": [
      20000000,
      0,
      1488440,
      1,
      1,
      6948115527,
      3388612899,
      6711053,
      1600200,
      4795040,
      1488440,
      20645120,
      1600200,
      2545443,
      7168800,
      200653906,
      70128638,
      534788257985
    ],
    "postBalances": [
      18374480,
      1620520,
      1488440,
      1,
      1,
      6948115527,
      3388612899,
      6711053,
      1600200,
      4795040,
      1488440,
      20645120,
      1600200,
      2545443,
      7168800,
      200653906,
      70128638,
      534788257985
    ],
    "preTokenBalances": [
      {
        "accountIndex": 2,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 10,
          "decimals": 6,
          "amount": "10000000",
          "uiAmountString": "10"
        },
        "owner": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      },
      {
        "accountIndex": 8,
        "mint": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
        "uiTokenAmount": {
          "uiAmount": 7.668030532,
          "decimals": 9,
          "amount": "7668030532",
          "uiAmountString": "7.668030532"
        },
        "owner": "4G9UXiyaoUg2KV7RH7EQ3fK8FDmmBxBduJNZWdk8ZRgn",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      },
      {
        "accountIndex": 10,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 3125.016083,
          "decimals": 6,
          "amount": "3125016083",
          "uiAmountString": "3125.016083"
        },
        "owner": "D1dLLKHD1eViULePJcCd1bYSeyLW5SbA9cxgMp94ANVc",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      },
      {
        "accountIndex": 12,
        "mint": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
        "uiTokenAmount": {
          "uiAmount": 0.629316967,
          "decimals": 9,
          "amount": "629316967",
          "uiAmountString": "0.629316967"
        },
        "owner": "J159YpjWfoDk93oCVGfecJ1GxrWzoQNpz5NE6pBRD7PW",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      }
    ],
    "postTokenBalances": [
      {
        "accountIndex": 1,
        "mint": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
        "uiTokenAmount": {
          "uiAmount": 0.002823375,
          "decimals": 9,
          "amount": "2823375",
          "uiAmountString": "0.002823375"
        },
        "owner": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      },
      {
        "accountIndex": 2,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 7.5,
          "decimals": 6,
          "amount": "7500000",
          "uiAmountString": "7.5"
        },
        "owner": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      },
      {
        "accountIndex": 8,
        "mint": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
        "uiTokenAmount": {
          "uiAmount": 7.665178638,
          "decimals": 9,
          "amount": "7665178638",
          "uiAmountString": "7.665178638"
        },
        "owner": "4G9UXiyaoUg2KV7RH7EQ3fK8FDmmBxBduJNZWdk8ZRgn",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      },
      {
        "accountIndex": 10,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 3127.516083,
          "decimals": 6,
          "amount": "3127516083",
          "uiAmountString": "3127.516083"
        },
        "owner": "D1dLLKHD1eViULePJcCd1bYSeyLW5SbA9cxgMp94ANVc",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      },
      {
        "accountIndex": 12,
        "mint": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
        "uiTokenAmount": {
          "uiAmount": 0.629316967,
          "decimals": 9,
          "amount": "629316967",
          "uiAmountString": "0.629316967"
        },
        "owner": "J159YpjWfoDk93oCVGfecJ1GxrWzoQNpz5NE6pBRD7PW",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      }
    ]
  }
};
export const polymarketBuy = {
  "slot": 450292795,
  "blockTime": 1790323307,
  "transaction": {
    "signatures": [
      "2C43SeHB1vt91P7VcFAVMZ9Vna7tVQNH3YNQmRvomkSs5RyU61heYUcuE3i26SQG192bXXZhN4C2YSaLZGfLidDc"
    ],
    "message": {
      "accountKeys": [
        {
          "pubkey": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
          "writable": true,
          "signer": true,
          "source": "transaction"
        },
        {
          "pubkey": "A5JpFiMv1ZuKJA93rdY6Z8WAVr6YAxz2NJViQ2HvdZjA",
          "writable": true,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "BMrtCYTjFRHWjgQxaUbeQCAiqTEfB2pwWKYHy47oFom4",
          "writable": true,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "11111111111111111111111111111111",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "ComputeBudget111111111111111111111111111111",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "3egCRGPEEbqtVhQmThvhvwMNtamo9K6BE8Q71AeyNKjr",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "7UhQz53m11QE73rYsCQgq1xcstnFmaPBR9D9q3w31X1V",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "DQw3XYYuFYfmJvhTQcfCQs6fesiGEasLij5pBQfYTrXV",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "F7278Yo2tkoK13jJHZsTdZ1SEUr22JYq25VRSwyf6D4X",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "GMvN65wvdE4UKK87sq62ffYDKJCQq5tySdcJhxGRcPfm",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "HsYrpFF6YPxquqJHJNMTMZjBN6ncwsPKuq9dJrdJZdrp",
          "writable": true,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        },
        {
          "pubkey": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "writable": false,
          "signer": false,
          "source": "lookupTable"
        }
      ],
      "instructions": [
        {
          "programId": "ComputeBudget111111111111111111111111111111"
        },
        {
          "programId": "ComputeBudget111111111111111111111111111111"
        },
        {
          "program": "spl-associated-token-account",
          "programId": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "parsed": {
            "type": "createIdempotent"
          }
        },
        {
          "programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
        }
      ]
    }
  },
  "meta": {
    "err": null,
    "fee": 5933,
    "preBalances": [
      18374480,
      1488440,
      0,
      1,
      1,
      6948115527,
      3388612899,
      6711053,
      71027466,
      17068800,
      1600200,
      52141120,
      5242560,
      1488440,
      52141120,
      523015135,
      7252320,
      200653906,
      70128638,
      5987435,
      534788257985
    ],
    "postBalances": [
      16748027,
      1488440,
      1620520,
      1,
      1,
      6948115527,
      3388612899,
      6711053,
      71027466,
      17068800,
      1600200,
      52141120,
      5242560,
      1488440,
      52141120,
      523015135,
      7252320,
      200653906,
      70128638,
      5987435,
      534788257985
    ],
    "preTokenBalances": [
      {
        "accountIndex": 1,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 7.5,
          "decimals": 6,
          "amount": "7500000",
          "uiAmountString": "7.5"
        },
        "owner": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      },
      {
        "accountIndex": 10,
        "mint": "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
        "uiTokenAmount": {
          "uiAmount": 6.643936866,
          "decimals": 9,
          "amount": "6643936866",
          "uiAmountString": "6.643936866"
        },
        "owner": "F7278Yo2tkoK13jJHZsTdZ1SEUr22JYq25VRSwyf6D4X",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      },
      {
        "accountIndex": 13,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 391.656716,
          "decimals": 6,
          "amount": "391656716",
          "uiAmountString": "391.656716"
        },
        "owner": "F7278Yo2tkoK13jJHZsTdZ1SEUr22JYq25VRSwyf6D4X",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      }
    ],
    "postTokenBalances": [
      {
        "accountIndex": 1,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 5,
          "decimals": 6,
          "amount": "5000000",
          "uiAmountString": "5"
        },
        "owner": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      },
      {
        "accountIndex": 2,
        "mint": "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
        "uiTokenAmount": {
          "uiAmount": 0.016548356,
          "decimals": 9,
          "amount": "16548356",
          "uiAmountString": "0.016548356"
        },
        "owner": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      },
      {
        "accountIndex": 10,
        "mint": "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
        "uiTokenAmount": {
          "uiAmount": 6.627221354,
          "decimals": 9,
          "amount": "6627221354",
          "uiAmountString": "6.627221354"
        },
        "owner": "F7278Yo2tkoK13jJHZsTdZ1SEUr22JYq25VRSwyf6D4X",
        "programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      },
      {
        "accountIndex": 13,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 394.156716,
          "decimals": 6,
          "amount": "394156716",
          "uiAmountString": "394.156716"
        },
        "owner": "F7278Yo2tkoK13jJHZsTdZ1SEUr22JYq25VRSwyf6D4X",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      }
    ]
  }
};
export const solDeposit = {
  "slot": 450282382,
  "blockTime": 1790320536,
  "transaction": {
    "signatures": [
      "4nNHM3TGhixUzQ7kQLrvaSqdUkLYLtMTe7iZhEdVobS3AAchxyQKiKgSFfcyAz8AnjxrzbfQyuG26JxWv4Yv8Kwx",
      "mT6yJFzDF3c4bmaprkXcjsDCeYdnreDKDaQ5qrzued1xSJUWpYGZVk4LpgGerBYMe1EUrPgtCzSmMyvWB7LbpYi"
    ],
    "message": {
      "accountKeys": [
        {
          "pubkey": "BANKmL4KRhsgmL184UpxtH7WnTEWn6ckMKYyzpcjFYCN",
          "writable": true,
          "signer": true,
          "source": "transaction"
        },
        {
          "pubkey": "ACv7o1SgDmRaDeTu3bfyV8rMmnhMdBBQg1VRcq3UEek5",
          "writable": true,
          "signer": true,
          "source": "transaction"
        },
        {
          "pubkey": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
          "writable": true,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "11111111111111111111111111111111",
          "writable": false,
          "signer": false,
          "source": "transaction"
        }
      ],
      "instructions": [
        {
          "program": "system",
          "programId": "11111111111111111111111111111111",
          "parsed": {
            "type": "transfer"
          }
        }
      ]
    }
  },
  "meta": {
    "err": null,
    "fee": 10000,
    "preBalances": [
      61623553,
      8399302052,
      0,
      1
    ],
    "postBalances": [
      61613553,
      8379302052,
      20000000,
      1
    ],
    "preTokenBalances": [],
    "postTokenBalances": []
  }
};
export const usdcDeposit = {
  "slot": 450282300,
  "blockTime": 1790320514,
  "transaction": {
    "signatures": [
      "3Sb9uoQmx7zoCvzaLeKw3wKB7YwY4qf1kVzHbnXJowfj21j7GPGunuCc9pP5mfvA6jo4tsGrPqc2sV7BGdfjKthW",
      "3nRjo4DT14iSyF1f2KzxwmGZzSXCzSWg1NimueVVszpcG3iWobe5Kp2ZtCUq7fd9KZcYNwQ3NADgKVcqLkfenz8G"
    ],
    "message": {
      "accountKeys": [
        {
          "pubkey": "BANKmL4KRhsgmL184UpxtH7WnTEWn6ckMKYyzpcjFYCN",
          "writable": true,
          "signer": true,
          "source": "transaction"
        },
        {
          "pubkey": "ACv7o1SgDmRaDeTu3bfyV8rMmnhMdBBQg1VRcq3UEek5",
          "writable": false,
          "signer": true,
          "source": "transaction"
        },
        {
          "pubkey": "A5JpFiMv1ZuKJA93rdY6Z8WAVr6YAxz2NJViQ2HvdZjA",
          "writable": true,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "DPb27P4SNi8X3P41GKZ3P25mZPzNHhtB5SA3g8aSesx8",
          "writable": true,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "11111111111111111111111111111111",
          "writable": false,
          "signer": false,
          "source": "transaction"
        },
        {
          "pubkey": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          "writable": false,
          "signer": false,
          "source": "transaction"
        }
      ],
      "instructions": [
        {
          "program": "spl-associated-token-account",
          "programId": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "parsed": {
            "type": "createIdempotent"
          }
        },
        {
          "program": "spl-token",
          "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          "parsed": {
            "type": "transfer"
          }
        }
      ]
    }
  },
  "meta": {
    "err": null,
    "fee": 10000,
    "preBalances": [
      63121993,
      8399302052,
      0,
      2039280,
      3388612899,
      0,
      534788257985,
      1,
      200653906
    ],
    "postBalances": [
      61623553,
      8399302052,
      1488440,
      2039280,
      3388612899,
      0,
      534788257985,
      1,
      200653906
    ],
    "preTokenBalances": [
      {
        "accountIndex": 3,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 2328.723355,
          "decimals": 6,
          "amount": "2328723355",
          "uiAmountString": "2328.723355"
        },
        "owner": "ACv7o1SgDmRaDeTu3bfyV8rMmnhMdBBQg1VRcq3UEek5",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      }
    ],
    "postTokenBalances": [
      {
        "accountIndex": 2,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 10,
          "decimals": 6,
          "amount": "10000000",
          "uiAmountString": "10"
        },
        "owner": "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      },
      {
        "accountIndex": 3,
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "uiTokenAmount": {
          "uiAmount": 2318.723355,
          "decimals": 6,
          "amount": "2318723355",
          "uiAmountString": "2318.723355"
        },
        "owner": "ACv7o1SgDmRaDeTu3bfyV8rMmnhMdBBQg1VRcq3UEek5",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      }
    ]
  }
};
