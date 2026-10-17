export const SITE_TITLE = 'Newsbid';
export const SITE_DESCRIPTION =
  'Follow the story. Explore themed baskets of tokenized stocks and pre-IPO tokens, understand the sources and risks, and trade from your own wallet on Solana.';
export const SITE_URL = 'https://newsbid.trade';
// Web app (apps/web). SST injects the stage's URL (infra/landing.ts); prod is the fallback.
export const APP_URL = (import.meta.env.PUBLIC_APP_URL || 'https://app.newsbid.trade').replace(/\/$/, '');
export const SUPPORT_EMAIL = 'support@newsbid.trade';
export const LEGAL_UPDATED = 'September 26, 2026';
// Placeholder until the repo is public.
export const GITHUB_URL = 'https://github.com/nitishxyz/newsbid';
