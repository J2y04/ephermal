import type { Metadata } from 'next';
import Providers from '../components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ephermal — AI-Powered Advertising for Shopify',
  description: 'Ephermal connects directly to your Shopify store and autonomously creates real UGC ads, launches campaigns across Meta and Google Ads — and optimizes everything live.',
  keywords: ['AI advertising', 'Shopify ads', 'Meta ads', 'Facebook ads', 'Instagram ads', 'Google ads', 'UGC generation', 'ad automation', 'ROAS optimization', 'e-commerce marketing'],
  authors: [{ name: 'Ephermal' }],
  openGraph: {
    title: 'Ephermal — AI-Powered Advertising for Shopify',
    description: 'AI-powered Meta & Google Ads, UGC generation, and store analysis for Shopify brands.',
    url: 'https://ephermal.app',
    siteName: 'Ephermal',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Ephermal — AI Advertising Agent' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ephermal — AI-Powered Advertising for Shopify',
    description: 'AI-powered Meta & Google Ads, UGC generation, and store analysis for Shopify brands.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
  metadataBase: new URL('https://ephermal.app'),
  icons: {
    icon: '/ephermal_transparent.ico',
    shortcut: '/ephermal_transparent.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
