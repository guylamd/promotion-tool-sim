import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Promotion Simulator",
  description: "Read a promotion sheet, validate it, and simulate results fast.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
