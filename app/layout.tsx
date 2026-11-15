import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const inter = localFont({
  src: "./fonts/InterVariable.ttf",
  variable: "--font-geist-sans",
  display: "swap",
});
export const metadata: Metadata = {
  title: "KitobFlow — библиотека в одном потоке",
  description:
    "Современное рабочее пространство библиотеки. Читатели, книги, выдачи и посещения.",
};
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
