import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { getSession } from "@/lib/session";

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
  openGraph: { siteName: "Inkwell", type: "website" },
  twitter: { site: "@inkwellsocial" },
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
  const session = await getSession();

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
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var o=localStorage.getItem("inkwell-sidebar-collapsed");if(o==="true"){localStorage.removeItem("inkwell-sidebar-collapsed");localStorage.setItem("inkwell-sidebar-hidden","true")}if(localStorage.getItem("inkwell-sidebar-hidden")==="true")document.body.setAttribute("data-sidebar-hidden","")}catch(e){}`,
          }}
        />
        <AppShell user={session?.user ?? null}>
          {children}
        </AppShell>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
