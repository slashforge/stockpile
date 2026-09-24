const SUB = $app.stage === "prod" ? "" : `${$app.stage}.`;

const HOST = "stockpile.nitish.sh";

export const domains = {
  api: `${SUB}api.${HOST}`,
  landing: `${SUB}${HOST}`,
};
