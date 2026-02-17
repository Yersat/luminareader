/**
 * Cloud Functions for Lumina Reader
 *
 * This file contains all backend Cloud Functions including:
 * - Grok API proxy (secure API key)
 * - User management
 * - Subscription validation
 * - Pro access management (lifetime, admin grants)
 * - RevenueCat webhook handling
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// =============================================================================
// PRO ACCESS VALIDATION HELPERS
// =============================================================================

/**
 * Check if a user has active Pro access
 * Priority: isLifetime > admin_granted > active subscription
 */
async function checkUserProAccess(uid: string): Promise<boolean> {
  const userDoc = await admin.firestore().doc(`users/${uid}`).get();

  if (!userDoc.exists) {
    return false;
  }

  const userData = userDoc.data();
  if (!userData) {
    return false;
  }

  // Priority 1: Lifetime access (never expires)
  if (userData.isLifetime === true) {
    return true;
  }

  // Priority 2: Check isPro with optional expiry
  if (userData.isPro === true) {
    // If there's an expiry date, check it
    if (userData.subscriptionExpiresAt) {
      const expiresAt = userData.subscriptionExpiresAt.toDate();
      return expiresAt > new Date();
    }
    // No expiry = permanent (admin granted or lifetime)
    return true;
  }

  return false;
}

/**
 * Check if caller is an admin
 * Admin status is stored in isAdmin field (protected, can only be set via Firebase Console or Admin SDK)
 */
async function isCallerAdmin(uid: string): Promise<boolean> {
  const userDoc = await admin.firestore().doc(`users/${uid}`).get();
  return userDoc.exists && userDoc.data()?.isAdmin === true;
}

/**
 * Grok API Proxy
 * 
 * This function acts as a secure proxy to the Grok API.
 * The API key is stored securely in Cloud Functions environment,
 * not exposed to the client.
 * 
 * @param data - { message: string, selection?: string, language: string }
 * @param context - Firebase auth context
 * @returns { response: string }
 */
export const chatWithGrok = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to use AI chat'
    );
  }

  // Validate Pro subscription server-side
  const hasPro = await checkUserProAccess(context.auth.uid);
  if (!hasPro) {
    functions.logger.warn('Non-Pro user attempted to use AI chat', {
      userId: context.auth.uid,
    });
    throw new functions.https.HttpsError(
      'permission-denied',
      'Pro subscription required to use AI chat'
    );
  }

  const { message, selection, language } = data;

  // Validate input
  if (!message || typeof message !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Message is required and must be a string'
    );
  }

  if (!language || typeof language !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Language is required and must be a string'
    );
  }

  try {
    // Get Grok API key from environment
    const grokApiKey = functions.config().grok?.apikey;
    
    if (!grokApiKey) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Grok API key not configured'
      );
    }

    // Build the prompt
    const systemInstruction = getSystemInstruction(language);
    const userPrompt = selection 
      ? `Selected text: "${selection}"\n\nQuestion: ${message}`
      : message;

    // Call Grok API
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${grokApiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      functions.logger.error('Grok API error:', errorText);
      
      if (response.status === 401) {
        throw new functions.https.HttpsError('permission-denied', 'Invalid API key');
      } else if (response.status === 429) {
        throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded');
      } else {
        throw new functions.https.HttpsError('internal', 'AI service error');
      }
    }

    const result = await response.json();
    const aiResponse = result.choices?.[0]?.message?.content;

    if (!aiResponse) {
      throw new functions.https.HttpsError('internal', 'No response from AI');
    }

    // Log usage for monitoring
    functions.logger.info('Grok API call', {
      userId: context.auth.uid,
      messageLength: message.length,
      responseLength: aiResponse.length,
    });

    return { response: aiResponse };

  } catch (error: any) {
    functions.logger.error('Error in chatWithGrok:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while processing your request'
    );
  }
});

/**
 * Get system instruction based on language
 */
