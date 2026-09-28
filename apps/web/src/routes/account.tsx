import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  IoAddCircle,
  IoCopyOutline,
  IoLockClosed,
  IoLogOutOutline,
  IoMail,
  IoOpenOutline,
  IoPerson,
  IoShieldCheckmark,
  IoWallet,
} from "react-icons/io5";
import { toast } from "sonner";
import { useFundSheet } from "@/components/sheets/fund-sheet";
import { useSignInSheet } from "@/components/sheets/sign-in-sheet";
import { GradientCard, HeroState } from "@/components/stockpile/hero-state";
import { PrimaryButton } from "@/components/ui/button";
import { Card, Collapsible, Divider, ListRow, Page, Section } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { API_URL } from "@/config/env";
import { useMe } from "@/hooks/use-account";
import { useBags } from "@/hooks/use-bags";
import { explorerAccountUrl } from "@/lib/solana/transaction";
import { useStockpileAuth } from "@/providers/auth-context";
import { shortAddress } from "@/utils/amounts";

export const Route = createFileRoute("/account")({ component: AccountScreen });

const RISKS = [
  "Bags are Stockpile’s editorial research, not investment advice or a recommendation.",
  "Tokenized stocks are issued by third parties, may not carry shareholder rights and can trade away from the share price.",
  "Swaps have slippage and network fees. You can lose money.",
];

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Disclosures() {
  const bags = useBags();
  const sources = Array.from(
    new Map((bags.data ?? []).flatMap((bag) => bag.sources).map((source) => [source.url, source])).values(),
  );
  return (
    <Collapsible title="Disclosures" icon={IoShieldCheckmark} tint="caution" summary="Risks and issuer information">
      {RISKS.map((risk) => (
        <div key={risk} className="flex items-start gap-2">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-caution" />
          <T variant="footnote" tone="secondary">
            {risk}
          </T>
        </div>
      ))}
      {sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-2.5 rounded-[14px] bg-canvas p-2.5 transition-opacity hover:opacity-80"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <T as="span" variant="subhead" lines={2}>
              {source.title}
            </T>
            <T as="span" variant="caption" tone="tertiary">
              {hostOf(source.url)}
            </T>
          </span>
          <IoOpenOutline size={16} className="shrink-0 text-accent" />
        </a>
      ))}
    </Collapsible>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        toast.success("Copied");
      }}
      className="flex min-h-[52px] w-full items-center justify-between gap-2.5 px-4 py-3 text-left transition-colors hover:bg-scrim"
    >
      <span className="flex flex-1 flex-col gap-0.5">
        <T as="span" variant="footnote" tone="secondary">
          {label}
        </T>
        <T as="span" variant="numeric">
          {shortAddress(value, 6)}
        </T>
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-[9px] py-[5px] text-accent">
        <IoCopyOutline size={16} />
        <T as="span" variant="footnote" tone="accent" className="font-semibold">
          Copy
        </T>
      </span>
    </button>
  );
}

function AccountScreen() {
  const auth = useStockpileAuth();
  const me = useMe();
  const { requestSignIn } = useSignInSheet();
  const { openFund } = useFundSheet();
  const [signingOut, setSigningOut] = useState(false);
  const walletAddress = auth.walletAddress ?? me.data?.walletAddress ?? null;
  const email = auth.email ?? me.data?.email ?? null;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.logout();
      toast.success("Signed out");
    } catch {
      toast.error("Sign out failed");
    } finally {
      setSigningOut(false);
    }
  };

  let apiHost = API_URL;
  try {
    apiHost = new URL(API_URL).host;
  } catch {}
  const local = apiHost.startsWith("localhost") || apiHost.startsWith("127.");

  return (
    <Page title="Account" wide>
      <div className="grid gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {!auth.configured ? (
            <HeroState
              gradient="coral"
              icon={IoLockClosed}
              title="Sign-in is off in this build"
              body="Add the Privy app id to the web app config to enable accounts."
            />
          ) : auth.authenticated ? (
            <>
          <GradientCard gradient="rose">
            <div className="flex items-center gap-3">
              <div className="flex size-[60px] shrink-0 items-center justify-center rounded-full bg-white/25">
                <T variant="title1" tone="inherit" className="text-white">
                  {(email ?? "?").slice(0, 1).toUpperCase()}
                </T>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <T variant="title3" tone="inherit" lines={1} className="text-white">
                  {email ?? "Signed in"}
                </T>
                <T variant="footnote" tone="inherit" className="text-white/90">
                  Signed in with email
                </T>
              </div>
            </div>
          </GradientCard>
          <Section title="Wallet" className="mt-0">
          <Card padded={false} className="gap-0 overflow-hidden">
            {walletAddress ? (
              <>
                <CopyRow label="Solana wallet" value={walletAddress} />
                <Divider inset={16} />
                <ListRow title="Add funds" detail="Receive USDC on Solana" icon={IoAddCircle} onClick={openFund} />
                <Divider inset={60} />
                <ListRow
                  title="View on Solscan"
                  detail="Your wallet’s on-chain history"
                  icon={IoWallet}
                  onClick={() => window.open(explorerAccountUrl(walletAddress), "_blank", "noopener")}
                />
              </>
            ) : (
              <ListRow title="Solana wallet" detail="Setting up your wallet…" icon={IoWallet} />
            )}
          </Card>
          </Section>
          {me.isError ? (
            <T variant="footnote" tone="danger">
              Couldn’t reach your Stockpile profile: {me.error.message}
            </T>
          ) : null}
            </>
          ) : (
            <HeroState
              gradient="rose"
              icon={IoPerson}
              accents={[IoMail, IoShieldCheckmark]}
              title="Sign in to Stockpile"
              body="Save bags, see your balance and put money in a bag."
              actionLabel="Sign in"
              actionIcon={IoMail}
              onAction={() => requestSignIn()}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section title="About" className="mt-0">
            <Disclosures />
          </Section>
          {auth.authenticated ? (
            <PrimaryButton label="Sign out" variant="outline" icon={IoLogOutOutline} loading={signingOut} onClick={signOut} />
          ) : null}
          <T variant="caption" tone="tertiary" align="center">
            Stockpile for web{import.meta.env.DEV || local ? ` · ${apiHost}` : ""}
          </T>
        </div>
      </div>
    </Page>
  );
}
