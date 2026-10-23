import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";
import {
  IoAdd,
  IoBookmark,
  IoBookmarkOutline,
  IoLayers,
  IoLayersOutline,
  IoMail,
  IoNewspaper,
  IoNewspaperOutline,
  IoPersonCircle,
  IoPersonCircleOutline,
  IoPieChart,
  IoPieChartOutline,
} from "react-icons/io5";
import { useFundSheet } from "@/components/sheets/fund-sheet";
import { useSignInSheet } from "@/components/sheets/sign-in-sheet";
import { PrimaryButton } from "@/components/ui/button";
import type { IconType } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import { usePortfolio } from "@/hooks/use-account";
import { formatUsdValue } from "@/lib/portfolio";
import { useNewsbidAuth } from "@/providers/auth-context";
import { shortAddress } from "@/utils/amounts";

type TabItem = {
  to: "/" | "/bags" | "/saved" | "/portfolio" | "/account";
  label: string;
  icon: IconType;
  activeIcon: IconType;
};

/** Same tabs, order and names as the mobile app (app/(tabs)/_layout.tsx). */
export const TABS: TabItem[] = [
  { to: "/", label: "Feed", icon: IoNewspaperOutline, activeIcon: IoNewspaper },
  { to: "/bags", label: "Bags", icon: IoLayersOutline, activeIcon: IoLayers },
  { to: "/saved", label: "Saved", icon: IoBookmarkOutline, activeIcon: IoBookmark },
  { to: "/portfolio", label: "Portfolio", icon: IoPieChartOutline, activeIcon: IoPieChart },
  { to: "/account", label: "Account", icon: IoPersonCircleOutline, activeIcon: IoPersonCircle },
];

/** Pushed screens belong to the tab they were opened from, like the mobile stack. */
function activeTab(pathname: string): TabItem["to"] {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/bags") || pathname.startsWith("/bag/") || pathname.startsWith("/asset/")) return "/bags";
  if (pathname.startsWith("/saved")) return "/saved";
  if (pathname.startsWith("/portfolio") || pathname.startsWith("/sell")) return "/portfolio";
  if (pathname.startsWith("/account")) return "/account";
  if (pathname.startsWith("/buy")) return "/bags";
  return "/";
}

/** Trade flows are full-focus, like the mobile modals: no bottom tab bar on small screens. */
function isFlow(pathname: string) {
  return /^\/(buy|sell|sell-tokens)(\/|$)/.test(pathname);
}

