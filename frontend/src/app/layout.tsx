import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NotebookRx — AI Research Assistant",
  description: "Deterministic RAG-based AI assistant. Upload documents, ask questions grounded in your sources. Zero hallucinations.",
  keywords: "AI, research, RAG, document analysis, NotebookLM, NotebookRx",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} data-theme="dark" suppressHydrationWarning>
      <head>
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
