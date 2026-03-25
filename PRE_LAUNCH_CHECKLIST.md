# Shmoves — Pre-Launch Checklist

## 🔐 Auth & Security
- [ ] Replace phone/SMS auth (Twilio) with Apple Sign In + Email OTP
- [ ] Enable Apple provider in Supabase (Auth → Providers)
- [ ] Enable Email OTP provider in Supabase (Auth → Providers)
- [ ] Disable Phone provider in Supabase (Auth → Providers)
- [ ] Register App ID in Apple Developer Portal with "Sign in with Apple" capability
- [ ] Install and configure `expo-apple-authentication`
- [ ] Implement `expo-secure-store` for encrypted token storage (replace AsyncStorage for auth tokens)

## 📱 App Store Setup
- [ ] Update bundle ID from `com.tripplanner.app` → `com.shmoves.app` in `app.json`
- [ ] Register new App ID `com.shmoves.app` in Apple Developer Portal
- [ ] Set up EAS Build (`eas build:configure`)
- [ ] Create development build (required for Apple Sign In testing — won't work in Expo Go)
- [ ] Create App Store Connect listing (name, description, category)
- [ ] Prepare screenshots for all required iPhone sizes
- [ ] Write App Store description and keywords
- [ ] Set age rating
- [ ] Submit for App Store review

## ⚖️ Legal
- [ ] Set up real contact email for Terms & Privacy Policy (buy `shmoves.app` domain or use Google Workspace)
- [ ] Update `docs/terms.html` and `docs/privacy.html` with real contact email
- [ ] Have a lawyer review Terms of Service and Privacy Policy before launch

## 🗄️ Database & Backend
- [ ] Audit all Supabase RLS policies one final time before launch
- [ ] Enable Supabase Point-in-Time Recovery (requires Pro plan, $25/mo) — protects against data loss
- [ ] Set OTP rate limits in Supabase (Auth → Rate Limits) to prevent abuse
- [ ] Rotate any API keys that were ever accidentally exposed
- [ ] Verify Pexels API key is valid and has sufficient quota

## 🎨 UI / UX Polish
- [ ] Fix image API (Pexels) — verify key and quota
- [ ] Implement native iPhone action sheet for photo picker (camera/library) on onboarding and profile
- [ ] Test onboarding flow end-to-end on a real device
- [ ] Test profile photo upload on a real device
- [ ] Verify Terms & Privacy Policy links open correctly from auth screen

## 📦 Dependencies & Code
- [ ] Run `npm audit` and fix any high/critical vulnerabilities
- [ ] Remove any `console.log` statements that log personal data (phone, name, email)
- [ ] Test app on both light and dark mode
- [ ] Test on multiple iPhone sizes (SE, 14, 14 Pro Max)

## 🔔 Nice to Have (Post-Launch or V2)
- [ ] Push notifications for trip invites
- [ ] Android support
- [ ] Offline mode / local caching fallback for trips
- [ ] Google Sign In option
