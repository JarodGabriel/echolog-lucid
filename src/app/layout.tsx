import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echolog Lucid",
  description: "Phone access to recent Granola and Fathom meeting notes.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Echolog Lucid",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#155e63",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
