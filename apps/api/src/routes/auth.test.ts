import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

// Mock Privy user data
const TEST_PRIVY_USER = {
  id: "did:privy:abc123",
  linked_accounts: [
    { type: "email", address: "test@example.com", verified_at: 1234567890 },
    { type: "wallet", address: "So1anaWa11etAddress123456789", chain_type: "solana" },
  ],
};

// Mock database user
const mockDbUser = {
  id: "did:privy:abc123",
  email: "test@example.com",
  gridUserId: "did:privy:abc123",
  smartAccount: "So1anaWa11etAddress123456789",
  username: null,
  displayName: null,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Track mock state
let mockUserData: typeof mockDbUser | null = null;

// Mock Privy client
mock.module("../lib/privy", () => ({
  getPrivyClient: () => ({
    users: () => ({
      get: async ({ id_token }: { id_token: string }) => {
        if (id_token === "valid-token") {
          return TEST_PRIVY_USER;
        }
        throw new Error("Invalid token");
      },
    }),
  }),
  getSolanaWallet: (user: typeof TEST_PRIVY_USER) => {
    const wallet = user.linked_accounts.find(
      (a) => a.type === "wallet" && a.chain_type === "solana"
    );
    return wallet?.address ?? null;
  },
  getUserSolanaWallet: async (userId: string) => {
    return "So1anaWa11etAddress123456789";
  },
  getUserWallets: async (userId: string) => {
    return [{ address: "So1anaWa11etAddress123456789", chain_type: "solana" }];
  },
  getEmail: (user: typeof TEST_PRIVY_USER) => {
    const email = user.linked_accounts.find((a) => a.type === "email");
    return email?.address ?? null;
  },
  PrivyUser: {},
}));

// Mock database
mock.module("@soljar/core/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockUserData ? [mockUserData] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (data: any) => ({
        returning: () => {
          mockUserData = { ...mockDbUser, ...data };
          return Promise.resolve([mockUserData]);
        },
      }),
    }),
    update: () => ({
      set: (data: any) => ({
        where: () => {
          mockUserData = { ...mockUserData!, ...data };
          return Promise.resolve();
        },
      }),
    }),
  },
}));

// Import after mocking
const { default: authRoutes } = await import("./auth");

describe("Auth Routes", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route("/auth", authRoutes);
    mockUserData = null;
  });

  describe("POST /auth/sync", () => {
    it("should return 401 if no identity token provided", async () => {
      const res = await app.request("/auth/sync", {
        method: "POST",
      });

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Missing privy-id-token header");
    });

    it("should return 401 for invalid token", async () => {
      const res = await app.request("/auth/sync", {
        method: "POST",
        headers: { "privy-id-token": "invalid-token" },
      });

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain("Invalid token");
    });

    it("should create new user on first sync", async () => {
      const res = await app.request("/auth/sync", {
        method: "POST",
        headers: { "privy-id-token": "valid-token" },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; user: any };
      expect(json.success).toBe(true);
      expect(json.user).toBeDefined();
      expect(json.user.id).toBe("did:privy:abc123");
      expect(json.user.email).toBe("test@example.com");
      expect(json.user.walletAddress).toBe("So1anaWa11etAddress123456789");
      expect(json.user.privyUserId).toBe("did:privy:abc123");
    });

    it("should update existing user on sync", async () => {
      // Simulate existing user
      mockUserData = mockDbUser;

      const res = await app.request("/auth/sync", {
        method: "POST",
        headers: { "privy-id-token": "valid-token" },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; user: any };
      expect(json.success).toBe(true);
      expect(json.user.id).toBe("did:privy:abc123");
    });
  });

  describe("GET /auth/me", () => {
    it("should return 401 if no identity token provided", async () => {
      const res = await app.request("/auth/me");

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Missing privy-id-token header");
    });

    it("should return 404 if user not found", async () => {
      const res = await app.request("/auth/me", {
        headers: { "privy-id-token": "valid-token" },
      });

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain("User not found");
    });

    it("should return user data when user exists", async () => {
      mockUserData = mockDbUser;

      const res = await app.request("/auth/me", {
        headers: { "privy-id-token": "valid-token" },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { user: any };
      expect(json.user).toBeDefined();
      expect(json.user.id).toBe("did:privy:abc123");
      expect(json.user.email).toBe("test@example.com");
      expect(json.user.walletAddress).toBe("So1anaWa11etAddress123456789");
    });
  });
});
