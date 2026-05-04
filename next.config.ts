import type { NextConfig } from 'next';

// CSP: script/style permissivos para Next.js + Tailwind inline;
// imagens abertas (RSS feeds vêm de qualquer domínio);
// conexões limitadas a self + Supabase
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",          // Next.js requer ambos
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",                         // imagens de feeds RSS
  `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} https://generativelanguage.googleapis.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy',  value: CSP },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },

  // Permite acesso da rede local durante desenvolvimento
  allowedDevOrigins: ['192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co',          pathname: '/**' },
      { protocol: 'https', hostname: 's2-g1.glbimg.com',      pathname: '/**' },
      { protocol: 'https', hostname: 'admin.cnnbrasil.com.br', pathname: '/**' },
      { protocol: 'https', hostname: 's.w.org',               pathname: '/**' },
      { protocol: 'https', hostname: 'img.youtube.com',       pathname: '/**' },
      { protocol: 'https', hostname: 'files.tecnoblog.net',   pathname: '/**' },
    ],
  },
};

export default nextConfig;
