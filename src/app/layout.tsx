import './globals.css'
import '../styles/fonts.css'
import '../styles/animations.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

const inter = Inter({ subsets: ['latin'] });

const site = 'https://afalstore.com';

export const metadata: Metadata = {
  title: 'Mini GPS & Bluetooth Trackers in Pakistan | Cash on Delivery – Afal Store',
  description:
    'Buy mini GPS & Bluetooth trackers in Pakistan with Cash on Delivery. 24–48h dispatch, easy returns, and local support. Shop trusted smart tech at Afal Store.',
  alternates: {
    canonical: site,
  },
  openGraph: {
    url: site,
    title: 'Mini GPS & Bluetooth Trackers in Pakistan | Cash on Delivery – Afal Store',
    description:
      'Buy mini GPS & Bluetooth trackers in Pakistan with Cash on Delivery. 24–48h dispatch, easy returns, and local support. Shop trusted smart tech at Afal Store.',
    siteName: 'Afal Store',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mini GPS & Bluetooth Trackers in Pakistan | Cash on Delivery – Afal Store',
    description:
      'Buy mini GPS & Bluetooth trackers in Pakistan with Cash on Delivery. 24–48h dispatch, easy returns, and local support. Shop trusted smart tech at Afal Store.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
