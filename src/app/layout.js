import './globals.css';

export const metadata = {
  title: 'Gmail Deliverability Dashboard',
  description: 'Real-time deliverability testing like GMass Inbox',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
