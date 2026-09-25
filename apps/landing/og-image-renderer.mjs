import React from 'react';

const h = React.createElement;

function sanitize(text = '') {
  return text.replace(/→/g, ' to ').replace(/←/g, ' from ');
}

function clampText(text = '', maxLength = 120) {
  const clean = sanitize(text);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalize(pathname) {
  if (!pathname) return '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function getPageLabel(pathname) {
  const path = normalize(pathname);

  if (path === '/') return 'Landing Page';
  if (path === '/blog/' || path === '/blog') return 'Blog';
  if (path.startsWith('/blog/')) return 'Article';
  return 'Website';
}

export async function renderOpenGraphImage({ title, description, pathname }) {
  const brand = '#2563eb';
  const brandMuted = '#e8f0ff';
  const text = '#10131f';
  const subtle = '#555c72';
  const surface = '#ffffff';
  const background = '#f5f6fb';
  const path = normalize(pathname);
  const label = getPageLabel(path);
  const url = path === '/' ? 'stockpile.cash' : `stockpile.cash${path}`;

  return Promise.resolve(
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: background,
          padding: '36px',
          fontFamily: 'Atkinson',
          color: text,
        },
      },
      h(
        'div',
        {
          style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: surface,
            border: '1px solid rgba(37, 99, 235, 0.18)',
            borderRadius: '28px',
            padding: '52px 56px',
            boxShadow: '0 18px 60px rgba(37, 99, 235, 0.08)',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
              },
            },
            h('div', {
              style: {
                width: '18px',
                height: '18px',
                borderRadius: '6px',
                backgroundImage: 'linear-gradient(135deg, #2563EB, #38BDF8)',
                marginRight: '14px',
              },
            }),
            h(
              'div',
              {
                style: {
                  fontSize: '20px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                },
              },
              'Stockpile',
            ),
          ),
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                borderRadius: '999px',
                backgroundColor: brandMuted,
                color: brand,
                padding: '10px 16px',
                fontSize: '15px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              },
            },
            label,
          ),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              maxWidth: '88%',
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: '60px',
                lineHeight: 1.08,
                fontWeight: 700,
                letterSpacing: '-0.05em',
              },
            },
            clampText(title, 95),
          ),
          description
            ? h(
                'div',
                {
                  style: {
                    marginTop: '22px',
                    fontSize: '24px',
                    lineHeight: 1.45,
                    color: subtle,
                    maxWidth: '92%',
                  },
                },
                clampText(description, 150),
              )
            : null,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
              },
            },
            h('div', {
              style: {
                width: '76px',
                height: '6px',
                borderRadius: '999px',
                backgroundImage: 'linear-gradient(90deg, #2563EB, #38BDF8, #22C29A)',
                marginBottom: '16px',
              },
            }),
            h(
              'div',
              {
                style: {
                  fontSize: '18px',
                  color: subtle,
                },
              },
              'Swipe the news. Buy the bag. Built for Solana Seeker.',
            ),
          ),
          h(
            'div',
            {
              style: {
                fontSize: '18px',
                color: subtle,
              },
            },
            url,
          ),
        ),
      ),
    ),
  );
}
