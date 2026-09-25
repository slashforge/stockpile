import { router } from "expo-router";
import { useEffect } from "react";

/**
 * Screenshot aid for simulators without tap automation. Only active when the build sets
 * EXPO_PUBLIC_DEBUG_ROUTE_TOUR to a comma-separated list of routes; normal builds leave it empty
 * and this component renders nothing and does nothing.
 */
const RAW: string = process.env.EXPO_PUBLIC_DEBUG_ROUTE_TOUR ?? "";
const TOUR: string[] = RAW.split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const STEP_MS = 7000;

export function RouteTour() {
  useEffect(() => {
    if (TOUR.length === 0) return;
    const timers = TOUR.map((route, index) =>
      setTimeout(() => router.navigate(route as Parameters<typeof router.navigate>[0]), (index + 1) * STEP_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return null;
}
