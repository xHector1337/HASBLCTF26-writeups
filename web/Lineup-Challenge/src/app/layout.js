import "./globals.css";

export const metadata = {
  title: "LINEUP CHALLENGE",
  description: "Can you find the perfect XI?",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
