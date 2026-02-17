# Lifetime Pro Access - Deployment Guide

## Overview

This document describes the backend-only implementation of lifetime Pro access that does NOT require an app rebuild or store submission.

## What's Been Implemented

### 1. Firestore Security Rules (`firestore.rules`)
- Protected fields: `isPro`, `isLifetime`, `isAdmin`, `subscriptionType`, `subscriptionExpiresAt`, `proGrantedBy`, `proGrantedAt`, `proGrantReason`
- Users can no longer modify these fields directly (prevents client-side privilege escalation)
- Only Cloud Functions (Admin SDK) can modify these fields

### 2. Cloud Functions (`functions/src/index.ts`)

| Function | Purpose |
|----------|---------|
| `chatWithGrok` | **Updated**: Now validates Pro status server-side before allowing AI chat |
| `grantLifetimeAccess` | Admin function to grant permanent Pro access |
| `grantTemporaryAccess` | Admin function to grant time-limited Pro access |
| `revokeProAccess` | Admin function to revoke Pro access |
| `checkProStatus` | User function to check their Pro status |
| `revenuecatWebhook` | HTTP endpoint for RevenueCat subscription events |

### 3. Admin Scripts (`scripts/`)
- `grant-lifetime-access.js` - Node.js script to grant lifetime access
- `admin-pro-access.sh` - Shell script with multiple admin commands

---

## Deployment Steps

### Step 1: Deploy Firestore Rules

```bash
cd /Users/yernur/Projects/lumina-reader
firebase deploy --only firestore:rules
```

**Verify**: Try updating `isPro` directly in Firestore Console - it should fail for client requests.

### Step 2: Deploy Cloud Functions

```bash
cd /Users/yernur/Projects/lumina-reader/functions
npm run build
cd ..
firebase deploy --only functions
```

**Expected functions deployed**:
- `chatWithGrok` (updated)
- `deleteUserAccount` (existing)
- `grantLifetimeAccess` (new)
- `grantTemporaryAccess` (new)
- `revokeProAccess` (new)
- `checkProStatus` (new)
- `revenuecatWebhook` (new)

### Step 3: Configure RevenueCat Webhook (Optional)

1. Go to RevenueCat Dashboard → Your App → Integrations → Webhooks
2. Add webhook URL: `https://<region>-<project-id>.cloudfunctions.net/revenuecatWebhook`
3. Generate a secret token and save it
4. Set the token in Firebase:
   ```bash
   firebase functions:config:set revenuecat.webhook_token="YOUR_SECRET_TOKEN"
   firebase deploy --only functions
   ```

### Step 4: Set Up First Admin User

You need at least one admin to use the admin functions. Set this manually in Firebase Console:

1. Go to Firebase Console → Firestore
2. Navigate to `users/{your-uid}`
3. Add field: `isAdmin: true` (boolean)

**Find your UID**: Check the Firebase Console → Authentication → Users

---

## Granting Lifetime Access

### Option 1: Firebase Console (Easiest)

1. Go to Firebase Console → Firestore
2. Navigate to `users/{target-user-uid}`
3. Edit the document and set:
   ```
   isPro: true
   isLifetime: true
   subscriptionType: "lifetime"
   proGrantedBy: "your-uid"
   proGrantReason: "Your reason here"
   ```

### Option 2: Node.js Script (Requires Service Account)

```bash
# Set up credentials
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# Run the script
cd /Users/yernur/Projects/lumina-reader
node scripts/grant-lifetime-access.js USER_UID "Beta tester reward"
```

### Option 3: Cloud Function (From Admin Account)

If you have an admin user set up, you can call the function from the app or via Firebase CLI:

```bash
# This requires you to be authenticated as an admin user
firebase functions:call grantLifetimeAccess \
  --data '{"targetUid":"USER_UID","reason":"Beta tester reward"}'
```

---

## Access Priority Logic

The system checks Pro access in this order:

1. **isLifetime = true** → Always Pro (highest priority)
2. **subscriptionType = 'admin_granted'** → Pro until `subscriptionExpiresAt`
3. **isPro = true** with valid expiry → Pro (RevenueCat subscription)
4. **Default** → Free user

This means:
- Lifetime users stay Pro even if their RevenueCat subscription lapses
- Admin-granted access is independent of billing
- RevenueCat webhook updates don't override lifetime status

---

## Verifying the Deployment

### Test 1: Security Rules

Try this from the browser console (while logged in as a regular user):

```javascript
// This should FAIL with permission denied
firebase.firestore().doc('users/YOUR_UID').update({ isPro: true });
```

### Test 2: Cloud Function Pro Validation

```javascript
// As a non-Pro user, this should return "permission-denied"
const chatWithGrok = firebase.functions().httpsCallable('chatWithGrok');
chatWithGrok({ message: 'test', language: 'en' });
```

### Test 3: Grant Lifetime Access

1. Grant lifetime access via Console/script
2. User opens app
3. User should see Pro features enabled
4. AI chat should work

---

## Monitoring

### View Function Logs

```bash
firebase functions:log --only chatWithGrok
firebase functions:log --only grantLifetimeAccess
firebase functions:log --only revenuecatWebhook
```

### Monitor in Firebase Console

- Functions → Dashboard → See invocations, errors, latency
- Firestore → View user documents with Pro fields

---

## Rollback

If something goes wrong:

### Revert Firestore Rules

```bash
# Get previous rules version from git
git checkout HEAD~1 -- firestore.rules
firebase deploy --only firestore:rules
```

### Revert Functions

```bash
git checkout HEAD~1 -- functions/src/index.ts
cd functions && npm run build && cd ..
firebase deploy --only functions
```

---

## FAQ

**Q: Will existing Pro users lose access?**
A: No. The app still reads `isPro` from Firestore. Existing users with `isPro: true` will continue to work.

**Q: What if RevenueCat webhook isn't set up?**
A: The app will still sync Pro status from RevenueCat on launch (existing behavior). The webhook is an enhancement for real-time updates.

**Q: Can I grant access without being an admin?**
A: You can always modify Firestore directly in the Firebase Console. The admin functions just provide a secure API for automation.

**Q: Will this break the current app?**
A: No. The app doesn't need to be updated. It reads `isPro` from Firestore, which this system also uses.
