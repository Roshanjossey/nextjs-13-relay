
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <head>
        <title>Github Issues: first-contributions</title>
      </head>
      <body>{children}</body>
    </html>
  );
}