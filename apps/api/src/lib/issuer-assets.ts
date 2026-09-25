// Snapshot of exact Solana mints and token artwork from the xStocks issuer's public
// asset directory: https://api.xstocks.fi/api/v2/public/assets (re-verified 2026-09-25
// against the paginated directory and Jupiter Tokens V2: same ids, 8 decimals, Token-2022).
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
};
const decimals = 8;

export function issuerAsset(symbol: string) {
  const mint = mints[symbol];
  return mint ? { mint, decimals, logoUrl: `https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png` } : null;
}
