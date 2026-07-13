'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

const RESEND_SECONDS = 30;

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!isLoading && user) router.replace('/trips');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      // Same flow as apps/mobile/app/auth.tsx — email OTP is the only auth
      // method on every platform (ADR 0004).
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      setStep('code');
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (otp: string) => {
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp,
        type: 'email',
      });
      if (err) throw err;
      router.replace('/trips');
    } catch (e) {
      setCode('');
      setError(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Shmoves</CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Sign in with your email — we’ll send you a 6-digit code.'
              : `Enter the code we sent to ${email.trim().toLowerCase()}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 'email' ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>
              <Button type="submit" disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : 'Send code'}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
                onComplete={verifyCode}
                disabled={busy}
                autoFocus
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <div className="flex w-full flex-col gap-2">
                <Button
                  variant="ghost"
                  disabled={busy || resendIn > 0}
                  onClick={sendCode}
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}
                >
                  Use a different email
                </Button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
