---
title: 'Introducing Stockpile'
description: 'A swipeable feed of real stories, each linked to a source-backed bag of tokenized stocks and pre-IPO tokens you can buy in one flow on Solana.'
pubDate: 'Sep 25 2026'
---

Stockpile is a mobile app for iOS and Android built on Solana. You swipe through a vertical feed of real news,
podcast episodes, and STOCK Act disclosures. Every story is linked to a **bag**: a curated basket of tokenized
stocks (xStocks) and pre-IPO tokens (PreStocks), with the evidence behind each holding one tap away.

## What a bag is

A bag is a weighted list of tokens with a thesis, a curator, a disclosure paragraph, and a list of risks. Right now
there are eight:

- **Editorial xStocks bags** — Megacap Builders, AI Infrastructure, Consumer Frontiers. Hand-picked by Stockpile
  Editorial from the issuer's product directory. Tokens: AAPLx, MSFTx, NVDAx, AMDx, GOOGLx, AMZNx, TSLAx, NFLXx.
- **Editorial PreStocks bags** — Frontier AI Labs, Prediction Markets, Defense & Space. Pre-IPO exposure to OpenAI,
  Anthropic, Figure AI, Neuralink, Kalshi, Polymarket, SpaceX, and Anduril via PreStocks tokens.
- **Disclosure bags** — Pelosi Tracker and Congress Consensus, computed from periodic transaction reports filed under
  the STOCK Act. Every holding cites the filings that put it there.

Weights are editorial (or derived from disclosed amount ranges). They are not recommendations, and the page you are
reading never shows prices or performance.

## Live context, honest caveats

In the app each token shows its 24h change, on-chain liquidity, and the premium or discount versus the underlying
stock or issuer mark, sourced through Jupiter. If liquidity is thin, you will see it. If a bag cannot be traded
because a token has no verified mint, it is marked research-only.

## Buying a bag

Sign in with email, and a Privy embedded Solana wallet is created for you. Fund it with USDC, choose an amount, and
Stockpile splits it across the bag by weight and asks Jupiter for one swap per holding. Each transaction is inspected
on your device and signed by your wallet. Stockpile never holds your keys, never signs, and never submits.

## Disclosures

Stockpile is not investment advice. xStocks and PreStocks are issuer products with their own eligibility rules;
PreStocks are not available to U.S. persons. Holders do not own the underlying shares. Liquidity can be thin, prices
can diverge from exchange prices, and total loss is possible. Disclosure bags reflect public filings that lag trades
by 30–45 days and report ranges rather than amounts.
