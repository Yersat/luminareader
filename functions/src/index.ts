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

