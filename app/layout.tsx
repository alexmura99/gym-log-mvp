import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gym Log",
  description: "Mobiler Trainingsplaner und Workout-Logger für Krafttraining.",
  // Start vom iPhone-Home-Bildschirm im Vollbildmodus (ohne Browserleisten).
  appleWebApp: {
    capable: true,
    title: "Gym Log",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

// viewport-fit=cover: Inhalt reicht bis unter Statusleiste und Home-Balken; die
// safe-area-Abstände (env(safe-area-inset-*)) halten ihn davon fern.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
