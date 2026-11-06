import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { themeInitScript } from "@/components/ui/theme-toggle";
import { PRODUCT_NAME } from "@/lib/branding";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "A digital headquarters where human teams and AI employees work together within approved boundaries.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
