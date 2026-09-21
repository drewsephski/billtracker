import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/lib/client/theme";
import { ThemeSync } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f7fa",
};

export const metadata: Metadata = {
  applicationName: "Homeshare",
  appleWebApp: { capable: true, title: "Homeshare", statusBarStyle: "default" },
  // Next emits mobile-web-app-capable from appleWebApp; retain iOS compatibility too.
  other: { "apple-mobile-web-app-capable": "yes" },
  title: {
    default: "Homeshare — A little less bill stress",
    template: "%s · Homeshare",
  },
  description:
    "Shared home. Clear bills. One friendly place for roommates to see what’s due and who’s paid.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
