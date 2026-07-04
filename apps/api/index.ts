import { app } from "./src/app";

export default {
  port: 4040,
  fetch: app.fetch,
  idleTimeout: 30,
};
