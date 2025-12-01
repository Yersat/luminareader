# Firebase Project Setup Guide

## 🎯 What You Need to Do

Before I can continue with Phase 2, you need to create a Firebase project. This is a one-time setup that takes about 5-10 minutes.

---

## 📋 Step-by-Step Instructions

### **Step 1: Go to Firebase Console**
1. Open your browser and go to: **https://console.firebase.google.com/**
2. Sign in with your Google account (or create one if you don't have it)

### **Step 2: Create a New Project**
1. Click **"Add project"** or **"Create a project"**
2. **Project name:** Enter `lumina-reader` (or any name you prefer)
3. Click **"Continue"**

### **Step 3: Google Analytics (Optional)**
1. You'll be asked if you want to enable Google Analytics
2. **Recommendation:** Toggle it **OFF** for now (you can enable it later)
3. Click **"Create project"**
4. Wait for the project to be created (takes 30-60 seconds)
5. Click **"Continue"** when ready

### **Step 4: Register Your Web App**
1. On the Firebase project homepage, you'll see: "Get started by adding Firebase to your app"
2. Click the **Web icon** (looks like `</>`)
3. **App nickname:** Enter `Lumina Reader Web`
4. **Firebase Hosting:** Check the box ✅ "Also set up Firebase Hosting"
5. Click **"Register app"**

### **Step 5: Copy Firebase Configuration**
You'll see a code snippet that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "lumina-reader-xxxxx.firebaseapp.com",
  projectId: "lumina-reader-xxxxx",
  storageBucket: "lumina-reader-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxx"
};
```

**IMPORTANT:** Copy this entire configuration object. You'll need to give it to me.

Click **"Continue to console"** when done.

### **Step 6: Enable Firestore Database**
1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. **Secure rules:** Select **"Start in test mode"** (we'll add proper security later)
4. Click **"Next"**
5. **Cloud Firestore location:** Choose the closest region to Kazakhstan:
   - Recommended: **"europe-west1" (Belgium)** or **"asia-south1" (Mumbai)**
6. Click **"Enable"**
7. Wait for database to be created (30-60 seconds)

### **Step 7: Enable Cloud Storage**
1. In the left sidebar, click **"Build"** → **"Storage"**
2. Click **"Get started"**
3. **Security rules:** Select **"Start in test mode"**
4. Click **"Next"**
5. **Storage location:** Use the same region you chose for Firestore
6. Click **"Done"**

### **Step 8: Enable Authentication**
1. In the left sidebar, click **"Build"** → **"Authentication"**
2. Click **"Get started"**
3. Click on **"Email/Password"** in the Sign-in providers list
4. Toggle **"Enable"** to ON
5. Click **"Save"**

### **Step 9: Set up Cloud Functions**
1. In the left sidebar, click **"Build"** → **"Functions"**
2. Click **"Get started"**
3. Click **"Upgrade project"** (don't worry, you won't be charged immediately)
4. **Billing plan:** You'll need to add a payment method, but Firebase has a generous free tier:
   - **Free tier includes:**
     - 125,000 function invocations/month
     - 40,000 GB-seconds/month
     - 2 million invocations/month for Cloud Firestore
   - You'll only be charged if you exceed these limits
5. Add your payment information
6. Click **"Continue"** and complete the upgrade

**Note:** The free tier is very generous. For a small app, you likely won't be charged anything for months.

---

## ✅ What to Give Me

Once you've completed all steps above, please provide me with:

### **1. Firebase Configuration Object**
The `firebaseConfig` object from Step 5. It should look like:
```javascript
{
  apiKey: "AIzaSy...",
  authDomain: "lumina-reader-xxxxx.firebaseapp.com",
  projectId: "lumina-reader-xxxxx",
  storageBucket: "lumina-reader-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxx"
}
```

### **2. Project ID**
Your Firebase project ID (e.g., `lumina-reader-xxxxx`)

---

## 🔐 Security Note

The Firebase config object contains an API key, but this is **safe to share** and **safe to commit to git**. 

**Why?** 
- This API key is meant to be public (it's in your client-side code)
- Firebase security is controlled by Security Rules, not by hiding the API key
- We'll set up proper security rules to protect your data

---

## ❓ Common Questions

### **Q: Do I really need to add a payment method?**
**A:** Yes, for Cloud Functions. But don't worry:
- The free tier is very generous (125K function calls/month)
- You won't be charged unless you exceed the free tier
- For a small app, you'll likely stay within free tier for months
- You can set up billing alerts to notify you if you're approaching limits

### **Q: What if I don't want to add a payment method?**
**A:** We can use an alternative approach:
- Use Vercel Serverless Functions instead of Firebase Cloud Functions
- Still use Firebase for database and storage
- This is slightly more complex but avoids the billing requirement

### **Q: Can I change the project name later?**
**A:** The project ID cannot be changed, but you can change the display name anytime.

### **Q: What region should I choose?**
**A:** For Kazakhstan, I recommend:
- **First choice:** `europe-west1` (Belgium) - closest European region
- **Second choice:** `asia-south1` (Mumbai) - closest Asian region
- Avoid US regions as they'll have higher latency

---

## 🚀 After You're Done

Once you provide me with the Firebase configuration, I will:
1. Initialize Firebase in your project
2. Set up Cloud Functions for the Grok API proxy
3. Configure Firestore database
4. Set up Cloud Storage for EPUB files
5. Update the frontend to use Firebase
6. Test everything

**Estimated time:** 2-3 hours of work on my end

---

## 📞 Need Help?

If you get stuck at any step, let me know which step you're on and I'll help you through it!

---

**Ready?** Go ahead and create your Firebase project, then come back with the configuration! 🎉

