import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FlowPi | Commerce Operations",
  description:
    "Bangladesh commerce operations sandbox. Live sending is disabled.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
