import { z } from "@hono/zod-openapi";
import { tradeErrorCodes } from "../lib/trade";
import { activityErrorCodes } from "../lib/activity";
import { legErrorCodes, signaturePattern } from "../lib/positions";
import { tokensIntervals } from "../lib/tokens-api";
import { chartRanges, chartReasons } from "../lib/charts";
import { MAX_STATUS_SIGNATURES } from "../lib/broadcast";

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");
export const HealthResponseSchema = z.object({ status: z.string() }).openapi("HealthResponse");
export const IssuerSchema = z.enum(["xstocks", "prestocks"]).openapi("Issuer");
export const AssetClassSchema = z.enum(["public-equity", "pre-ipo"]).openapi("AssetClass");
export const CuratorSchema = z.object({ kind: z.enum(["person", "aggregate", "editorial"]), name: z.string(), description: z.string() }).openapi("Curator");
export const EvidenceSchema = z.object({ kind: z.literal("disclosure"), member: z.string(), chamber: z.enum(["House", "Senate"]), txnType: z.enum(["buy", "sell", "exchange"]), txnDate: z.string(), disclosedDate: z.string(), amountRange: z.string(), amountMidUsd: z.number(), url: z.string() }).openapi("Evidence");
export const UnderlyingSchema = z.object({ source: z.enum(["pyth", "prestocks", "jupiter-stock"]), price: z.number(), asOf: z.string() }).openapi("UnderlyingPrice");
export const Change24hSourceSchema = z.enum(["snapshot", "jupiter"]).openapi("Change24hSource");
export const QuoteProbeSchema = z.object({ sizeUsdc: z.number(), priceImpactPct: z.number(), asOf: z.string() }).openapi("QuoteProbe");
export const AssetMarketSchema = z.object({ usdPrice: z.number().nullable(), priceChange24hPct: z.number().nullable(), change24hSource: Change24hSourceSchema.nullable(), liquidityUsd: z.number().nullable(), organicScore: z.number().nullable(), organicScoreLabel: z.string().nullable(), holderCount: z.number().nullable(), volume24hUsd: z.number().nullable(), underlying: UnderlyingSchema.nullable(), premiumPct: z.number().nullable(), probe: QuoteProbeSchema.nullable(), asOf: z.string() }).openapi("AssetMarket");
export const BagMarketSchema = z.object({ change24hPct: z.number().nullable(), change24hSource: Change24hSourceSchema.nullable(), premiumPct: z.number().nullable(), coverage: z.number(), worstLiquidityUsd: z.number().nullable(), worstLiquiditySymbol: z.string().nullable(), worstImpactPct: z.number().nullable(), worstImpactSymbol: z.string().nullable(), asOf: z.string() }).openapi("BagMarket");
export const ReferenceSchema = z.object({ markPrice: z.number(), tokenPrice: z.number(), impliedValuation: z.number(), asOf: z.string() }).openapi("IssuerReference");
export const AssetSchema = z.object({ symbol: z.string(), name: z.string(), weightBps: z.number(), mint: z.string().nullable(), decimals: z.number().nullable(), uiAmountMultiplier: z.number(), issuer: IssuerSchema, assetClass: AssetClassSchema, reference: ReferenceSchema.nullable(), market: AssetMarketSchema.nullable(), liquidityTier: z.enum(["deep", "ok", "thin"]).nullable(), evidence: z.array(EvidenceSchema), sourceUrl: z.string(), iconUrl: z.string().nullable(), iconSource: z.enum(["jupiter-token", "issuer-token", "underlying-brand"]).nullable(), brandColor: z.string().regex(/^#[0-9a-f]{6}$/).nullable() }).openapi("BagAsset");
export const BagSchema = z.object({ id: z.string(), title: z.string(), subtitle: z.string(), description: z.string(), thesis: z.string(), disclosure: z.string(), sourceType: z.enum(["editorial", "disclosure"]), issuer: IssuerSchema, assetClass: AssetClassSchema, curator: CuratorSchema, risks: z.array(z.string()), tradable: z.boolean(), tradableReason: z.string().nullable(), market: BagMarketSchema.nullable(), sources: z.array(z.object({ title: z.string(), url: z.string() })), assets: z.array(AssetSchema) }).openapi("Bag");
export const BagsSchema = z.object({ bags: z.array(BagSchema) }).openapi("BagsResponse");
export const BagResponseSchema = z.object({ bag: BagSchema }).openapi("BagResponse");
export const UserSchema = z.object({ id: z.string(), email: z.string().nullable(), walletAddress: z.string().nullable(), createdAt: z.string() }).openapi("User");
export const MeResponseSchema = z.object({ user: UserSchema }).openapi("MeResponse");
export const SavedSchema = z.object({ bagIds: z.array(z.string()) }).openapi("SavedBagsResponse");
export const SaveBagRequestSchema = z.object({ bagId: z.string() }).openapi("SaveBagRequest");
export const TradeSideSchema = z.enum(["buy", "sell"]).openapi("TradeSide");
export const TradeRequestSchema = z.object({
  bagId: z.string(), side: TradeSideSchema.default("buy"),
  inputMint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional().openapi({ description: "Buy only: must be mainnet USDC. Ignored for sells." }),
  amount: z.string().max(20).regex(/^[1-9][0-9]*$/).optional().openapi({ description: "Buy only: USDC base units (6 decimals). Ignored for sells." }),
  portionBps: z.number().int().min(1).max(10000).optional().openapi({ description: "Sell only: share of the user's bag position to sell, 1..10000 bps." }),
  slippageBps: z.number().int().min(1).max(500).nullable().optional().openapi({ description: "Advanced override. Omit or null for automatic protection (Jupiter real-time slippage estimator) chosen per leg when the swap is built." }),
}).superRefine((value, ctx) => {
  if (value.side === "buy") { if (!value.inputMint) ctx.addIssue({ code: "custom", path: ["inputMint"], message: "inputMint is required for a buy" }); if (!value.amount) ctx.addIssue({ code: "custom", path: ["amount"], message: "amount is required for a buy" }); }
  else if (value.portionBps === undefined) ctx.addIssue({ code: "custom", path: ["portionBps"], message: "portionBps is required for a sell" });
}).openapi("TradeRequest");
export const TradeErrorSchema = z.object({ code: z.enum(tradeErrorCodes), message: z.string(), legIndex: z.number().nullable(), symbol: z.string().nullable() }).openapi("TradeError");
export const QuoteLegSchema = z.object({ index: z.number(), symbol: z.string(), weightBps: z.number(), inputMint: z.string(), outputMint: z.string(), outputDecimals: z.number().nullable(), uiAmountMultiplier: z.number(), inputAmount: z.string(), outAmount: z.string(), minOutAmount: z.string().nullable(), priceImpactPct: z.string().nullable(), routeSteps: z.number() }).openapi("QuoteLeg");
const tradeEcho = { bagId: z.string(), side: TradeSideSchema, inputMint: z.string().nullable(), amount: z.string().nullable(), portionBps: z.number().nullable(), slippageBps: z.number().nullable().openapi({ description: "The requested override, or null for automatic protection." }), totalOutAmount: z.string().nullable().openapi({ description: "Sells: sum of leg outAmount in USDC base units. Null for buys." }) };
export const QuoteSchema = z.object({ status: z.enum(["available", "unavailable"]), ...tradeEcho, legs: z.array(QuoteLegSchema), error: TradeErrorSchema.nullable(), message: z.string().nullable() }).openapi("QuoteResponse");
export const PreparedTransactionSchema = QuoteLegSchema.extend({
  transaction: z.string().openapi({ description: "Base64 v0 transaction, already signed by the Stockpile fee payer; the user's wallet adds its signature." }),
  lastValidBlockHeight: z.number().nullable(),
  slippageBps: z.number().nullable().openapi({ description: "Slippage limit this leg was built with (chosen by Jupiter when automatic)." }),
  feePayer: z.string().openapi({ description: "Stockpile paymaster that pays the network fee and token-account rent." }),
}).openapi("PreparedTransaction");
export const PrepareSchema = z.object({ status: z.enum(["ready", "unavailable"]), ...tradeEcho, walletAddress: z.string().nullable(), transactions: z.array(PreparedTransactionSchema), error: TradeErrorSchema.nullable(), message: z.string().nullable() }).openapi("PrepareResponse");
export const TokenSellRequestSchema = z.object({
  mints: z.array(z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)).min(1).max(12).openapi({ description: "Token mints to sell to USDC. Only the balance held outside every bag position is sold." }),
  portionBps: z.number().int().min(1).max(10000).openapi({ description: "Share of each mint's loose balance to sell, 1..10000 bps." }),
  slippageBps: z.number().int().min(1).max(500).nullable().optional().openapi({ description: "Advanced override. Omit or null for automatic protection." }),
}).openapi("TokenSellRequest");
const tokenSellEcho = { mints: z.array(z.string()), portionBps: z.number(), slippageBps: z.number().nullable(), totalOutAmount: z.string().nullable().openapi({ description: "Sum of leg outAmount in USDC base units." }) };
export const TokenSellQuoteSchema = z.object({ status: z.enum(["available", "unavailable"]), ...tokenSellEcho, legs: z.array(QuoteLegSchema), error: TradeErrorSchema.nullable(), message: z.string().nullable() }).openapi("TokenSellQuoteResponse");
export const TokenSellPrepareSchema = z.object({ status: z.enum(["ready", "unavailable"]), ...tokenSellEcho, walletAddress: z.string().nullable(), transactions: z.array(PreparedTransactionSchema), error: TradeErrorSchema.nullable(), message: z.string().nullable() }).openapi("TokenSellPrepareResponse");
export const SubmitTransactionRequestSchema = z.object({
  transaction: z.string().min(1).max(4096).openapi({ description: "Base64 transaction fully signed by the user's wallet (and the Stockpile fee payer when sponsored)." }),
  bagId: z.string().min(1).optional().openapi({ description: "Bag this swap belongs to. The server links the leg to the bag once it confirms, even if the app closes first." }),
}).openapi("SubmitTransactionRequest");
export const SubmitTransactionSchema = z.object({ signature: z.string() }).openapi("SubmitTransactionResponse");
export const TransactionStatusRequestSchema = z.object({ signatures: z.array(z.string().regex(signaturePattern)).min(1).max(MAX_STATUS_SIGNATURES) }).openapi("TransactionStatusRequest");
export const TransactionStatusSchema = z.object({ signature: z.string(), status: z.enum(["pending", "confirmed", "failed"]), error: z.string().nullable() }).openapi("TransactionStatus");
export const TransactionStatusesSchema = z.object({ statuses: z.array(TransactionStatusSchema) }).openapi("TransactionStatusesResponse");
export const BalanceSchema = z.object({ amount: z.string(), decimals: z.number(), uiAmount: z.string(), usdPrice: z.number().nullable(), usdValue: z.number().nullable() }).openapi("Balance");
export const HoldingSchema = z.object({ mint: z.string(), symbol: z.string().nullable(), name: z.string().nullable(), iconUrl: z.string().nullable(), amount: z.string(), decimals: z.number(), uiAmount: z.string().nullable(), program: z.enum(["token", "token-2022"]), usdPrice: z.number().nullable(), usdValue: z.number().nullable(), bagIds: z.array(z.string()) }).openapi("Holding");
export const PortfolioSchema = z.object({ walletAddress: z.string().nullable(), status: z.enum(["live", "unavailable"]), holdings: z.array(HoldingSchema), sol: BalanceSchema.nullable(), usdc: BalanceSchema.nullable(), totalUsd: z.number().nullable(), unpricedCount: z.number(), asOf: z.string().nullable(), message: z.string().nullable() }).openapi("PortfolioResponse");
export const ActivityErrorSchema = z.object({ code: z.enum(activityErrorCodes), message: z.string() }).openapi("ActivityError");
export const ActivityLegSchema = z.object({ mint: z.string(), symbol: z.string().nullable(), amount: z.string(), direction: z.enum(["in", "out"]) }).openapi("ActivityLeg");
export const ActivitySchema = z.object({ signature: z.string(), ts: z.string().nullable(), kind: z.enum(["swap", "transfer-in", "transfer-out", "other"]), status: z.enum(["confirmed", "failed"]), summary: z.string(), legs: z.array(ActivityLegSchema), feeLamports: z.number(), bagId: z.string().nullable(), bagLinked: z.boolean().openapi({ description: "true when bagId comes from the user's own bag lot for this signature; false when it is the catalogue guess." }), explorerUrl: z.string() }).openapi("Activity");
export const ActivityResponseSchema = z.object({ status: z.enum(["live", "unavailable"]), walletAddress: z.string().nullable(), items: z.array(ActivitySchema), nextCursor: z.string().nullable(), asOf: z.string().nullable(), error: ActivityErrorSchema.nullable(), message: z.string().nullable() }).openapi("ActivityResponse");
export const RecordBagLegRequestSchema = z.object({ bagId: z.string(), signature: z.string().regex(signaturePattern) }).openapi("RecordBagLegRequest");
export const BagLotSchema = z.object({ id: z.string(), bagId: z.string(), mint: z.string(), symbol: z.string(), side: TradeSideSchema, tokenAmount: z.string(), tokenUiAmount: z.number(), decimals: z.number(), usdcAmount: z.string(), usdcUiAmount: z.number(), signature: z.string(), ts: z.string().nullable() }).openapi("BagLot");
export const BagLotResponseSchema = z.object({ lot: BagLotSchema }).openapi("BagLotResponse");
export const PendingLegSchema = z.object({ status: z.literal("pending"), message: z.string() }).openapi("PendingBagLeg");
export const LegErrorSchema = z.object({ error: z.string(), code: z.enum([...legErrorCodes, "SIGNATURE_ALREADY_LINKED"]), bagId: z.string().optional() }).openapi("BagLegError");
export const PositionLegSchema = z.object({ mint: z.string(), symbol: z.string(), iconUrl: z.string().nullable(), decimals: z.number(), tracked: z.string(), trackedUi: z.number(), walletBalance: z.string().nullable(), held: z.string(), heldUi: z.number(), usdPrice: z.number().nullable(), usdValue: z.number().nullable(), costUsdc: z.number() }).openapi("PositionLeg");
export const BagPositionSchema = z.object({ bagId: z.string(), title: z.string(), legs: z.array(PositionLegSchema), costUsdc: z.number(), valueUsd: z.number().nullable(), pnlUsd: z.number().nullable(), pnlPct: z.number().nullable(), reconciled: z.boolean(), sellable: z.boolean(), lotCount: z.number(), lastTradedAt: z.string().nullable() }).openapi("BagPosition");
export const PositionsResponseSchema = z.object({ walletAddress: z.string().nullable(), status: z.enum(["live", "unavailable"]), message: z.string().optional(), bags: z.array(BagPositionSchema) }).openapi("PositionsResponse");
export const HistoryRangeSchema = z.enum(["24h", "7d", "30d", "1y"]).openapi("HistoryRange");
export const HistorySourceSchema = z.enum(["tokens", "snapshot"]).openapi("HistorySource");
export const CandleIntervalSchema = z.enum(tokensIntervals).openapi("CandleInterval");
export const CandleSchema = z.object({ t: z.number(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number().nullable() }).openapi("Candle");
export const AssetSeriesSchema = z.object({ symbol: z.string(), mint: z.string().nullable(), weightBps: z.number(), candles: z.array(CandleSchema) }).openapi("AssetSeries");
export const HistorySchema = z.object({ bagId: z.string(), source: HistorySourceSchema, range: HistoryRangeSchema, interval: CandleIntervalSchema, from: z.number(), to: z.number(), assets: z.array(AssetSeriesSchema), bag: z.array(z.object({ t: z.number(), value: z.number() })), changePct: z.number().nullable(), asOf: z.string().nullable() }).openapi("BagHistoryResponse");
export const ChartRangeSchema = z.enum(chartRanges).openapi("ChartRange");
export const ChartReasonSchema = z.enum(chartReasons).openapi("ChartReason");
export const ChartSourceSchema = z.literal("tokens.xyz").openapi("ChartSource");
export const PricePointSchema = z.object({ t: z.number(), close: z.number() }).openapi("PricePoint");
export const IndexPointSchema = z.object({ t: z.number(), value: z.number() }).openapi("IndexPoint");
export const AssetChartSchema = z.object({ mint: z.string(), symbol: z.string().nullable(), range: ChartRangeSchema, interval: CandleIntervalSchema, points: z.array(PricePointSchema), candles: z.array(CandleSchema), change: z.object({ abs: z.number(), pct: z.number() }).nullable(), source: ChartSourceSchema, reason: ChartReasonSchema.nullable(), asOf: z.string().nullable() }).openapi("AssetChartResponse");
export const ChartLegSchema = z.object({ mint: z.string().nullable(), symbol: z.string(), weight: z.number(), weightBps: z.number(), change: z.object({ pct: z.number() }).nullable(), ok: z.boolean(), reason: ChartReasonSchema.nullable() }).openapi("ChartLeg");
export const BagChartSchema = z.object({ bagId: z.string(), range: ChartRangeSchema, interval: CandleIntervalSchema, points: z.array(IndexPointSchema), change: z.object({ pct: z.number() }).nullable(), legs: z.array(ChartLegSchema), source: ChartSourceSchema, reason: ChartReasonSchema.nullable(), asOf: z.string().nullable() }).openapi("BagChartResponse");
export const SparklinesSchema = z.object({ range: z.literal("1D"), interval: z.literal("1H"), source: ChartSourceSchema, reason: ChartReasonSchema.nullable(), sparklines: z.record(z.string(), z.array(IndexPointSchema)) }).openapi("BagSparklinesResponse");
export const BagReturnsSchema = z.object({ "1M": z.number().nullable(), "1Y": z.number().nullable(), ALL: z.number().nullable(), since: z.string().nullable(), sparkline1M: z.array(IndexPointSchema) }).openapi("BagReturns");
export const BagReturnsResponseSchema = z.object({ source: ChartSourceSchema, interval: z.literal("1D"), asOf: z.string().nullable(), reason: ChartReasonSchema.nullable(), returns: z.record(z.string(), BagReturnsSchema) }).openapi("BagReturnsResponse");
export const StoryConnectionSchema = z.object({ bagId: z.string(), relationship: z.enum(["direct", "inferred"]), context: z.enum(["supporting", "opposing", "neutral"]), explanation: z.string() }).openapi("StoryBagConnection");
export const StorySchema = z.object({ id: z.string(), title: z.string(), format: z.enum(["article", "podcast", "disclosure"]), summary: z.string(), publisher: z.string(), sourceUrl: z.string(), publishedAt: z.string(), imageUrl: z.string().nullable(), imageCredit: z.string().nullable(), bagIds: z.array(z.string()), bagConnections: z.array(StoryConnectionSchema), provenance: z.enum(["editorial", "ai"]), status: z.literal("published") }).openapi("Story");
export const StoriesResponseSchema = z.object({ stories: z.array(StorySchema), nextCursor: z.string().nullable() }).openapi("StoriesResponse");
