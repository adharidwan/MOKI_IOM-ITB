import type { Metadata } from "next";
import ThemeRegistry from "./components/ThemeRegistry";
import SsoProvider from "./components/SsoProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "IOM4 Messaging Dashboard",
  description: "Kelola kontak dan kirim blast message dengan alur yang sederhana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">
        <ThemeRegistry>
          <SsoProvider>{children}</SsoProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
