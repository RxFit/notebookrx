import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-inter", weight: ["300","400","500","600","700"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400","500","700"] });

export const metadata: Metadata = {
  title: "notebook.blue — AI research, grounded in your sources",
  description: "Upload documents, ask questions, get cited answers. notebook.blue is your AI research assistant.",
  keywords: "AI, research, RAG, document analysis, knowledge base, notebook",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Material Symbols Rounded */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var t = localStorage.getItem('notebook_blue_theme') || 'dark';
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
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
          <Toaster position="bottom-right" richColors closeButton />
        </QueryClientProvider>
      </body>
    </html>
  );
}
