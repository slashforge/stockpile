const SUB = $app.stage === "prod" ? "" : `${$app.stage}.`;

const HOST = "__DOMAIN__";

export const domains = {
  api: `${SUB}api.${HOST}`,
  landing: `${SUB}${HOST}`,
};
