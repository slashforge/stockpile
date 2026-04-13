const SUB = $app.stage === "prod" ? "" : `${$app.stage}.`;

const HOST = "stackforge.xyz";

export const domains = {
  api: `${SUB}api.${HOST}`,
  landing: `${SUB}${HOST}`,
};
