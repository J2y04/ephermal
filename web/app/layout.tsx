import type { Metadata } from 'next';
import Providers from '../components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ephermal: AI Marketing Agent for Shopify',
    template: '%s | Ephermal',
  },
  description:
    'Ephermal is the AI marketing agent for Shopify stores. Automate Meta Ads, Google Ads, generate UGC, track profit margins, spy on competitors, and compound ROAS — all from one dashboard. Setup in under 3 minutes.',
  keywords: [
    'Ephermal',
    'Ephermal app',
    'ephermal.app',
    'AI marketing agent',
    'Shopify marketing automation',
    'Shopify ads automation',
    'Meta Ads automation',
    'Facebook Ads AI',
    'Instagram Ads automation',
    'Google Ads automation',
    'UGC video generation',
    'ad automation Shopify',
    'ROAS optimization',
    'AI marketing tool',
    'e-commerce marketing automation',
    'Shopify marketing AI',
    'DTC marketing platform',
    'competitor ad spy',
    'creative brief AI',
    'profit margin tracking',
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
    title: 'Ephermal: AI Marketing Agent for Shopify',
    description:
      'Automate Meta Ads, Google Ads, UGC creation, profit tracking and competitor intelligence for your Shopify store. From install to live campaigns in under 3 minutes.',
    url: 'https://ephermal.app',
    siteName: 'Ephermal',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: 'https://ephermal.app/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ephermal: AI Marketing Agent for Shopify',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ephermal',
    creator: '@ephermal',
    title: 'Ephermal: AI Marketing Agent for Shopify',
    description:
      'Automate Meta Ads, Google Ads, UGC and competitor intelligence for your Shopify store with AI.',
    images: ['https://ephermal.app/og-image.jpg'],
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
    icon: '/favicon.ico?v=2',
    shortcut: '/favicon.ico?v=2',
    apple: '/ephermal.jpg',
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
        url: 'https://ephermal.app/ephermal.jpg',
        width: 512,
        height: 512,
      },
      description:
        'Ephermal is an AI marketing agent that automates Meta Ads, Google Ads, UGC creation, profit tracking, and competitor intelligence for Shopify stores.',
      sameAs: ['https://ephermal.app', 'https://twitter.com/ephermal'],
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@ephermal.app',
        contactType: 'customer support',
      },
      foundingDate: '2026',
      areaServed: 'Worldwide',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://ephermal.app/#website',
      url: 'https://ephermal.app',
      name: 'Ephermal',
      description: 'AI Marketing Agent for Shopify Stores',
      publisher: { '@id': 'https://ephermal.app/#organization' },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://ephermal.app/#app',
      name: 'Ephermal',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://ephermal.app',
      description:
        'Ephermal automates your entire Shopify marketing stack. Meta Ads, Google Ads, UGC creation, profit tracking, competitor intelligence — all AI-powered from one dashboard.',
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
      publisher: { '@id': 'https://ephermal.app/#organization' },
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://ephermal.app/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Do I need a Shopify store to use Ephermal?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Ephermal connects directly to your Shopify store via OAuth — no app store required. Your products, pricing and store data sync instantly.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does the UGC ad generation work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Our AI analyses your products and brand, then generates authentic creator-style ad scripts and copy. You review and approve before anything goes live.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which ad platforms does Ephermal support?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Ephermal fully supports Meta Ads (Facebook and Instagram) and Google Ads (Search, Shopping, Performance Max). Campaigns are created via official APIs from a single dashboard.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I approve creatives before they launch?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes — every creative generated by Ephermal goes through your approval queue first. You can approve, reject, or request a regeneration before anything is published.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is billing handled?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Billing is handled directly through Ephermal via Stripe. You subscribe monthly and can cancel any time from your dashboard. No agency fees, no hidden costs.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is Competitor Radar?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Competitor Radar uses the Meta Ad Library to surface active ads from competitors in your niche. The AI then analyses their hooks, angles, and CTAs so you can build counter-campaigns.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does profit-aware campaign optimisation work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Enter your cost of goods (COGS) per product and Ephermal optimises campaigns for actual net profit — not just ROAS. A 5x ROAS on a 10% margin product is worse than 2x on a 70% margin product. Ephermal knows the difference.',
          },
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="canonical" href="https://ephermal.app/" />
        <meta name="theme-color" content="#04050f" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
