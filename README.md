# Shmoves

**Your travel life, all in one place.**

Shmoves is a full-stack mobile app that eliminates the chaos of group travel — no more bouncing between your email for flight confirmations, your Airbnb app for addresses, and three different group chats for photos. Everything you need for a trip lives in Shmoves, and it's built to be shared.

**https://apps.apple.com/us/app/shmoves/id6761285310**

---

## The Problem

Anyone who's traveled with a group knows the drill: your itinerary is in a Google Doc, your accommodation address is buried in an email, your tickets are in a PDF somewhere, and the photos from the trip are spread across five different people's camera rolls. It's a mess.

Shmoves fixes that.

---

## Features

### 🗂 Trip Organization
Keep all your travel documents in one place — flight tickets, hotel confirmations, itineraries, addresses, and anything else you need. No more digging through email.

### 📸 Group Photo Sharing
Everyone on the trip can upload photos directly to a shared album. Favorite the shots you love, and share them directly to social media from inside the app — no re-downloading, no re-uploading.

### 💸 Trip Finance Tracker
Track what you've spent, split costs with your group, and see at a glance who's paid you back and who hasn't. Travel math, solved.

### 🔗 Easy Group Invites
Invite travel companions via QR code or SMS — they're in the trip in seconds.

### 🔐 Secure Authentication
Sign in with Apple for a seamless, privacy-first login experience.

---

## Tech Stack

| Layer | Technology |
| Framework | React Native + Expo |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| Backend & Auth | Supabase |
| Serverless Functions | Supabase Edge Functions (SMS invites) |
| UI & Animation | React Native Reanimated, Gesture Handler |
| Media | Expo Image Picker, Expo Camera, Expo Media Library |
| Sharing | React Native QR Code SVG, Expo Clipboard |
| CI | GitHub Actions |

---

## Architecture Highlights

- **Supabase** handles authentication (including Apple Sign-In), real-time database, and file storage for trip documents and photos
- **Supabase Edge Functions** power SMS-based trip invitations without exposing credentials on the client
- **File-based routing** via Expo Router keeps navigation clean and scalable
- **Context API** manages shared trip state across screens
- **TypeScript throughout** for type safety and maintainability

---

## About the Developer

I'm a former IB Math & Science teacher turned self-taught software engineer. I built Shmoves because I kept running into the same frustrating problem every time I traveled with a group — and decided to build the solution myself.

It's live on the App Store and actively maintained.

---

## Contact

Feel free to reach out on [LinkedIn] or open an issue if you find a bug or have a feature idea.
