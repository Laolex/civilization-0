import "./globals.css";
import type { ReactNode } from "react";
import { SiteNav } from "../components/SiteNav";
import { SiteFooter } from "../components/SiteFooter";
import { getCurrentUser } from "../lib/auth";

export const metadata = { title: "Civilization-0", description: "A society whose citizens think on 0G." };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolve auth for the nav, but never let a cold DB break page render.
  let signedIn = false;
  try {
    signedIn = !!(await getCurrentUser());
  } catch {
    signedIn = false;
  }
  return (
    <html lang="en">
      <body>
        <SiteNav signedIn={signedIn} />
        <div className="site-content">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
