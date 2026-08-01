import type { Metadata } from "next";
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

import ConfigureAmplifyClientSide from "@/components/ConfigureAmplify";
import QueryProvider from "@/components/QueryProvider";

export const metadata: Metadata = {
  title: "Cloud Guardian",
  description: "AWS Infrastructure Management & Security",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConfigureAmplifyClientSide />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
