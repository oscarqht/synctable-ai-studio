import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synctable - Workspace Dashboard",
  description: "Cross-browser tree backup and workspace synchronization utility",
  icons: {
    icon: "/logo.png",
    shortcut: "/favicon.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-surface text-on-surface font-body-lg min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
