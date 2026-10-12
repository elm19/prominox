import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Noto_Serif, Public_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppProviders } from "@/components/providers/app-providers";

const publicSansHeading = Public_Sans({subsets:['latin'],variable:'--font-heading'});

const notoSerif = Noto_Serif({subsets:['latin'],variable:'--font-serif'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prominox",
  description: "Prominox digital factory platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-serif", notoSerif.variable, publicSansHeading.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (() => {
              const saved = window.localStorage.getItem('theme');
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (saved === 'dark' || (!saved && prefersDark)) {
                document.documentElement.classList.add('dark');
              }
            })();
          `}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
