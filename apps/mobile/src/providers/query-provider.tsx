import React, { useEffect } from "react";
import { AppState } from "react-native";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
// import { useReactQueryDevTools } from "@dev-plugins/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      gcTime: 1000 * 60 * 30,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === "active");

    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // useReactQueryDevTools(queryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
