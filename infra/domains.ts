const SUB = $app.stage === "prod" ? "" : `${$app.stage}.`;

const HOST = "stockpile.cash";

export const domains = {
  api: `${SUB}api.${HOST}`,
  landing: `${SUB}${HOST}`,
};
