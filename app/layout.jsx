import './globals.css';

export const metadata = {
  title: 'shrey · trajectory',
  description: 'Live, multi-user Claude Code trajectory dashboard.',
  icons: {
    icon:
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='9' fill='%23050505'/><circle cx='16' cy='16' r='6.5' fill='none' stroke='%236ee7b7' stroke-width='1.5'/><circle cx='16' cy='16' r='2' fill='%23a5b4fc'/></svg>"
  }
};

export const viewport = { colorScheme: 'dark' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
