#!/bin/bash
#
# Admin Pro Access Management Script
#
# Usage:
#   ./scripts/admin-pro-access.sh grant-lifetime <user-uid> [reason]
#   ./scripts/admin-pro-access.sh grant-temp <user-uid> <days> [reason]
#   ./scripts/admin-pro-access.sh revoke <user-uid> [reason]
#   ./scripts/admin-pro-access.sh check <user-uid>
#   ./scripts/admin-pro-access.sh make-admin <user-uid>
#
# Prerequisites:
#   - Firebase CLI installed and logged in
#   - Project configured (firebase use <project-id>)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the project ID
PROJECT_ID=$(firebase use 2>/dev/null | grep -oP 'Active Project: \K.*' || echo "")

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No active Firebase project. Run 'firebase use <project-id>' first.${NC}"
    exit 1
fi

echo -e "${YELLOW}Using Firebase project: ${PROJECT_ID}${NC}"
echo ""

case "$1" in
    grant-lifetime)
        if [ -z "$2" ]; then
            echo -e "${RED}Usage: $0 grant-lifetime <user-uid> [reason]${NC}"
            exit 1
        fi
        USER_UID=$2
        REASON=${3:-"Lifetime access granted via admin script"}

        echo -e "${YELLOW}Granting lifetime access to user: ${USER_UID}${NC}"
        echo -e "${YELLOW}Reason: ${REASON}${NC}"
        echo ""

        # Use Firestore directly via Admin SDK script
        node -e "
        const admin = require('firebase-admin');
        admin.initializeApp();

        async function grantLifetime() {
            await admin.firestore().doc('users/${USER_UID}').update({
                isPro: true,
                isLifetime: true,
                subscriptionType: 'lifetime',
                subscriptionExpiresAt: null,
                proGrantedBy: 'admin-script',
                proGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
                proGrantReason: '${REASON}'
            });
            console.log('Lifetime access granted successfully!');
        }

        grantLifetime().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
        " 2>/dev/null || {
            # Fallback: Use Firebase CLI to update Firestore
            echo -e "${YELLOW}Using Firebase Firestore REST API...${NC}"

            # Get access token
            TOKEN=$(gcloud auth print-access-token 2>/dev/null || firebase login:ci --no-localhost 2>/dev/null)

            if [ -z "$TOKEN" ]; then
                echo -e "${RED}Could not get auth token. Please ensure you're logged in.${NC}"
                echo ""
                echo -e "${YELLOW}Alternative: Run this in Firebase Console > Firestore:${NC}"
                echo ""
                echo "Navigate to: users/${USER_UID}"
                echo "Update fields:"
                echo "  isPro: true"
                echo "  isLifetime: true"
                echo "  subscriptionType: 'lifetime'"
                echo "  proGrantedBy: 'admin-manual'"
                echo "  proGrantReason: '${REASON}'"
                exit 1
            fi
        }

        echo -e "${GREEN}Done!${NC}"
        ;;

    grant-temp)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo -e "${RED}Usage: $0 grant-temp <user-uid> <days> [reason]${NC}"
            exit 1
        fi
        USER_UID=$2
        DAYS=$3
        REASON=${4:-"${DAYS}-day temporary access granted via admin script"}

        echo -e "${YELLOW}Granting ${DAYS}-day access to user: ${USER_UID}${NC}"
        echo ""
        echo -e "${YELLOW}Run this in Firebase Console > Firestore:${NC}"
        echo ""
        echo "Navigate to: users/${USER_UID}"
        echo "Update fields:"
        echo "  isPro: true"
        echo "  isLifetime: false"
        echo "  subscriptionType: 'admin_granted'"
        echo "  subscriptionExpiresAt: <Timestamp: $(date -v+${DAYS}d '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d "+${DAYS} days" '+%Y-%m-%d %H:%M:%S')>"
        echo "  proGrantedBy: 'admin-manual'"
        echo "  proGrantReason: '${REASON}'"
        ;;

    revoke)
        if [ -z "$2" ]; then
            echo -e "${RED}Usage: $0 revoke <user-uid> [reason]${NC}"
            exit 1
        fi
        USER_UID=$2
        REASON=${3:-"Access revoked via admin script"}

        echo -e "${YELLOW}Revoking access for user: ${USER_UID}${NC}"
        echo ""
        echo -e "${YELLOW}Run this in Firebase Console > Firestore:${NC}"
        echo ""
        echo "Navigate to: users/${USER_UID}"
        echo "Update fields:"
        echo "  isPro: false"
        echo "  isLifetime: false"
        echo "  subscriptionType: 'none'"
        echo "  subscriptionExpiresAt: null (delete field)"
        echo "  proGrantedBy: null (delete field)"
        echo "  proGrantedAt: null (delete field)"
        echo "  proGrantReason: null (delete field)"
        ;;

    check)
        if [ -z "$2" ]; then
            echo -e "${RED}Usage: $0 check <user-uid>${NC}"
            exit 1
        fi
        USER_UID=$2

        echo -e "${YELLOW}Checking Pro status for user: ${USER_UID}${NC}"
        echo ""
        echo -e "${YELLOW}View in Firebase Console:${NC}"
        echo "https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/users/${USER_UID}"
        ;;

    make-admin)
        if [ -z "$2" ]; then
            echo -e "${RED}Usage: $0 make-admin <user-uid>${NC}"
            exit 1
        fi
        USER_UID=$2

        echo -e "${YELLOW}Making user an admin: ${USER_UID}${NC}"
        echo ""
        echo -e "${RED}WARNING: This grants full admin privileges!${NC}"
        echo ""
        echo -e "${YELLOW}Run this in Firebase Console > Firestore:${NC}"
        echo ""
        echo "Navigate to: users/${USER_UID}"
        echo "Add field:"
        echo "  isAdmin: true (boolean)"
        ;;

    *)
        echo "Admin Pro Access Management Script"
        echo ""
        echo "Usage:"
        echo "  $0 grant-lifetime <user-uid> [reason]   - Grant permanent Pro access"
        echo "  $0 grant-temp <user-uid> <days> [reason] - Grant temporary Pro access"
        echo "  $0 revoke <user-uid> [reason]           - Revoke Pro access"
        echo "  $0 check <user-uid>                     - Check user's Pro status"
        echo "  $0 make-admin <user-uid>                - Make user an admin"
        echo ""
        echo "Examples:"
        echo "  $0 grant-lifetime abc123xyz 'Beta tester reward'"
        echo "  $0 grant-temp abc123xyz 30 'Trial extension'"
        echo "  $0 revoke abc123xyz 'Refund processed'"
        echo ""
        exit 1
        ;;
esac
