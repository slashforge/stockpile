export const SITE_TITLE = 'Newsbid';
export const SITE_DESCRIPTION =
  'Swipe the news, buy the bag. Source-backed baskets of tokenized stocks and pre-IPO tokens on Solana, bought in one flow from your own wallet.';
export const SITE_URL = 'https://newsbid.trade';
// Web app (apps/web). SST injects the stage's URL (infra/landing.ts); prod is the fallback.
export const APP_URL = (import.meta.env.PUBLIC_APP_URL || 'https://app.newsbid.trade').replace(/\/$/, '');
export const SUPPORT_EMAIL = 'support@newsbid.trade';
export const LEGAL_UPDATED = 'September 26, 2026';
// Placeholder until the repo is public.
export const GITHUB_URL = 'https://github.com/nitishxyz/newsbid';
