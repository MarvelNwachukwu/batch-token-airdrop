import { Header } from './Header';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-6 py-8">
        {children}
      </main>
      <footer className="border-t border-border py-6 mt-auto">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          © 2025 IQ AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
