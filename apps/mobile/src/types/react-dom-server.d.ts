// react-dom ships without types here; only used by bun tests for static rendering.
declare module "react-dom/server" {
  import type { ReactNode } from "react";
  export function renderToStaticMarkup(element: ReactNode): string;
}
