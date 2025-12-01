/**
 * Grok AI Service
 *
 * This service handles all interactions with the Grok API via Cloud Functions.
 * The API key is securely stored on the backend, not exposed to the client.
 *
 * Phase 2: Updated to use Firebase Cloud Functions for secure API calls
 */

import { SelectionData, Language } from "../types";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from '../src/config/firebase';

export const generateAIResponse = async (
  userMessage: string,
  selection: SelectionData | null,
  language: Language = 'en'
): Promise<string> => {
  try {
    // Call Cloud Function (API key is secure on backend)
    const chatWithGrok = httpsCallable(functions, 'chatWithGrok');

    // Prepare the message with context if there's selected text
    let message = userMessage;
    let selectionText = null;

    if (selection && selection.text) {
      selectionText = selection.text;
    }

    const result = await chatWithGrok({
      message,
      selection: selectionText,
      language
    });

    const data = result.data as { response: string };

    if (!data.response) {
      throw new Error('No response received from AI');
    }

    return data.response;

  } catch (error: any) {
    console.error("Grok API Error:", error);

    // Handle Firebase Functions errors
    if (error.code === 'unauthenticated') {
      throw new Error('Please log in to use the AI assistant.');
    } else if (error.code === 'permission-denied') {
      throw new Error('Authentication failed. Please try logging in again.');
    } else if (error.code === 'resource-exhausted') {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (error.code === 'internal') {
      throw new Error('AI service error. Please try again later.');
    } else if (error.code === 'failed-precondition') {
      throw new Error('AI service is not properly configured. Please contact support.');
    }

    // Provide user-friendly error messages
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Failed to connect to the AI assistant. Please check your internet connection.");
  }
};

