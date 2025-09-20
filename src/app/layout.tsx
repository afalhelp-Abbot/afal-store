import './globals.css'
import '../styles/fonts.css'
import '../styles/animations.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Afal Store - Ultimate Shopping Store',
  description: 'Your one-stop shop for smart tech accessories in Pakistan',
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
