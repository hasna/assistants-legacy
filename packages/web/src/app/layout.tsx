import './globals.css';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Inter, Outfit, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Assistants — Your AI assistant, in the terminal',
  description: 'A personal AI assistant that connects to your tools and extends with skills and hooks. Open source, powered by Claude.',
  keywords: ['AI assistant', 'terminal', 'CLI', 'Claude', 'Anthropic', 'open source'],
  authors: [{ name: 'Hasna' }],
  openGraph: {
    type: 'website',
    title: 'Assistants',
    description: 'Your AI assistant, in the terminal.',
    siteName: 'Assistants',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Assistants',
    description: 'Your AI assistant, in the terminal.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="rtl" suppressHydrationWarning className={`${inter.variable} ${outfit.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-background font-[family-name:var(--font-body)] text-foreground antialiased">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
