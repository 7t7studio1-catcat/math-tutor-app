import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "스마트풀이 | AI 수학 해설",
  description: "수학 문제를 찍으면 3단계 완벽 해설 — 실전풀이 · 해체분석 · 숏컷",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var d = document.documentElement;
              var t = localStorage.getItem('theme');
              if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                d.classList.add('dark');
              }
            } catch(e){}
          })();
        `}} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
