import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter is the documented open-source stand-in for SF Pro (see DESIGN-apple.md
// "Note on Font Substitutes"). system-ui/-apple-system still wins on Apple
// devices via the Tailwind font stack; Inter only kicks in elsewhere.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "배포 관리 시스템",
  description: "홈페이지운영 배포관리 목록",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
