async function loadFont(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load OG image font: ${url}`);
  }

  return response.arrayBuffer();
}

export async function getOpenGraphImageOptions(origin) {
  return {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Atkinson',
        weight: 400,
        style: 'normal',
        data: await loadFont(new URL('/fonts/atkinson-regular.woff', origin)),
      },
      {
        name: 'Atkinson',
        weight: 700,
        style: 'normal',
        data: await loadFont(new URL('/fonts/atkinson-bold.woff', origin)),
      },
    ],
  };
}
