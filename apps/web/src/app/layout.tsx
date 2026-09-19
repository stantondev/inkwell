import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { getSessionSafe } from "@/lib/session";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2d4a8a" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a2e" },
  ],
};

export const metadata: Metadata = {
  title: { default: "Inkwell", template: "%s · Inkwell" },
  description: "A federated social journaling platform. Your journal, your friends, your space.",
  metadataBase: new URL("https://inkwell.social"),
  openGraph: {
    siteName: "Inkwell",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Inkwell — Social Journaling" }],
  },
  twitter: {
    site: "@inkwellsocial",
    card: "summary_large_image",
    images: ["/api/og"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Inkwell",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { session, unavailable } = await getSessionSafe();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Inkwell — Latest Entries"
          href="https://inkwell.social/api/explore/feed.xml"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Inkwell",
              url: "https://inkwell.social",
              description: "A federated social journaling platform.",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: "https://inkwell.social/search?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Inkwell",
              url: "https://inkwell.social",
              logo: "https://inkwell.social/inkwell-logo.svg",
              sameAs: ["https://twitter.com/inkwellsocial"],
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} ${lora.variable} antialiased`} suppressHydrationWarning>
        {/*
          Browser page translation (Chrome's built-in Google Translate, very
          common on Android) replaces text nodes with <font> wrappers. React
          then tries to remove or insert relative to nodes that are no longer
          where it left them and throws "Failed to execute 'removeChild' on
          'Node'", crashing the whole page. This took down /welcome for
          non-English signups. Tolerate the mismatch instead of throwing — the
          worst case is a stale translated string, not a dead page.
          See facebook/react#11538.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof Node!=="function"||!Node.prototype)return;var r=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c.parentNode!==this){return c}return r.apply(this,arguments)};var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,ref){if(ref&&ref.parentNode!==this){return i.call(this,n,null)}return i.apply(this,arguments)}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var o=localStorage.getItem("inkwell-sidebar-collapsed");if(o==="true"){localStorage.removeItem("inkwell-sidebar-collapsed");localStorage.setItem("inkwell-sidebar-hidden","true")}if(localStorage.getItem("inkwell-sidebar-hidden")==="true")document.body.setAttribute("data-sidebar-hidden","");if(localStorage.getItem("inkwell-eye-comfort")==="true")document.body.classList.add("eye-comfort")}catch(e){}`,
          }}
        />
        <AppShell user={session?.user ?? null} sessionUnavailable={unavailable}>
          {children}
        </AppShell>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
