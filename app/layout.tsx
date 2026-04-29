import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Promotion Simulator",
  description: "Read a promotion sheet, validate it, and simulate results fast.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value === "dark" ? "dark" : "light";
  const themeClass = theme === "dark" ? "theme-dark" : "";

  return (
    <html lang="en" data-theme={theme} className={themeClass}>
      <body data-theme={theme} className={themeClass}>
        {children}
      </body>
    </html>
  );
}
