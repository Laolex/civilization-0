import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Civilization-0", description: "A society whose citizens think on 0G." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
