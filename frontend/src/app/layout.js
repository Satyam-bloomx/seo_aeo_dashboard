import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://auditpro.ai'),
  title: {
    default: "AuditPro — Autonomous Technical SEO, AEO & GEO Intelligence Suite",
    template: "%s | AuditPro SEO Suite",
  },
  description:
    "Enterprise Screaming Frog crawler engine with 32 technical parameters, Core Web Vitals, AEO Voice & LLM Readiness, and Local GEO Search diagnostics.",
  keywords: [
    "Technical SEO Audit",
    "AEO Audit",
    "GEO Local Search Optimization",
    "Screaming Frog Alternative",
    "AI Engine Optimization",
    "Perplexity LLM Citation Audit",
    "Google AI Overviews Optimization",
    "Core Web Vitals Analyzer",
    "Schema Markup Validator",
    "Page Speed Insights Integration",
  ],
  authors: [{ name: "AuditPro Engineering Team" }],
  creator: "AuditPro",
  publisher: "AuditPro Intelligence",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon.svg", sizes: "180x180", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "AuditPro — Autonomous Technical SEO, AEO & GEO Audit Suite",
    description:
      "Enterprise Screaming Frog rules crawler engine with 32 technical parameters, Core Web Vitals, AEO Voice & LLM Readiness, and Local GEO Search diagnostics.",
    url: "https://auditpro.ai",
    siteName: "AuditPro SEO Suite",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AuditPro — Enterprise Technical SEO, AEO and GEO Audit Engine",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AuditPro — Technical SEO, AEO & GEO Audit Suite",
    description:
      "Real-time technical website crawler with 32 rules, Core Web Vitals, AI Engine readiness (AEO), and Local GEO diagnostics.",
    images: ["/og-image.png"],
    creator: "@AuditProAI",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://auditpro.ai",
  },
};

export default function RootLayout({ children }) {
  const jsonLdSoftware = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AuditPro SEO, AEO & GEO Audit Engine",
    operatingSystem: "All",
    applicationCategory: "BusinessApplication, DeveloperApplication",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "1480",
    },
    featureList: [
      "32-Rule Technical SEO Crawler",
      "AEO Voice & LLM Readiness Analyzer",
      "GEO Local Search & NAP Consistency Diagnostics",
      "Core Web Vitals Real-Time Speed Benchmarks",
      "Google Search Console & GA4 Integration",
      "Instant Executive PDF Audit Certificates",
    ],
  };

  const jsonLdOrganization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "AuditPro",
    url: "https://auditpro.ai",
    logo: "https://auditpro.ai/icon.svg",
    sameAs: [
      "https://twitter.com/AuditProAI",
      "https://github.com/Satyam-bloomx/seo_aeo_dashboard",
    ],
  };

  const jsonLdFAQ = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is an AEO (Answer Engine Optimization) Audit?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "An AEO audit evaluates your content structure, schema markup, and direct extractability to ensure AI search engines (ChatGPT Search, Perplexity, Google AI Overviews) cite and feature your website.",
        },
      },
      {
        "@type": "Question",
        name: "How does AuditPro perform technical website crawling?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AuditPro uses a high-performance Python crawl engine with headless Chromium to extract status codes, meta directives, canonicals, H1 hierarchy, structured data, Core Web Vitals, and internal link equity across 32 enterprise parameters.",
        },
      },
      {
        "@type": "Question",
        name: "What is GEO (Generative Engine Optimization) for Local Search?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "GEO ensures your local business signals, NAP (Name, Address, Phone) consistency, and Google Business Profile links are optimized for AI-driven local recommendations and Google Maps 3-pack rankings.",
        },
      },
    ],
  };

  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.svg" type="image/svg+xml" />
        {/* Structured Data for SEO, AEO, and GEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSoftware) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganization) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }}
        />
      </head>
      <body
        className="min-h-full flex flex-col font-sans bg-[#F8FAFC] text-slate-900 selection:bg-indigo-500/15 selection:text-indigo-900"
        suppressHydrationWarning
      >
        {children}

        {/* Global Toast Alerts */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand
          visibleToasts={4}
          gap={10}
          offset={18}
          duration={4200}
          toastOptions={{
            style: {
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 10px 30px -5px rgba(15, 23, 42, 0.12)",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              fontWeight: "600",
            },
          }}
        />
      </body>
    </html>
  );
}
