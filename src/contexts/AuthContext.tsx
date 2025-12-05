/**
 * Authentication Context
 * 
 * Provides global authentication state and functions to all components.
 * Manages user login state, profile data, and authentication operations.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from 'firebase/auth';
import {
  signUp as authSignUp,
  signIn as authSignIn,
  logOut as authLogOut,
  resetPassword as authResetPassword,
  deleteAccount as authDeleteAccount,
  signInWithGoogle as authSignInWithGoogle,
  signInWithApple as authSignInWithApple,
  getUserProfile,
  onAuthStateChange,
  UserProfile
} from '../services/authService';

/**
 * Auth context type definition
 */
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signInWithApple: () => Promise<User>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

/**
 * Create the context
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Auth Provider Props
 */
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Auth Provider Component
 * 
 * Wraps the app and provides authentication state to all children
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setUser(user);
      
      if (user) {
        // Load user profile from Firestore
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    // Cleanup subscription
    return unsubscribe;
  }, []);

  /**
   * Sign up a new user
   */
  const signUp = async (email: string, password: string, displayName: string): Promise<User> => {
    setLoading(true);
    try {
      const user = await authSignUp(email, password, displayName);
      // User state will be updated by onAuthStateChange
      return user;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign in an existing user
   */
  const signIn = async (email: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      const user = await authSignIn(email, password);
      // User state will be updated by onAuthStateChange
      return user;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign in with Google OAuth
   */
  const signInWithGoogle = async (): Promise<User> => {
    setLoading(true);
    try {
      const user = await authSignInWithGoogle();
      // User state will be updated by onAuthStateChange
      return user;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign in with Apple OAuth
   */
  const signInWithApple = async (): Promise<User> => {
    setLoading(true);
    try {
      const user = await authSignInWithApple();
      // User state will be updated by onAuthStateChange
      return user;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign out the current user
   */
  const logOut = async () => {
    setLoading(true);
    try {
      await authLogOut();
      // User state will be updated by onAuthStateChange
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send password reset email
   */
  const resetPassword = async (email: string) => {
    await authResetPassword(email);
  };

  /**
   * Delete user account and all associated data
   */
  const deleteAccount = async () => {
    setLoading(true);
    try {
      await authDeleteAccount();
      // User state will be updated by onAuthStateChange after deletion
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    userProfile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithApple,
    logOut,
    resetPassword,
    deleteAccount
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom hook to use auth context
 * 
 * Usage: const { user, signIn, signOut } = useAuth();
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