function getSystemInstruction(language: string): string {
  const instructions: Record<string, string> = {
    en: 'You are a helpful reading assistant. Provide clear, concise explanations about the selected text. If asked to translate, provide accurate translations. Keep responses under 200 words.',
    ru: 'Вы полезный помощник по чтению. Предоставляйте четкие, краткие объяснения о выбранном тексте. Если попросят перевести, предоставьте точные переводы. Держите ответы до 200 слов.',
    es: 'Eres un asistente de lectura útil. Proporciona explicaciones claras y concisas sobre el texto seleccionado. Si te piden traducir, proporciona traducciones precisas. Mantén las respuestas en menos de 200 palabras.',
    fr: 'Vous êtes un assistant de lecture utile. Fournissez des explications claires et concises sur le texte sélectionné. Si on vous demande de traduire, fournissez des traductions précises. Gardez les réponses en moins de 200 mots.',
    de: 'Sie sind ein hilfreicher Leseassistent. Geben Sie klare, prägnante Erklärungen zum ausgewählten Text. Wenn Sie gebeten werden zu übersetzen, geben Sie genaue Übersetzungen. Halten Sie Antworten unter 200 Wörtern.',
    zh: '你是一个有用的阅读助手。对所选文本提供清晰、简洁的解释。如果要求翻译，请提供准确的翻译。回答保持在200字以内。',
    ja: 'あなたは役立つ読書アシスタントです。選択されたテキストについて明確で簡潔な説明を提供してください。翻訳を求められた場合は、正確な翻訳を提供してください。回答は200語以内に保ってください。',
  };

  return instructions[language] || instructions.en;
}

/**
 * Delete User Account
 *
 * This function handles complete deletion of a user's account and all associated data:
 * - All books from Firestore
 * - All bookmarks from Firestore
 * - All subscriptions from Firestore
 * - All EPUB files from Cloud Storage
 * - User profile from Firestore
 *
 * Note: The Firebase Auth account deletion is handled client-side after this function completes
 */
export const deleteUserAccount = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to delete account'
    );
  }

  const uid = context.auth.uid;
  functions.logger.info('Starting account deletion for user:', uid);

  try {
    const db = admin.firestore();
    const storage = admin.storage().bucket();

    // 1. Delete all user's books and their Storage files
    functions.logger.info('Deleting books...');
    const booksSnapshot = await db.collection('books').where('userId', '==', uid).get();

    for (const bookDoc of booksSnapshot.docs) {
      const bookData = bookDoc.data();

      // Delete the EPUB file from Storage if it exists
      if (bookData.fileUrl) {
        try {
          // Extract storage path from download URL
          const urlPath = new URL(bookData.fileUrl).pathname;
          const storagePath = decodeURIComponent(urlPath.split('/o/')[1]?.split('?')[0] || '');

          if (storagePath) {
            await storage.file(storagePath).delete();
            functions.logger.info('Deleted storage file:', storagePath);
          }
        } catch (storageError) {
          // Log but continue - file might already be deleted or inaccessible
          functions.logger.warn('Could not delete storage file:', storageError);
        }
      }

      // Delete the book document
      await bookDoc.ref.delete();
    }
    functions.logger.info(`Deleted ${booksSnapshot.size} books`);

    // 2. Delete all user's bookmarks
    functions.logger.info('Deleting bookmarks...');
    const bookmarksSnapshot = await db.collection('bookmarks').where('userId', '==', uid).get();

    const batch = db.batch();
    bookmarksSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    functions.logger.info(`Deleted ${bookmarksSnapshot.size} bookmarks`);

    // 3. Delete all user's subscriptions
    functions.logger.info('Deleting subscriptions...');
    const subscriptionsSnapshot = await db.collection('subscriptions').where('userId', '==', uid).get();

    const subscriptionBatch = db.batch();
    subscriptionsSnapshot.docs.forEach(doc => {
      subscriptionBatch.delete(doc.ref);
    });
    await subscriptionBatch.commit();
    functions.logger.info(`Deleted ${subscriptionsSnapshot.size} subscriptions`);

    // 4. Delete any remaining files in the user's Storage folder
    functions.logger.info('Cleaning up Storage folder...');
    try {
      const [files] = await storage.getFiles({ prefix: `epubs/${uid}/` });
      for (const file of files) {
        await file.delete();
        functions.logger.info('Deleted orphaned file:', file.name);
      }
    } catch (storageError) {
      functions.logger.warn('Error cleaning Storage folder:', storageError);
    }

    // 5. Delete the user profile document
    functions.logger.info('Deleting user profile...');
    await db.collection('users').doc(uid).delete();

    functions.logger.info('Account deletion completed successfully for user:', uid);

    return { success: true, message: 'Account data deleted successfully' };

  } catch (error: any) {
    functions.logger.error('Error deleting account:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to delete account data: ' + (error.message || 'Unknown error')
    );
  }
});

