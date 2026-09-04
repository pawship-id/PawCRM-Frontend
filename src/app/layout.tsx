import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@/styles/globals.css";
import { AuthProvider } from "@/features/auth";

/**
 * Plus Jakarta Sans was drawn for the city of Jakarta's identity by an
 * Indonesian foundry — local without looking it, and its geometric bowls echo
 * the logo. Headings only.
 */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

/**
 * Inter takes body copy, interface labels, and every number: it survives 13px
 * on a cheap Android under fluorescent light, and its tabular figures keep
 * rupiah columns aligned.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Buloo",
  description: "Petshop Anda, tercatat rapi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
