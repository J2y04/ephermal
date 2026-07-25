import type { Metadata } from 'next';
import Providers from '../components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ephermal: AI Marketing Agent for Shopify',
    template: '%s | Ephermal',
  },
  description:
    'Ephermal is the AI marketing agent for Shopify stores. Automate Meta Ads, Google Ads, generate UGC, track profit margins, spy on competitors, and compound ROAS, all from one dashboard. Setup in under 3 minutes.',
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
  authors: [{ name: 'Interlink Platforms', url: 'https://ephermal.app' }],
  creator: 'Interlink Platforms',
  publisher: 'Interlink Platforms',
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
      '@id': 'https://ephermal.app/#organization-parent',
      name: 'Interlink Platforms',
      description: 'Interlink Platforms is the company that develops and operates Ephermal.',
    },
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
        'Ephermal is an AI marketing agent, developed by Interlink Platforms, that automates Meta Ads, Google Ads, UGC ad copy, profit tracking, and competitor intelligence for Shopify stores.',
      sameAs: ['https://ephermal.app', 'https://twitter.com/ephermal'],
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@ephermal.app',
        contactType: 'customer support',
      },
      foundingDate: '2026',
      areaServed: 'Worldwide',
      parentOrganization: { '@id': 'https://ephermal.app/#organization-parent' },
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
        'Ephermal automates your entire Shopify marketing stack. Meta Ads, Google Ads, UGC creation, profit tracking, competitor intelligence, all AI-powered from one dashboard.',
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
          name: 'Do I need any ad experience to use Ephermal?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "No experience required. Ephermal is built specifically for Shopify store owners who have never run a paid ad in their life. You connect your store, and the AI handles audience research, creative writing, campaign setup, and budget management. You review and approve. That's it.",
          },
        },
        {
          '@type': 'Question',
          name: 'My store is very new. Can I still use Ephermal?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Ephermal is designed for stores at the earliest stage. Whether you've made 10 sales or 10,000, the AI reads your catalog and builds a campaign strategy around what you actually have. The sooner you start running real ads, the sooner you find out what the market wants.",
          },
        },
        {
          '@type': 'Question',
          name: 'How much should I spend on ads to start?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "You set your own ad budget. Ephermal never charges against your ad spend. Most early-stage stores start with $10 to $30 a day on Meta to test what converts. Ephermal's job is to make every dollar of that spend smarter: better audiences, better creatives, better signals on what to scale.",
          },
        },
        {
          '@type': 'Question',
          name: 'Do I need a Shopify store to use Ephermal?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Ephermal connects directly to your Shopify store via OAuth. You authorise access from inside your Ephermal dashboard in about 90 seconds. Your products, pricing, inventory and store data sync instantly and stay live.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which ad platforms does Ephermal support?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'All plans include Meta Ads automation (Facebook and Instagram) via the official Meta Marketing API. Growth and Scale plans also unlock Google Search Ads via the Google Ads API. Everything is managed from one dashboard.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does the AI content engine work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Ephermal reads your live product catalog and generates creator-style ad scripts, hooks, headlines, and copy tailored to your actual products. These are not templates. Every brief is written specifically for your store and audience. You review and approve before anything goes live.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I approve creatives before they launch?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Every creative generated by Ephermal goes through your approval queue first. You can approve, reject, or request a regeneration before anything is published to your ad accounts. You stay in full control at all times.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is Competitor Radar?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Competitor Radar searches the Meta Ad Library for active ads in your niche. You enter a keyword or brand name and it surfaces what competitors are running right now. The AI then breaks down the hook type, target emotion, and CTA, then writes a counter-strategy so you can position against them before you spend a dollar.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does profit-aware campaign optimisation work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Enter your cost of goods (COGS) for each product and Ephermal recalculates true profitability per campaign, not just revenue or ROAS. A 5x ROAS on a 10% margin product is less profitable than 2x on a 70% margin product. Profit Tracker makes that visible, and Ephermal\'s AI uses it to recommend where to shift budget. You review and approve every change before it goes live.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is billing handled?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Billing is handled directly through Ephermal via Stripe, separate from your Shopify billing. You subscribe monthly and can cancel any time from your dashboard. No agency fees, no hidden costs, no minimum contract.',
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
