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
  title: "AuditPro — Technical SEO, AEO & GEO Audit Suite",
  description: "Enterprise Screaming Frog rules crawler engine with 32 technical parameters, Core Web Vitals, AEO Voice & LLM Readiness, and Local GEO Search diagnostics.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#F8FAFC] text-slate-900 selection:bg-indigo-500/15 selection:text-indigo-900" suppressHydrationWarning>
        {children}
        {/*
          Sonner ships its own spring-stacked enter/exit motion. We only tune
          the presentation and stack behaviour here - `expand` fans the stack
          out on hover instead of keeping it collapsed, which makes multiple
          crawler alerts readable without a click.
        */}
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
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 10px 30px -5px rgba(15, 23, 42, 0.12)',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: '600',
            },
          }}
        />
      </body>
    </html>
  );
}
