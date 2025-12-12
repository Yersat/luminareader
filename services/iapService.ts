/**
 * In-App Purchase Service using RevenueCat
 * Handles subscriptions for iOS and Android
 */

import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  LOG_LEVEL,
} from '@revenuecat/purchases-capacitor';
import type {
  PurchasesOfferings,
  CustomerInfo,
  PurchasesPackage,
} from '@revenuecat/purchases-capacitor';

// RevenueCat API keys (configure these in your RevenueCat dashboard)
const REVENUECAT_API_KEY_IOS = 'appl_lnxsxvIrrXPWHOLVLrOXgeQVEnW';
const REVENUECAT_API_KEY_ANDROID = 'goog_YOUR_ANDROID_KEY'; // Replace with your Android key

// Product identifiers (must match App Store Connect / Google Play Console)
export const PRODUCT_IDS = {
  MONTHLY_SUBSCRIPTION: 'com.yersat.LuminaReader.pro.monthly',
  ENTITLEMENT_ID: 'Lumina Pro', // The entitlement identifier in RevenueCat
};

let isInitialized = false;

/**
 * Initialize RevenueCat SDK
 * Call this once when your app starts
 */
export const initializeIAP = async (userId?: string): Promise<void> => {
  if (isInitialized) return;
  
  const platform = Capacitor.getPlatform();
  
  // Skip on web platform
  if (platform === 'web') {
    console.log('IAP: Web platform detected, skipping RevenueCat initialization');
    return;
  }

  try {
    const apiKey = platform === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
    
    await Purchases.configure({
      apiKey,
      appUserID: userId || null, // null for anonymous users
    });
    
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    
    isInitialized = true;
    console.log('IAP: RevenueCat initialized successfully');
  } catch (error) {
    console.error('IAP: Failed to initialize RevenueCat:', error);
    throw error;
  }
};

/**
 * Get available subscription offerings
 */
export const getOfferings = async (): Promise<PurchasesOfferings | null> => {
  if (!isInitialized) {
    console.warn('IAP: RevenueCat not initialized');
    return null;
  }

  try {
    const offerings = await Purchases.getOfferings();
    return offerings.offerings;
  } catch (error) {
    console.error('IAP: Failed to get offerings:', error);
    return null;
  }
};

/**
 * Purchase a subscription package
 */
export const purchasePackage = async (pkg: PurchasesPackage): Promise<CustomerInfo | null> => {
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return customerInfo;
  } catch (error: any) {
    if (error.userCancelled) {
      console.log('IAP: User cancelled purchase');
      return null;
    }
    console.error('IAP: Purchase failed:', error);
    throw error;
  }
};

/**
 * Check if user has active Pro subscription
 */
export const checkProStatus = async (): Promise<boolean> => {
  if (!isInitialized) {
    return false;
  }

  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[PRODUCT_IDS.ENTITLEMENT_ID];
    return entitlement !== undefined;
  } catch (error) {
    console.error('IAP: Failed to check pro status:', error);
    return false;
  }
};

/**
 * Restore previous purchases
 */
export const restorePurchases = async (): Promise<CustomerInfo | null> => {
  if (!isInitialized) {
    return null;
  }

  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return customerInfo;
  } catch (error) {
    console.error('IAP: Failed to restore purchases:', error);
    throw error;
  }
};

/**
 * Get customer info (subscription details)
 */
export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  if (!isInitialized) {
    return null;
  }

  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('IAP: Failed to get customer info:', error);
    return null;
  }
};

/**
 * Set user ID for attribution (call after user signs in)
 */
export const setUserId = async (userId: string): Promise<void> => {
  if (!isInitialized) return;

  try {
    await Purchases.logIn({ appUserID: userId });
    console.log('IAP: User ID set:', userId);
  } catch (error) {
    console.error('IAP: Failed to set user ID:', error);
  }
};

/**
 * Log out user (call when user signs out)
 */
export const logOutUser = async (): Promise<void> => {
  if (!isInitialized) return;

  try {
    await Purchases.logOut();
    console.log('IAP: User logged out');
  } catch (error) {
    console.error('IAP: Failed to log out:', error);
  }
};

/**
 * Purchase result type
 */
export interface PurchaseResult {
  success: boolean;
  isPro: boolean;
  error?: string;
  userCancelled?: boolean;
}

