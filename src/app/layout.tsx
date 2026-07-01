import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Nurse Application Cockpit',
  description:
    'Assisted, human-in-the-loop operator cockpit for helping internationally-qualified RNs apply to Australian jobs.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
