import * as fs from 'node:fs';

export const openGraphImageOptions = {
  width: 1200,
  height: 630,
  fonts: [
    {
      name: 'Atkinson',
      weight: 400,
      style: 'normal',
      data: fs.readFileSync(new URL('./public/fonts/atkinson-regular.woff', import.meta.url)),
    },
    {
      name: 'Atkinson',
      weight: 700,
      style: 'normal',
      data: fs.readFileSync(new URL('./public/fonts/atkinson-bold.woff', import.meta.url)),
    },
  ],
};