/**
 * Purchase the Pro subscription
 * This is the main function to call when user taps "Upgrade"
 */
export const purchaseProSubscription = async (): Promise<PurchaseResult> => {
  const platform = Capacitor.getPlatform();

  // On web, we can't process real purchases
  if (platform === 'web') {
    console.log('IAP: Web platform - cannot process real purchases');
    return {
      success: false,
      isPro: false,
      error: 'In-app purchases are only available in the mobile app.',
    };
  }

  if (!isInitialized) {
    console.warn('IAP: RevenueCat not initialized, attempting to initialize...');
    try {
      await initializeIAP();
    } catch (error) {
      return {
        success: false,
        isPro: false,
        error: 'Failed to initialize payment system. Please try again.',
      };
    }
  }

  try {
    // Get available offerings
    const offerings = await Purchases.getOfferings();
    console.log('IAP: Offerings received:', JSON.stringify(offerings, null, 2));

    // Check if we have a current offering
    const currentOffering = offerings.current;
    if (!currentOffering) {
      console.error('IAP: No current offering available');
      return {
        success: false,
        isPro: false,
        error: 'No subscription offerings available. Please try again later.',
      };
    }

    // Get the monthly package (or first available package)
    const monthlyPackage = currentOffering.monthly || currentOffering.availablePackages[0];
    if (!monthlyPackage) {
      console.error('IAP: No packages available in current offering');
      return {
        success: false,
        isPro: false,
        error: 'No subscription packages available. Please try again later.',
      };
    }

    console.log('IAP: Purchasing package:', monthlyPackage.identifier);

    // Attempt the purchase
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: monthlyPackage });

    // Check if user now has Pro entitlement
    const isPro = customerInfo.entitlements.active[PRODUCT_IDS.ENTITLEMENT_ID] !== undefined;

    console.log('IAP: Purchase completed, isPro:', isPro);

    return {
      success: true,
      isPro,
    };
  } catch (error: any) {
    console.error('IAP: Purchase error:', error);

    // Check if user cancelled
    if (error.userCancelled) {
      return {
        success: false,
        isPro: false,
        userCancelled: true,
      };
    }

    // Handle specific error codes
    let errorMessage = 'Purchase failed. Please try again.';
    if (error.code === 'PRODUCT_ALREADY_PURCHASED') {
      // User already has the subscription - restore it
      try {
        const { customerInfo } = await Purchases.restorePurchases();
        const isPro = customerInfo.entitlements.active[PRODUCT_IDS.ENTITLEMENT_ID] !== undefined;
        return {
          success: true,
          isPro,
        };
      } catch (restoreError) {
        errorMessage = 'You already have this subscription. Please use "Restore Purchases".';
      }
    } else if (error.code === 'NETWORK_ERROR') {
      errorMessage = 'Network error. Please check your connection and try again.';
    } else if (error.code === 'PURCHASE_NOT_ALLOWED') {
      errorMessage = 'Purchases are not allowed on this device.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      isPro: false,
      error: errorMessage,
    };
  }
};

/**
 * Restore previous purchases
 * Returns the Pro status after restoration
 */
export const restoreProPurchases = async (): Promise<PurchaseResult> => {
  const platform = Capacitor.getPlatform();

  if (platform === 'web') {
    return {
      success: false,
      isPro: false,
      error: 'Restore purchases is only available in the mobile app.',
    };
  }

  if (!isInitialized) {
    try {
      await initializeIAP();
    } catch (error) {
      return {
        success: false,
        isPro: false,
        error: 'Failed to initialize payment system. Please try again.',
      };
    }
  }

  try {
    console.log('IAP: Restoring purchases...');
    const { customerInfo } = await Purchases.restorePurchases();
    const isPro = customerInfo.entitlements.active[PRODUCT_IDS.ENTITLEMENT_ID] !== undefined;

    console.log('IAP: Restore completed, isPro:', isPro);

    return {
      success: true,
      isPro,
    };
  } catch (error: any) {
    console.error('IAP: Restore error:', error);
    return {
      success: false,
      isPro: false,
      error: error.message || 'Failed to restore purchases. Please try again.',
    };
  }
};

/**
 * Check if RevenueCat is available (not web platform)
 */
export const isIAPAvailable = (): boolean => {
  return Capacitor.getPlatform() !== 'web';
};
