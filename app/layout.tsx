import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "Hotel Search Assistant - AI-Powered Hotel Finder",
    template: "%s | Hotel Search Assistant",
  },
  description: "Find the perfect hotel in Melbourne, Sydney, or Brisbane using AI-powered semantic search. Get personalized hotel recommendations based on your preferences, budget, and location.",
  keywords: [
    "hotel search",
    "hotel finder",
    "AI hotel search",
    "Melbourne hotels",
    "Sydney hotels",
    "Brisbane hotels",
    "hotel booking",
    "hotel recommendations",
    "semantic search",
    "vector search",
  ],
  authors: [{ name: "Hotel Agent Team" }],
  creator: "Hotel Agent Team",
  publisher: "Hotel Agent Team",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://hotel-agent.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://hotel-agent.vercel.app",
    title: "Hotel Search Assistant - AI-Powered Hotel Finder",
    description: "Find the perfect hotel in Melbourne, Sydney, or Brisbane using AI-powered semantic search. Get personalized hotel recommendations based on your preferences, budget, and location.",
    siteName: "Hotel Search Assistant",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hotel Search Assistant - AI-Powered Hotel Finder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hotel Search Assistant - AI-Powered Hotel Finder",
    description: "Find the perfect hotel in Melbourne, Sydney, or Brisbane using AI-powered semantic search.",
    images: ["/og-image.png"],
    creator: "@hotelagent",
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
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
