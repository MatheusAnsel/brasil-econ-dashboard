import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brasil Econ Dashboard",
  description: "Selic, inflação e câmbio: séries históricas do Banco Central com análise de correlação.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
