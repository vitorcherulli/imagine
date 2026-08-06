import type { Metadata } from "next";
import { ClerkRootProvider } from "@/components/ClerkRootProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { DEFAULT_APP_THEME } from "@/lib/app-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imagine — Story Timeline",
  description: "AI-powered story creator with a Premiere-Pro-style timeline.",
};

const themeBootScript = `(function(){try{var t=localStorage.getItem("imagine-app-theme");var v=(t==="light-all"||t==="dark"||t==="light")?t:"${DEFAULT_APP_THEME}";document.documentElement.setAttribute("data-theme",v);document.documentElement.style.colorScheme=(v==="dark")?"dark":"light";}catch(e){document.documentElement.setAttribute("data-theme","${DEFAULT_APP_THEME}");}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground" suppressHydrationWarning>
        <ClerkRootProvider>
          <ThemeProvider>{children}</ThemeProvider>
          <Toaster />
        </ClerkRootProvider>
      </body>
    </html>
  );
}
