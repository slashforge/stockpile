// Snapshot of exact Solana mints and token artwork from the xStocks issuer's public
// asset directory: https://api.xstocks.fi/api/v2/public/assets (re-verified 2026-09-25
// against the paginated directory and Jupiter Tokens V2: same ids, 8 decimals, Token-2022).
// Every symbol also passed the on-chain liquidity gate in apps/api/scripts/probe-xstocks.ts on that date
// (10 USDC quote routes, <= 2.5% impact, TVL >= $500, implied price within 10% of Jupiter usdPrice).
// AMDx, AVGOx, NFLXx and TSMx are borderline (~2-2.3% impact); TSMx is allowlisted but not in an editorial bag.
// Used for icon lookup only; trading still requires the operator allowlist (STOCKPILE_ALLOWED_MINTS).
const mints: Record<string, string> = {
  AAPLx: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  MSFTx: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
  NVDAx: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  AMDx: "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF",
  GOOGLx: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
  AMZNx: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
  TSLAx: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  NFLXx: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL",
  AVGOx: "XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo",
  TSMx: "XsafvsGtzFqqHgTnA3aPC83EAMkacU5mcGtcSayhpVV",
  METAx: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
  "BRK.Bx": "Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x",
  WMTx: "Xs151QeqTCiuKtinzfRATnUESM2xTU6V9Wy8Vy538ci",
  MUx: "XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav",
  INTCx: "XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM",
  ORCLx: "XsjFwUPiLofddX5cWFHW35GCbXcSu1BCUGfxoQAQjeL",
  PLTRx: "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4",
  COINx: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu",
  HOODx: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg",
  MSTRx: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",
  CRCLx: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",
  BACx: "XswsQk4duEQmCbGzfqUUWYmi7pV7xpJ9eEmLHXCaEQP",
  MCDx: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",
  KOx: "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ",
  PEPx: "Xsv99frTRUeornyvCfvhnDesQDWuvns1M852Pez91vF",
  PGx: "XsYdjDjNUygZ7yGKfQaB6TxLh2gC6RRjzLtLAGJrhzV",
  LLYx: "Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH",
  UNHx: "XszvaiXGPwvk2nwb3o9C1CX4K6zH8sez11E6uyup6fe",
  SPYx: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  QQQx: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
  GLDx: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
};
const decimals = 8;

export function issuerAsset(symbol: string) {
  const mint = mints[symbol];
  return mint ? { mint, decimals, logoUrl: `https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png` } : null;
}
