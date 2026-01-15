const SUB = $app.stage === "prod" ? "" : `${$app.stage}.`;

const HOST = "riven.cash";

export const domains = {
  backend: `${SUB}api.${HOST}`,
  landing: `${SUB}${HOST}`,
};
