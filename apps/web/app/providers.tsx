'use client';

import { AuthProvider } from '@/context/auth-context';
import { HomeCurrencyProvider } from '@/context/home-currency-context';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <HomeCurrencyProvider>
        {children}
        <Toaster />
      </HomeCurrencyProvider>
    </AuthProvider>
  );
}
