import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SwiTF01-hit3 — Project Management',
  description: 'Enterprise project management platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50">{children}</body>
    </html>
  );
}
