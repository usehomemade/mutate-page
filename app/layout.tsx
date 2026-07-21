import type { Metadata, Viewport } from "next";

import "./globals.css";
import "@xyflow/react/dist/style.css";
import "./world.css";

export const metadata: Metadata = {
  title: {
    default: "Mutate Page",
    template: "%s · Mutate Page",
  },
  description: "One public web page, evolving one mutation at a time.",
  icons: { icon: "/mark.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-mode="light">
      <body>{children}</body>
    </html>
  );
}
