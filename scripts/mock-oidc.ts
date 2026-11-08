/** Manual/browser fixture only. Never run in production. */
import { startMockOidc } from "../tests/fixtures/mock-oidc";
if (process.env.NODE_ENV === "production")
  throw new Error("The mocked identity provider is development/test only.");
const mock = await startMockOidc({
  port: Number(process.env.MOCK_OIDC_PORT ?? "3211"),
  callbackUri:
    process.env.MOCK_CALLBACK_URI ??
    "http://localhost:3101/auth/aibry-id/callback",
});
console.log(`Test-only generated-key OIDC issuer listening on ${mock.issuer}`);
const close = async () => {
  await mock.close();
  process.exit(0);
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
