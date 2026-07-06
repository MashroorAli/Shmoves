# Apple → Email OTP User Migration (ADR 0004)

Start this **now** — it's the only Phase 0 step gated on other humans
responding, and it blocks Phase 1 (removing Apple Sign-In).

## Step 1 — Identify Apple users

Supabase Dashboard → SQL editor:

```sql
select u.id, u.email, p.name, p.username, p.phone,
       u.raw_app_meta_data->>'provider' as provider,
       u.raw_app_meta_data->'providers' as providers
from auth.users u
left join profiles p on p.id = u.id
order by u.created_at;
```

Flag anyone whose provider list includes `apple`. Emails ending in
`@privaterelay.appleid.com` are Apple relay addresses — **OTP cannot be relied
on to reach these**, and users generally don't know the relay address. Those
users MUST provide a real email.

## Step 2 — Collect real emails

Message each Apple user directly (there are <5 — text them):

> Shmoves is moving to email sign-in so it works on the web too. Reply with
> the email you want to use to log in, and you're set — nothing else changes.

## Step 3 — Update auth records

For each user, in the SQL editor (or via the Admin API):

```sql
-- Replace the values per user.
update auth.users
set email = 'real.email@example.com',
    email_confirmed_at = now()
where id = '<user-uuid>';

update profiles
set email = 'real.email@example.com'
where id = '<user-uuid>';
```

Verify afterwards that no `@privaterelay.appleid.com` emails remain:

```sql
select id, email from auth.users where email ilike '%privaterelay.appleid.com';
```

## Step 4 — Test one account

Have one migrated user (or a test account) sign in with email OTP **before**
Phase 1 removes Apple Sign-In. Both methods work during the transition, so
there's no lockout risk while this is in flight.

## Step 5 — Done when

- [ ] Every Apple user has a real, confirmed email on `auth.users`
- [ ] At least one migrated user has successfully logged in via OTP
- [ ] Then Phase 1 may remove Apple Sign-In from the app