// =============================================================================
// PRO ACCESS MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Grant Lifetime Pro Access
 *
 * Admin-only function to grant permanent Pro access to a user.
 * This access never expires and takes priority over RevenueCat subscriptions.
 *
 * @param data - { targetUid: string, reason?: string }
 * @returns { success: boolean }
 */
export const grantLifetimeAccess = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }

  // Verify caller is an admin
  const adminStatus = await isCallerAdmin(context.auth.uid);
  if (!adminStatus) {
    functions.logger.warn('Non-admin attempted to grant lifetime access', {
      callerUid: context.auth.uid,
    });
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }

  const { targetUid, reason } = data;

  // Validate input
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'targetUid is required and must be a string'
    );
  }

  // Verify target user exists
  const targetUserDoc = await admin.firestore().doc(`users/${targetUid}`).get();
  if (!targetUserDoc.exists) {
    throw new functions.https.HttpsError(
      'not-found',
      'Target user not found'
    );
  }

  try {
    // Grant lifetime access
    await admin.firestore().doc(`users/${targetUid}`).update({
      isPro: true,
      isLifetime: true,
      subscriptionType: 'lifetime',
      subscriptionExpiresAt: null, // Never expires
      proGrantedBy: context.auth.uid,
      proGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      proGrantReason: reason || 'Lifetime access granted by admin',
    });

    functions.logger.info('Lifetime access granted', {
      targetUid,
      grantedBy: context.auth.uid,
      reason: reason || 'No reason provided',
    });

    return { success: true };

  } catch (error: any) {
    functions.logger.error('Error granting lifetime access:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to grant lifetime access'
    );
  }
});

/**
 * Grant Temporary Pro Access
 *
 * Admin-only function to grant Pro access for a limited time.
 * Useful for promotions, beta testers, refund compensation, etc.
 *
 * @param data - { targetUid: string, durationDays: number, reason?: string }
 * @returns { success: boolean, expiresAt: string }
 */
export const grantTemporaryAccess = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }

  // Verify caller is an admin
  const adminStatus = await isCallerAdmin(context.auth.uid);
  if (!adminStatus) {
    functions.logger.warn('Non-admin attempted to grant temporary access', {
      callerUid: context.auth.uid,
    });
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }

  const { targetUid, durationDays, reason } = data;

  // Validate input
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'targetUid is required and must be a string'
    );
  }

  if (!durationDays || typeof durationDays !== 'number' || durationDays <= 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'durationDays is required and must be a positive number'
    );
  }

  // Verify target user exists
  const targetUserDoc = await admin.firestore().doc(`users/${targetUid}`).get();
  if (!targetUserDoc.exists) {
    throw new functions.https.HttpsError(
      'not-found',
      'Target user not found'
    );
  }

  try {
    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    // Grant temporary access
    await admin.firestore().doc(`users/${targetUid}`).update({
      isPro: true,
      isLifetime: false,
      subscriptionType: 'admin_granted',
      subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      proGrantedBy: context.auth.uid,
      proGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      proGrantReason: reason || `${durationDays}-day access granted by admin`,
    });

    functions.logger.info('Temporary access granted', {
      targetUid,
      grantedBy: context.auth.uid,
      durationDays,
      expiresAt: expiresAt.toISOString(),
      reason: reason || 'No reason provided',
    });

    return {
      success: true,
      expiresAt: expiresAt.toISOString(),
    };

  } catch (error: any) {
    functions.logger.error('Error granting temporary access:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to grant temporary access'
    );
  }
});

