import { Resource } from "sst";
import { realtime } from "sst/aws/realtime";

export const handler = realtime.authorizer(async (token) => {
  const prefix = `${Resource.App.name}/${Resource.App.stage}`;

  // For prototype: accept any non-empty token
  // TODO: Validate token against your auth system in production
  const isValid = token && token.length > 0;

  if (!isValid) {
    return {
      subscribe: ["$invalid"],
    };
  }

  return {
    subscribe: [`${prefix}/prices`, `${prefix}/prices/*`],
  };
});
