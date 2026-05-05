import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

async function loadPoppins(): Promise<ArrayBuffer> {
  const css = await fetch(
    'https://fonts.googleapis.com/css2?family=Poppins:wght@900&display=swap',
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)',
      },
    }
  ).then(r => r.text());

  const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
  if (!url) throw new Error('Font URL not found in Google Fonts CSS');

  return fetch(url).then(r => r.arrayBuffer());
}

export default async function AppleIcon() {
  const fontData = await loadPoppins();

  return new ImageResponse(
    (
      <div
        style={{
          width: '180px',
          height: '180px',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '140px',
            height: '140px',
            background: '#000000',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              '0 0 0 3px #8B6F00, 0 0 0 5px #000000, 0 0 0 8px #2a2a2a',
          }}
        >
          <span
            style={{
              fontFamily: 'Poppins',
              fontWeight: 900,
              fontSize: 26,
              color: '#ffffff',
              letterSpacing: '-1px',
              textShadow: '0 0 14px rgba(255,255,255,0.3)',
            }}
          >
            Flippy
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Poppins', data: fontData, weight: 900, style: 'normal' }],
    }
  );
}
