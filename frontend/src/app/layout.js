import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#050505' },
  ],
};

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://auditpro.ai'),
  title: {
    default: "AuditPro — Autonomous Technical SEO, AEO & GEO Intelligence Suite",
    template: "%s | AuditPro SEO Suite",
  },
  description:
    "Website audit for SEO and AI search: 32 technical checks, Core Web Vitals, AI answer readiness and local search, with plain-language fixes and client-ready reports.",
  keywords: [
    "Technical SEO Audit",
    "AEO Audit",
    "GEO Local Search Optimization",
    "Technical SEO Crawler",
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
      "Website audit for SEO and AI search: 32 technical checks, Core Web Vitals, AI answer readiness and local search, with plain-language fixes and client-ready reports.",
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
    featureList: [
      "Technical SEO Crawler",
      "AEO Voice & LLM Readiness Analyzer",
      "GEO Local Search & NAP Consistency Diagnostics",
      "Core Web Vitals Real-Time Speed Benchmarks",
      "Google Search Console & GA4 Integration",
      "Executive PDF Audit Reports",
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

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.svg" type="image/svg+xml" />
        {/* Anti-FOUC theme detector to eliminate flash before React mount */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('auditpro_theme');
                  var theme = stored || 'system';
                  var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.documentElement.style.colorScheme = 'dark';
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                    document.documentElement.style.colorScheme = 'light';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {/* Structured Data for SEO, AEO, and GEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSoftware) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganization) }}
        />
      </head>
      <body
        className="min-h-full flex flex-col font-sans bg-background text-foreground selection:bg-indigo-500/20 selection:text-indigo-400 antialiased transition-colors duration-200"
        suppressHydrationWarning
      >
        <AuthProvider>
          {children}
        </AuthProvider>

        {/* Global Toast Alerts */}
        <Toaster
          position="bottom-right"
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
