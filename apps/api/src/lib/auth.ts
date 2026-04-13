import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { Resend } from "resend";
import { db } from "@stackforge/core/db";
import * as schema from "@stackforge/core/db/schema";

let authInstance: ReturnType<typeof createAuth> | null = null;
let resendClient: Resend | null = null;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

function getTrustedOrigins() {
  const appScheme = process.env.EXPO_PUBLIC_APP_SCHEME || "stackforge";

  return Array.from(
    new Set(
      [
        process.env.BETTER_AUTH_URL,
        "http://localhost:4040",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://localhost:8081/--/",
        "exp://",
        "exp://**",
        `${appScheme}://`,
        `${appScheme}://*`,
      ].filter((value): value is string => Boolean(value))
    )
  );
}

async function sendVerificationOTP({
  email,
  otp,
  type,
}: {
  email: string;
  otp: string;
  type: string;
}) {
  const resend = getResendClient();

  if (!resend) {
    console.log(`[better-auth] OTP for ${email} (${type}): ${otp}`);
    return;
  }

  const subject = type === "sign-in"
    ? `Your sign-in code: ${otp}`
    : `Your verification code: ${otp}`;

  const from = process.env.BETTER_AUTH_FROM_EMAIL || "onboarding@resend.dev";

  const { error } = await resend.emails.send({
    from,
    to: [email],
    subject,
    text: `Your code is ${otp}. It expires in 5 minutes.`,
  });

  if (error) {
    throw new Error(`Failed to send OTP: ${error.message}`);
  }
}

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    basePath: "/auth",
    secret: process.env.BETTER_AUTH_SECRET || "dev-only-better-auth-secret",
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:4040",
    trustedOrigins: getTrustedOrigins(),
    plugins: [
      expo(),
      emailOTP({
        async sendVerificationOTP(context) {
          await sendVerificationOTP(context);
        },
        otpLength: 6,
        expiresIn: 300,
      }),
    ],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
  });
}

export function getAuth() {
  if (!authInstance) {
    authInstance = createAuth();
  }

  return authInstance;
}

export type AuthSession = ReturnType<typeof createAuth>["$Infer"]["Session"];
export type BetterAuthUser = AuthSession["user"];
