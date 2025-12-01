# Phase 3: Authentication & Database Implementation

## 🎯 Goal
Implement user authentication (login/signup) and integrate Firebase database for persistent data storage.

---

## 📋 What We'll Build

### **1. Authentication System**
- Email/Password login
- Email/Password signup
- Password reset functionality
- User session management
- Protected routes (require login)

### **2. User Profile Management**
- Create user profile on signup
- Store user preferences (language, theme, font size)
- Update profile settings
- Display user info in UI

### **3. Data Persistence**
- Save books to Firestore (instead of localStorage)
- Save bookmarks to Firestore
- Save reading progress to Firestore
- Sync data across devices

### **4. Data Migration**
- Migrate existing localStorage data to Firebase
- One-time migration on first login
- Preserve user's books and bookmarks

---

## 🎨 UI Components to Create

### **1. Authentication Pages**
- `LoginPage.tsx` - Login form
- `SignupPage.tsx` - Registration form
- `ForgotPasswordPage.tsx` - Password reset
- `AuthLayout.tsx` - Shared layout for auth pages

### **2. User Profile Components**
- `UserProfile.tsx` - Display user info
- `ProfileSettings.tsx` - Edit profile
- `AccountSettings.tsx` - Account management

### **3. Protected Route Component**
- `ProtectedRoute.tsx` - Wrapper for authenticated pages
- Redirect to login if not authenticated

### **4. Auth Context**
- `AuthContext.tsx` - Global authentication state
- Provide user info to all components
- Handle login/logout

---

## 🔧 Technical Implementation

### **Step 1: Create Auth Context**
```typescript
// src/contexts/AuthContext.tsx
- useAuth() hook
- Login/logout functions
- User state management
- Loading states
```

### **Step 2: Create Auth UI**
```typescript
// src/pages/auth/
- LoginPage.tsx
- SignupPage.tsx
- ForgotPasswordPage.tsx
```

### **Step 3: Update App Routing**
```typescript
// src/App.tsx
- Add auth routes
- Protect main app routes
- Redirect logic
```

### **Step 4: Integrate Firebase Auth**
```typescript
// src/services/authService.ts
- signUp(email, password)
- signIn(email, password)
- signOut()
- resetPassword(email)
- onAuthStateChanged()
```

### **Step 5: Update Data Storage**
```typescript
// Update existing components to use Firebase:
- BookList.tsx - Load from Firestore
- BookReader.tsx - Save progress to Firestore
- BookmarkList.tsx - Load/save to Firestore
```

### **Step 6: Data Migration**
```typescript
// src/utils/dataMigration.ts
- Migrate books from localStorage
- Migrate bookmarks from localStorage
- Run once on first login
```

---

## 📁 Files to Create/Modify

### **New Files:**
```
src/
├── contexts/
│   └── AuthContext.tsx
├── pages/
│   └── auth/
│       ├── LoginPage.tsx
│       ├── SignupPage.tsx
│       └── ForgotPasswordPage.tsx
├── components/
│   ├── ProtectedRoute.tsx
│   ├── UserProfile.tsx
│   └── ProfileSettings.tsx
├── services/
│   └── authService.ts
└── utils/
    └── dataMigration.ts
```

### **Files to Modify:**
```
- App.tsx (add routing)
- BookList.tsx (use Firestore)
- BookReader.tsx (use Firestore)
- BookmarkList.tsx (use Firestore)
- SettingsPanel.tsx (add logout button)
```

---

## 🎯 Success Criteria

✅ Users can sign up with email/password
✅ Users can log in with email/password
✅ Users can reset password
✅ User session persists across page refreshes
✅ Books are saved to Firestore
✅ Bookmarks are saved to Firestore
✅ Reading progress is saved to Firestore
✅ Data syncs across devices
✅ Existing localStorage data is migrated
✅ AI chat works (requires authentication)

---

## ⏱️ Estimated Time

- **Auth Context & Services:** 1 hour
- **Auth UI Pages:** 2 hours
- **Protected Routes:** 30 minutes
- **Update Components:** 2 hours
- **Data Migration:** 1 hour
- **Testing:** 1 hour

**Total:** ~7-8 hours

---

## 🚀 Let's Start!

I'll begin implementing Phase 3 now. Here's the order:

1. ✅ Create Auth Context
2. ✅ Create Auth Service
3. ✅ Create Login/Signup UI
4. ✅ Update App Routing
5. ✅ Update Components to use Firebase
6. ✅ Add Data Migration
7. ✅ Test Everything

**Ready to begin?** I'll start with the Auth Context and Service! 🎯

