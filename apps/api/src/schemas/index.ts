import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

export const UserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    walletAddress: z.string(),
    authUserId: z.string(),
    createdAt: z.string(),
  })
  .openapi("User");

export const SyncResponseSchema = z
  .object({
    success: z.boolean(),
    user: UserSchema,
  })
  .openapi("SyncResponse");

export const MeResponseSchema = z
  .object({
    user: UserSchema,
  })
  .openapi("MeResponse");

export const HealthResponseSchema = z
  .object({
    status: z.string(),
  })
  .openapi("HealthResponse");
