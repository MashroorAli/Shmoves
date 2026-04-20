// Run with: node generate-apple-secret.js
// Fill in the 4 values below, then run this script once to get your JWT secret

const fs = require('fs');
const crypto = require('crypto');

const TEAM_ID = 'F5GU2Y95YA';
const KEY_ID = 'Z5JMW4KYZ7';
const SERVICE_ID = 'com.shmoves.web';
const KEY_FILE = 'C:/Users/alima/Downloads/AuthKey_Z5JMW4KYZ7.p8';

// ── You don't need to edit below this line ──────────────────────────────────

const privateKey = fs.readFileSync(KEY_FILE, 'utf8');
const now = Math.floor(Date.now() / 1000);
const expiry = now + 15777000; // 6 months

const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID })).toString('base64url');
const payload = Buffer.from(JSON.stringify({
  iss: TEAM_ID,
  iat: now,
  exp: expiry,
  aud: 'https://appleid.apple.com',
  sub: SERVICE_ID,
})).toString('base64url');

const sign = crypto.createSign('SHA256');
sign.update(`${header}.${payload}`);
const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

const jwt = `${header}.${payload}.${signature}`;
console.log('\n✅ Your Apple JWT Secret Key (paste this into Supabase):\n');
console.log(jwt);
console.log('\n⚠️  This expires in 6 months — set a reminder to regenerate it.\n');
