const SUB = $app.stage === "prod" ? "" : `${$app.stage}.`;

const HOST = "pager.chat";

export const domains = {
  api: `${SUB}api.${HOST}`,
  landing: `${SUB}${HOST}`,
};
