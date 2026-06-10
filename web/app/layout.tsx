import type { Metadata } from 'next';
import Script from 'next/script';
import Providers from '../components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ephermal: AI Advertising Agent for Shopify',
    template: '%s | Ephermal',
  },
  description:
    'Ephermal is the AI advertising agent for Shopify stores. Automate Meta Ads and Google Ads, generate real UGC videos, and compound ROAS, all from one dashboard. Setup in under 3 minutes.',
  keywords: [
    'Ephermal',
    'Ephermal app',
    'ephermal.app',
    'AI advertising agent',
    'Shopify ads automation',
    'Meta Ads automation',
    'Facebook Ads AI',
    'Instagram Ads automation',
    'Google Ads automation',
    'UGC video generation',
    'ad automation Shopify',
    'ROAS optimization',
    'AI marketing tool',
    'e-commerce ad automation',
    'Shopify marketing AI',
    'DTC advertising tool',
  ],
  authors: [{ name: 'Ephermal', url: 'https://ephermal.app' }],
  creator: 'Ephermal',
  publisher: 'Ephermal',
  category: 'technology',
  applicationName: 'Ephermal',
  alternates: {
    canonical: 'https://ephermal.app/',
  },
  openGraph: {
    title: 'Ephermal: AI Advertising Agent for Shopify',
    description:
      'Automate Meta Ads, Google Ads and UGC creation for your Shopify store with AI. From install to live campaigns in under 60 seconds.',
    url: 'https://ephermal.app',
    siteName: 'Ephermal',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: 'https://ephermal.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ephermal: AI Advertising Agent for Shopify',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ephermal',
    creator: '@ephermal',
    title: 'Ephermal: AI Advertising Agent for Shopify',
    description:
      'Automate Meta Ads, Google Ads and UGC creation for your Shopify store with AI.',
    images: ['https://ephermal.app/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  metadataBase: new URL('https://ephermal.app'),
  icons: {
    icon: '/ephermal_transparent.ico',
    shortcut: '/ephermal_transparent.ico',
    apple: '/ephermal.png',
  },
  verification: {
    google: 'Ma33K9sWndhjW6Tq7lZ1J22xZfHe9k1RQl5JuI4enU0',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://ephermal.app/#organization',
      name: 'Ephermal',
      url: 'https://ephermal.app',
      logo: {
        '@type': 'ImageObject',
        url: 'https://ephermal.app/ephermal.png',
        width: 512,
        height: 512,
      },
      description:
        'Ephermal is an AI advertising agent that automates Meta Ads, Google Ads, and UGC video creation for Shopify stores.',
      sameAs: ['https://ephermal.app'],
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@ephermal.app',
        contactType: 'customer support',
      },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://ephermal.app/#website',
      url: 'https://ephermal.app',
      name: 'Ephermal',
      description: 'AI Advertising Agent for Shopify Stores',
      publisher: { '@id': 'https://ephermal.app/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://ephermal.app/?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://ephermal.app/#app',
      name: 'Ephermal',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://ephermal.app',
      description:
        'Ephermal automates your Shopify advertising. Connect Meta Ads and Google Ads. The AI creates real UGC video ads, launches campaigns, and optimises ROAS around the clock.',
      offers: [
        {
          '@type': 'Offer',
          name: 'Starter',
          price: '89',
          priceCurrency: 'USD',
          billingPeriod: 'P1M',
        },
        {
          '@type': 'Offer',
          name: 'Growth',
          price: '199',
          priceCurrency: 'USD',
          billingPeriod: 'P1M',
        },
        {
          '@type': 'Offer',
          name: 'Scale',
          price: '349',
          priceCurrency: 'USD',
          billingPeriod: 'P1M',
        },
      ],
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        reviewCount: '240',
        bestRating: '5',
      },
      publisher: { '@id': 'https://ephermal.app/#organization' },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="canonical" href="https://ephermal.app/" />
        <meta name="theme-color" content="#04050f" />
      </head>
      <body>
        <Script
          id="json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          strategy="beforeInteractive"
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
