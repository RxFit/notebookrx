import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const robotoMono = Roboto_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "NotebookRx - AI Research Assistant",
  description: "Deterministic RAG-based AI assistant. Upload documents, ask questions grounded in your sources. Zero hallucinations.",
  keywords: "AI, research, RAG, document analysis, NotebookLM, NotebookRx",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Material Symbols Rounded — replaces emoji icon placeholders (#19) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var t = localStorage.getItem('notebookrx_theme') || 'dark';
                var resolved = t === 'system'
                  ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                  : t;
                document.documentElement.setAttribute('data-theme', resolved);
              } catch(e) {}
            })();
          `
        }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}