/**
 * Revoke Pro Access
 *
 * Admin-only function to revoke Pro access from a user.
 * This removes all Pro privileges regardless of how they were granted.
 *
 * @param data - { targetUid: string, reason?: string }
 * @returns { success: boolean }
 */
export const revokeProAccess = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }

  // Verify caller is an admin
  const adminStatus = await isCallerAdmin(context.auth.uid);
  if (!adminStatus) {
    functions.logger.warn('Non-admin attempted to revoke access', {
      callerUid: context.auth.uid,
    });
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }

  const { targetUid, reason } = data;

  // Validate input
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'targetUid is required and must be a string'
    );
  }

  // Verify target user exists
  const targetUserDoc = await admin.firestore().doc(`users/${targetUid}`).get();
  if (!targetUserDoc.exists) {
    throw new functions.https.HttpsError(
      'not-found',
      'Target user not found'
    );
  }

  try {
    // Revoke access
    await admin.firestore().doc(`users/${targetUid}`).update({
      isPro: false,
      isLifetime: false,
      subscriptionType: 'none',
      subscriptionExpiresAt: null,
      proGrantedBy: null,
      proGrantedAt: null,
      proGrantReason: null,
    });

    functions.logger.info('Pro access revoked', {
      targetUid,
      revokedBy: context.auth.uid,
      reason: reason || 'No reason provided',
    });

    return { success: true };

  } catch (error: any) {
    functions.logger.error('Error revoking access:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to revoke access'
    );
  }
});

/**
 * Check Pro Status
 *
 * Public function to check a user's Pro status.
 * Can be called by the user themselves to refresh their status.
 *
 * @returns { isPro: boolean, isLifetime: boolean, subscriptionType: string, expiresAt?: string }
 */
export const checkProStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }

  const uid = context.auth.uid;
  const userDoc = await admin.firestore().doc(`users/${uid}`).get();

  if (!userDoc.exists) {
    return {
      isPro: false,
      isLifetime: false,
      subscriptionType: 'none',
    };
  }

  const userData = userDoc.data()!;
  const hasPro = await checkUserProAccess(uid);

  return {
    isPro: hasPro,
    isLifetime: userData.isLifetime || false,
    subscriptionType: userData.subscriptionType || 'none',
    expiresAt: userData.subscriptionExpiresAt?.toDate()?.toISOString() || null,
  };
});

// =============================================================================
// REVENUECAT WEBHOOK HANDLER
// =============================================================================

/**
 * RevenueCat Webhook Handler
 *
 * Receives subscription events from RevenueCat and updates user Pro status.
 * Configure this URL in RevenueCat dashboard: https://your-region-your-project.cloudfunctions.net/revenuecatWebhook
 *
 * Supported events:
 * - INITIAL_PURCHASE: New subscription
 * - RENEWAL: Subscription renewed
 * - CANCELLATION: User cancelled (but may still have access until period ends)
 * - EXPIRATION: Subscription expired
 * - BILLING_ISSUE: Payment failed
 * - PRODUCT_CHANGE: User changed subscription tier
 *
 * Set webhook authorization token in Firebase config:
 * firebase functions:config:set revenuecat.webhook_token="your-secret-token"
 */
