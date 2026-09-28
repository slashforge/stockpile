import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { BagSheetProvider } from "@/components/sheets/bag-sheet";
import { FundSheetProvider } from "@/components/sheets/fund-sheet";
import { SignInSheetProvider } from "@/components/sheets/sign-in-sheet";
import { AppShell } from "@/components/shell/app-shell";
import { MessageState } from "@/components/ui/layout";
import { IoCompassOutline } from "react-icons/io5";

function RootLayout() {
  return (
    <SignInSheetProvider>
      <FundSheetProvider>
        <BagSheetProvider>
          <AppShell>
            <Outlet />
          </AppShell>
          <Toaster position="top-center" richColors />
        </BagSheetProvider>
      </FundSheetProvider>
    </SignInSheetProvider>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <MessageState icon={IoCompassOutline} title="Page not found" body="That page doesn’t exist in Stockpile." />
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});
