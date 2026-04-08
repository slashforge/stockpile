import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const TEST_SESSION = {
  user: {
    id: "user_123",
    email: "test@example.com",
    name: "Test User",
  },
  session: {
    id: "session_123",
    userId: "user_123",
  },
};

const mockDbUser = {
  id: "user_123",
  email: "test@example.com",
  wallet: "email:973dfe463ec85785f5f95af5ba3906eea9f54f2a",
  username: null,
  displayName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let mockUserData: typeof mockDbUser | null = null;

mock.module("../lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        if (headers.get("cookie") === "better-auth.session=valid") {
          return TEST_SESSION;
        }
        return null;
      },
    },
    handler: async () => new Response("Not found", { status: 404 }),
  }),
}));

mock.module("__SCOPE__/core/db", () => ({
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

const { default: authRoutes } = await import("./auth");

describe("Auth Routes", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route("/auth", authRoutes);
    mockUserData = null;
  });

  describe("POST /auth/sync", () => {
    it("should return 401 if no session cookie is provided", async () => {
      const res = await app.request("/auth/sync", {
        method: "POST",
      });

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Unauthorized");
    });

    it("should create a new user on first sync", async () => {
      const res = await app.request("/auth/sync", {
        method: "POST",
        headers: { cookie: "better-auth.session=valid" },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; user: any };
      expect(json.success).toBe(true);
      expect(json.user.id).toBe(TEST_SESSION.user.id);
      expect(json.user.email).toBe(TEST_SESSION.user.email);
      expect(json.user.walletAddress).toContain("email:");
      expect(json.user.authUserId).toBe(TEST_SESSION.user.id);
    });

    it("should update an existing user on sync", async () => {
      mockUserData = mockDbUser;

      const res = await app.request("/auth/sync", {
        method: "POST",
        headers: { cookie: "better-auth.session=valid" },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; user: any };
      expect(json.success).toBe(true);
      expect(json.user.id).toBe(TEST_SESSION.user.id);
      expect(json.user.walletAddress).toContain("email:");
    });
  });

  describe("GET /auth/me", () => {
    it("should return 401 if no session cookie is provided", async () => {
      const res = await app.request("/auth/me");

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Unauthorized");
    });

    it("should return the current user when authenticated", async () => {
      mockUserData = mockDbUser;

      const res = await app.request("/auth/me", {
        headers: { cookie: "better-auth.session=valid" },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { user: any };
      expect(json.user.id).toBe(TEST_SESSION.user.id);
      expect(json.user.email).toBe(TEST_SESSION.user.email);
      expect(json.user.walletAddress).toContain("email:");
    });
  });
});