/** The Newsbid mark (bag with rising bars), same artwork as apps/landing/public/favicon.svg. */
export function BrandMark({ size = 34 }: { size?: number }) {
  // useId output can contain characters that break `url(#…)` references.
  const gradient = `brand-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 500 500" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="500" height="500" rx="120" fill={`url(#${gradient})`} />
      <g transform="translate(40 40) scale(0.84)" fill="#fff" stroke="#fff">
        <path
          stroke="none"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M136 186H364C386 186 398 198 400 218L418 398C421 426 404 444 376 444H124C96 444 79 426 82 398L100 218C102 198 114 186 136 186ZM177 322C168 322 162 328 162 337V386C162 395 168 401 177 401H203C212 401 218 395 218 386V337C218 328 212 322 203 322H177ZM237 282C228 282 222 288 222 297V386C222 395 228 401 237 401H263C272 401 278 395 278 386V297C278 288 272 282 263 282H237ZM297 238C288 238 282 244 282 253V386C282 395 288 401 297 401H323C332 401 338 395 338 386V253C338 244 332 238 323 238H297Z"
        />
        <path d="M172 196V172C172 132 206 106 250 106C294 106 328 132 328 172V196" fill="none" strokeWidth="30" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function AccountCard() {
  const auth = useNewsbidAuth();
  const portfolio = usePortfolio();
  const { requestSignIn } = useSignInSheet();
  const { openFund } = useFundSheet();
  if (!auth.configured) return null;
  if (!auth.authenticated) {
    return (
      <div className="hidden flex-col gap-2.5 rounded-3xl bg-surface p-4 shadow-card lg:flex">
        <T variant="subhead">Sign in to Newsbid</T>
        <T variant="footnote" tone="secondary">
          Save bags, see your balance and put money in a bag.
        </T>
        <PrimaryButton label="Sign in" icon={IoMail} size="md" onClick={() => requestSignIn()} />
      </div>
    );
  }
  const total = portfolio.data?.status === "live" ? formatUsdValue(portfolio.data.totalUsd) : null;
  return (
    <div className="grad-blue relative hidden flex-col gap-3 overflow-hidden rounded-3xl p-4 text-white lg:flex">
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 60" preserveAspectRatio="xMaxYMin slice" aria-hidden>
        <circle cx={96} cy={4} r={26} fill="#FFFFFF" fillOpacity={0.14} />
      </svg>
      <Link to="/portfolio" className="relative flex flex-col gap-0.5">
        <T as="span" variant="caption" tone="inherit" className="text-white/80">
          Total value
        </T>
        <T as="span" variant="title2" tone="inherit" className="tabular-nums">
          {total ?? "—"}
        </T>
        <T as="span" variant="caption" tone="inherit" lines={1} className="text-white/80">
          {auth.email ?? (auth.walletAddress ? shortAddress(auth.walletAddress) : "Signed in")}
        </T>
      </Link>
      {auth.walletAddress ? (
        <button
          type="button"
          onClick={openFund}
          className="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-white text-[#2563EB] transition-opacity hover:opacity-90"
        >
          <IoAdd size={16} />
          <T as="span" variant="subhead" tone="inherit">
            Add funds
          </T>
        </button>
      ) : null}
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const current = activeTab(pathname);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-canvas/90 px-3 py-5 backdrop-blur-xl md:flex lg:w-[260px] lg:px-4">
      <Link to="/" className="mb-6 flex items-center gap-2.5 px-1.5 lg:px-2" aria-label="Newsbid home">
        <BrandMark size={32} />
        <span className="font-wordmark hidden text-[26px] leading-none text-ink lg:inline">Newsbid</span>
      </Link>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {TABS.map((tab) => {
          const active = tab.to === current;
          const Icon = active ? tab.activeIcon : tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              title={tab.label}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5 transition-colors lg:flex-row lg:gap-3 lg:px-3.5 lg:py-3",
                active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon size={22} className="shrink-0" />
              <span className={cn("text-[11px] lg:text-[15px]", active ? "font-bold" : "font-medium")}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <AccountCard />
      <T variant="caption" tone="tertiary" className="mt-4 hidden px-2 lg:block">
        Editorial research, not investment advice.
      </T>
    </aside>
  );
}

/** Floating pill tab bar, as on Android: rounded translucent surface above the bottom edge. */
function BottomTabs({ pathname }: { pathname: string }) {
  const current = activeTab(pathname);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3.5 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 mx-auto flex h-16 max-w-[520px] items-center rounded-full border border-line/60 bg-surface/80 px-1.5 shadow-bar backdrop-blur-xl md:hidden"
    >
      {TABS.map((tab) => {
        const active = tab.to === current;
        const Icon = active ? tab.activeIcon : tab.icon;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className="flex h-full flex-1 items-center justify-center"
          >
            <span
              className={cn(
                "flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-full transition-colors",
                active ? "bg-accent-soft text-accent" : "text-ink-3",
              )}
            >
              <Icon size={22} />
              <span className={cn("text-[11px] tracking-[0.1px]", active ? "font-bold" : "font-medium")}>{tab.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar pathname={pathname} />
      <div className="md:pl-20 lg:pl-[260px]">{children}</div>
      {isFlow(pathname) ? null : <BottomTabs pathname={pathname} />}
    </div>
  );
}
