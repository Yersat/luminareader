#!/usr/bin/env node
/**
 * Grant Lifetime Pro Access
 *
 * Usage:
 *   node scripts/grant-lifetime-access.js <user-uid> [reason]
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS environment variable set to service account key path
 *   OR
 *   - Run from a machine with default credentials (gcloud auth application-default login)
 *
 * Example:
 *   node scripts/grant-lifetime-access.js abc123xyz "Beta tester reward"
 */

const admin = require('firebase-admin');

// Get command line arguments
const args = process.argv.slice(2);
const targetUid = args[0];
const reason = args[1] || 'Lifetime access granted via admin script';

if (!targetUid) {
  console.error('Usage: node scripts/grant-lifetime-access.js <user-uid> [reason]');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/grant-lifetime-access.js abc123xyz "Beta tester reward"');
  process.exit(1);
}

// Initialize Firebase Admin
// Will use GOOGLE_APPLICATION_CREDENTIALS or default credentials
try {
  admin.initializeApp();
} catch (e) {
  // Already initialized
}

async function grantLifetimeAccess() {
  console.log(`\nGranting lifetime access to user: ${targetUid}`);
  console.log(`Reason: ${reason}`);
  console.log('');

  const userRef = admin.firestore().doc(`users/${targetUid}`);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    console.error(`Error: User ${targetUid} not found in Firestore`);
    process.exit(1);
  }

  const userData = userDoc.data();
  console.log('Current user data:');
  console.log(`  Email: ${userData.email || 'N/A'}`);
  console.log(`  Display Name: ${userData.displayName || 'N/A'}`);
  console.log(`  Current isPro: ${userData.isPro || false}`);
  console.log(`  Current isLifetime: ${userData.isLifetime || false}`);
  console.log('');

  // Update with lifetime access
  await userRef.update({
    isPro: true,
    isLifetime: true,
    subscriptionType: 'lifetime',
    subscriptionExpiresAt: null,
    proGrantedBy: 'admin-script',
    proGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
    proGrantReason: reason,
  });

  console.log('✅ Lifetime access granted successfully!');
  console.log('');
  console.log('New values:');
  console.log('  isPro: true');
  console.log('  isLifetime: true');
  console.log('  subscriptionType: lifetime');
  console.log(`  proGrantReason: ${reason}`);
}

grantLifetimeAccess()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
