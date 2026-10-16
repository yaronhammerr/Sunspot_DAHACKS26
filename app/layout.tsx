import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunspot — Find your outside",
  description: "Discover nearby Bay Area viewpoints, personalized for your kind of scenery.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sunspot", statusBarStyle: "default" },
  icons: {
    icon: "/brand/sunspot-icon.png",
    shortcut: "/brand/sunspot-icon.png",
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#faf8f4" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
