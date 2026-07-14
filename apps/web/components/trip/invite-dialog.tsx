'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useTrips } from '@/context/trips-context';

export function InviteDialog({
  open,
  onOpenChange,
  tripId,
  destination,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  destination: string;
}) {
  const { inviteToTrip, inviteByUsername } = useTrips();

  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setLink(null);
      setCopied(false);
      setUsername('');
    }
  }, [open]);

  const createLink = async () => {
    setBusy(true);
    try {
      const token = await inviteToTrip(tripId);
      // ADR 0007: invite URLs are web URLs. Use this deployment's origin so
      // the link works in dev and on shmoves.app alike.
      setLink(`${window.location.origin}/invite/${token}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the invite link.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the link and copy it manually.');
    }
  };

  const sendUsernameInvite = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await inviteByUsername(tripId, trimmed);
      toast.success(`Invited @${trimmed} — they'll see the trip next time they open Shmoves.`);
      setUsername('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the invite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to {destination}</DialogTitle>
          <DialogDescription>
            Anyone who joins can see and edit the whole trip.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Invite link</Label>
            {link ? (
              <div className="flex gap-2">
                <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="icon" onClick={copyLink} aria-label="Copy link">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={createLink} disabled={busy}>
                {busy ? 'Creating…' : 'Create invite link'}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Share it anywhere — each link can be used once.
            </p>
          </div>
          <Separator />
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendUsernameInvite();
            }}
          >
            <Label htmlFor="invite-username">Invite by username</Label>
            <div className="flex gap-2">
              <Input
                id="invite-username"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !username.trim()}>
                Invite
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
