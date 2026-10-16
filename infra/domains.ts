const SUB = $app.stage === "prod" ? "" : `${$app.stage}.`;

const HOST = "newsbid.trade";

export const domains = {
  api: `${SUB}api.${HOST}`,
  landing: `${SUB}${HOST}`,
  app: `${SUB}app.${HOST}`,
};
