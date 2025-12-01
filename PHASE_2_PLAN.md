# Phase 2: Backend Infrastructure Setup

## 🎯 Goals

1. **Secure API Key** - Move Grok API calls to backend server
2. **Set up Database** - Store user data, books, bookmarks
3. **Create API Endpoints** - Backend APIs for frontend to call
4. **File Storage** - Store EPUB files securely
5. **Prepare for Authentication** - Set up auth infrastructure (implementation in Phase 3)

---

## 🛠️ Technology Choice: Firebase

**Why Firebase?**
- ✅ **All-in-one solution** - Auth, Database, Storage, Hosting, Functions
- ✅ **Easy to set up** - No server management
- ✅ **Generous free tier** - Good for starting out
- ✅ **Scales automatically** - Handles growth
- ✅ **Works great with Capacitor** - Perfect for mobile apps
- ✅ **Built-in security** - Industry-standard security rules

**What We'll Use:**
- **Firebase Authentication** - User login/signup (Phase 3)
- **Cloud Firestore** - NoSQL database for user data, books, bookmarks
- **Cloud Storage** - Store EPUB files
- **Cloud Functions** - Backend API (Grok proxy, etc.)
- **Firebase Hosting** - Deploy the web app

**Cost:** Free tier includes:
- 50,000 reads/day
- 20,000 writes/day
- 1GB storage
- 10GB bandwidth/month
- 125K function invocations/month

---

## 📋 Implementation Steps

### **Step 1: Firebase Project Setup** (15 minutes)
1. Create Firebase project
2. Install Firebase CLI
3. Initialize Firebase in project
4. Configure Firebase services

### **Step 2: Database Schema Design** (10 minutes)
1. Design Firestore collections
2. Plan data structure
3. Set up security rules (basic)

### **Step 3: Cloud Functions Setup** (30 minutes)
1. Create Cloud Function for Grok API proxy
2. Move API key to Cloud Functions environment
3. Create endpoint for AI chat

### **Step 4: Frontend Integration** (30 minutes)
1. Install Firebase SDK in frontend
2. Update grokService to call Cloud Function
3. Test the integration

### **Step 5: File Storage Setup** (20 minutes)
1. Configure Cloud Storage
2. Create upload function
3. Update frontend to use Cloud Storage

### **Step 6: Database Integration** (30 minutes)
1. Create Firestore collections
2. Add functions to save/load data
3. Update frontend to use Firestore

---

## 📊 Database Schema

### **Collections:**

```
users/
  {userId}/
    - email: string
    - name: string
    - isPro: boolean
    - joinDate: timestamp
    - language: string
    - theme: string
    - fontSize: number

books/
  {bookId}/
    - userId: string
    - title: string
    - author: string
    - coverColor: string
    - fileUrl: string (Cloud Storage URL)
    - uploadedAt: timestamp
    - lastOpened: timestamp

bookmarks/
  {bookmarkId}/
    - userId: string
    - bookId: string
    - cfi: string (EPUB location)
    - label: string
    - createdAt: timestamp

subscriptions/
  {subscriptionId}/
    - userId: string
    - platform: string (ios/android)
    - transactionId: string
    - expiresAt: timestamp
    - status: string (active/expired/cancelled)
```

---

## 🔐 Security Rules (Basic)

```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /books/{bookId} {
      allow read, write: if request.auth != null && 
                            resource.data.userId == request.auth.uid;
    }
    
    match /bookmarks/{bookmarkId} {
      allow read, write: if request.auth != null && 
                            resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## 🚀 Cloud Function Structure

```typescript
// functions/src/index.ts

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Grok API Proxy (protects API key)
export const chatWithGrok = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { message, selection, language } = data;
  
  // Call Grok API (API key stored in Cloud Functions environment)
  const grokApiKey = functions.config().grok.apikey;
  
  // Make API call to Grok
  // Return response
});

// Other functions...
```

---

## 📁 Project Structure After Phase 2

```
lumina-reader/
├── src/                    # Frontend code
│   ├── components/
│   ├── services/
│   │   ├── grokService.ts      # Updated to call Cloud Function
│   │   ├── firebaseService.ts  # New: Firebase operations
│   │   └── storageService.ts   # New: File upload/download
│   └── ...
├── functions/              # NEW: Backend Cloud Functions
│   ├── src/
│   │   └── index.ts       # Cloud Functions code
│   ├── package.json
│   └── tsconfig.json
├── firestore.rules        # NEW: Database security rules
├── storage.rules          # NEW: Storage security rules
├── firebase.json          # NEW: Firebase configuration
└── .firebaserc           # NEW: Firebase project config
```

---

## ⏱️ Estimated Time

- **Setup & Configuration:** 30 minutes
- **Cloud Functions Development:** 1 hour
- **Frontend Integration:** 1 hour
- **Testing:** 30 minutes
- **Total:** ~3 hours

---

## ✅ Phase 2 Success Criteria

- [ ] Firebase project created and configured
- [ ] Cloud Function for Grok API working
- [ ] API key moved to backend (secure)
- [ ] Firestore database set up
- [ ] Cloud Storage configured
- [ ] Frontend calling Cloud Functions
- [ ] Basic data persistence working
- [ ] No API key in client code

---

## 🎯 What Changes for Users

**Before Phase 2:**
- Data lost on page refresh
- API key exposed in client
- No file persistence

**After Phase 2:**
- ✅ Data persists across sessions
- ✅ API key secure on backend
- ✅ Files stored in cloud
- ✅ Ready for real authentication (Phase 3)

---

## 🚀 Ready to Start?

Let me know and I'll begin:
1. Setting up Firebase project
2. Creating Cloud Functions
3. Integrating with frontend
4. Testing everything

This will take about 3 hours of focused work. Are you ready to proceed?