export const revenuecatWebhook = functions.https.onRequest(async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Verify webhook authorization (optional but recommended)
  const expectedToken = functions.config().revenuecat?.webhook_token;
  if (expectedToken) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${expectedToken}`) {
      functions.logger.warn('RevenueCat webhook unauthorized request');
      res.status(401).send('Unauthorized');
      return;
    }
  }

  const event = req.body;

  // RevenueCat sends events in this structure
  const eventType = event.event?.type || event.type;
  const appUserId = event.event?.app_user_id || event.app_user_id;
  const expirationAtMs = event.event?.expiration_at_ms || event.expiration_at_ms;
  const productId = event.event?.product_id || event.product_id;

  functions.logger.info('RevenueCat webhook received', {
    eventType,
    appUserId,
    productId,
  });

  if (!appUserId) {
    functions.logger.warn('RevenueCat webhook missing app_user_id');
    res.status(400).send('Missing app_user_id');
    return;
  }

  try {
    const userRef = admin.firestore().doc(`users/${appUserId}`);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      functions.logger.warn('RevenueCat webhook: user not found', { appUserId });
      // Acknowledge the webhook even if user doesn't exist
      res.status(200).send('User not found - acknowledged');
      return;
    }

    const userData = userDoc.data()!;

    // Skip if user has lifetime access (admin-granted takes priority over RevenueCat)
    if (userData.isLifetime === true) {
      functions.logger.info('RevenueCat webhook: user has lifetime access, skipping', { appUserId });
      res.status(200).send('User has lifetime access - skipped');
      return;
    }

    // Skip if user has admin-granted access that hasn't expired
    if (userData.subscriptionType === 'admin_granted') {
      if (!userData.subscriptionExpiresAt ||
          userData.subscriptionExpiresAt.toDate() > new Date()) {
        functions.logger.info('RevenueCat webhook: user has active admin grant, skipping', { appUserId });
        res.status(200).send('User has admin-granted access - skipped');
        return;
      }
    }

    // Determine subscription type from product ID
    let subscriptionType = 'monthly';
    if (productId) {
      if (productId.includes('annual') || productId.includes('yearly')) {
        subscriptionType = 'annual';
      } else if (productId.includes('lifetime')) {
        subscriptionType = 'lifetime';
      }
    }

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION': // User re-subscribed
        // Grant or extend Pro access
        const updateData: any = {
          isPro: true,
          isLifetime: subscriptionType === 'lifetime',
          subscriptionType: subscriptionType,
        };

        // Set expiration if provided (not for lifetime)
        if (expirationAtMs && subscriptionType !== 'lifetime') {
          updateData.subscriptionExpiresAt = admin.firestore.Timestamp.fromMillis(expirationAtMs);
        } else if (subscriptionType === 'lifetime') {
          updateData.subscriptionExpiresAt = null;
        }

        await userRef.update(updateData);

        functions.logger.info('RevenueCat: Pro access granted/renewed', {
          appUserId,
          eventType,
          subscriptionType,
        });
        break;

      case 'EXPIRATION':
        // Subscription expired - remove Pro access
        await userRef.update({
          isPro: false,
          subscriptionType: 'none',
          subscriptionExpiresAt: null,
        });

        functions.logger.info('RevenueCat: Pro access expired', {
          appUserId,
          eventType,
        });
        break;

      case 'CANCELLATION':
        // User cancelled but may still have access until period ends
        // Just log it - the EXPIRATION event will handle actual removal
        functions.logger.info('RevenueCat: Subscription cancelled (access continues until expiry)', {
          appUserId,
          eventType,
          expiresAt: expirationAtMs ? new Date(expirationAtMs).toISOString() : 'unknown',
        });
        break;

      case 'BILLING_ISSUE':
        // Payment failed - log for monitoring
        // Could implement grace period logic here
        functions.logger.warn('RevenueCat: Billing issue detected', {
          appUserId,
          eventType,
        });
        break;

      default:
        functions.logger.info('RevenueCat: Unhandled event type', {
          appUserId,
          eventType,
        });
    }

    res.status(200).send('OK');

  } catch (error: any) {
    functions.logger.error('RevenueCat webhook error:', error);
    // Return 500 so RevenueCat will retry
    res.status(500).send('Internal error');
  }
});

