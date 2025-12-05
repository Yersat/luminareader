/**
 * Cloud Functions for Lumina Reader
 * 
 * This file contains all backend Cloud Functions including:
 * - Grok API proxy (secure API key)
 * - User management
 * - Subscription validation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

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
        model: 'grok-2-latest',
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

