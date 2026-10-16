import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { USDC_MINT } from "@/lib/solana/transaction";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

export type KnownToken = "SOL" | "USDC";

/** Resolves SOL / USDC by symbol or mint so they always use the bundled marks, never a monogram. */
export function knownToken(symbol?: string | null, mint?: string | null): KnownToken | null {
  if (mint === USDC_MINT) return "USDC";
  if (mint === WSOL_MINT) return "SOL";
  const upper = symbol?.toUpperCase();
  if (upper === "USDC") return "USDC";
  if (upper === "SOL" || upper === "WSOL") return "SOL";
  return null;
}

/** Circle's USDC mark (official path data). */
export function UsdcLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 2000 2000">
      <Circle cx={1000} cy={1000} r={1000} fill="#2775CA" />
      <Path
        fill="#FFFFFF"
        d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z"
      />
      <Path
        fill="#FFFFFF"
        d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z"
      />
    </Svg>
  );
}

/** Solana's logomark (official path data and gradient) centred on the brand's black disc. */
export function SolLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="solMark" x1="360.9" y1="-37.5" x2="141.2" y2="383.3" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#00FFA3" />
          <Stop offset="1" stopColor="#DC1FFF" />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill="#000000" />
      <G transform="translate(24 29.6) scale(0.1307)">
        <Path
          fill="url(#solMark)"
          d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"
        />
        <Path
          fill="url(#solMark)"
          d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"
        />
        <Path
          fill="url(#solMark)"
          d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"
        />
      </G>
    </Svg>
  );
}

export function KnownTokenLogo({ token, size }: { token: KnownToken; size: number }) {
  return token === "USDC" ? <UsdcLogo size={size} /> : <SolLogo size={size} />;
}
