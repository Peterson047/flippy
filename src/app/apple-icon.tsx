import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
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
            width: '110px',
            height: '110px',
            background: '#000000',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              '0 0 0 2px #8B6F00, 0 0 0 4px #000000, 0 0 0 6px #2a2a2a',
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.1334 3.85537C17.3607 3.99056 17.5001 4.2355 17.5001 4.5V10.75C17.5001 11.1642 17.1643 11.5 16.7501 11.5H5.25007C4.90702 11.5 4.6077 11.2672 4.52318 10.9348C4.43867 10.6023 4.59052 10.2548 4.89194 10.091L16.3919 3.84103C16.6243 3.71473 16.9061 3.72018 17.1334 3.85537ZM8.20071 10H16.0001V5.76122L8.20071 10Z"
              fill="#ffffff"
            />
            <path
              d="M17.5001 19.5C17.5001 19.7645 17.3607 20.0094 17.1334 20.1446C16.9061 20.2798 16.6243 20.2853 16.3919 20.159L4.89194 13.909C4.59052 13.7452 4.43867 13.3977 4.52318 13.0652C4.6077 12.7328 4.90702 12.5 5.25007 12.5H16.7501C17.1643 12.5 17.5001 12.8358 17.5001 13.25V19.5Z"
              fill="#ffffff"
            />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  );
}
