# Payment Integration Guide for Kazakhstan-based Business

## Recommended Solution: Paddle (Primary) + Cloudpayments (Secondary)

---

## Option 1: Paddle Integration (Easiest - Recommended)

### Why Paddle?
- ✅ Works from ANY country (including Kazakhstan)
- ✅ They become the "Merchant of Record" (they're the seller, you're the vendor)
- ✅ Handles all payment processing, VAT, taxes, compliance
- ✅ Supports 100+ currencies
- ✅ Recurring subscriptions built-in
- ✅ Pays you via wire transfer to Kazakhstan bank

### Setup Steps:

#### 1. Sign up at Paddle
```
https://paddle.com/signup
```

#### 2. Create Products
- Product: "Lumina Pro - Monthly"
- Price: $5/month
- Recurring: Yes

#### 3. Install Paddle SDK
```bash
npm install @paddle/paddle-js
```

#### 4. Frontend Integration

```typescript
// services/paddleService.ts
import { initializePaddle, Paddle } from '@paddle/paddle-js';

let paddle: Paddle | null = null;

export const initPaddle = async () => {
  paddle = await initializePaddle({
    environment: 'production', // or 'sandbox' for testing
    token: process.env.PADDLE_CLIENT_TOKEN!, // Public token (safe for frontend)
  });
  return paddle;
};

export const openCheckout = async (priceId: string, email: string) => {
  if (!paddle) {
    await initPaddle();
  }
  
  paddle?.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: { email },
    customData: {
      userId: 'user_123', // Your user ID
    },
  });
};

// Listen for successful payment
export const onPaymentSuccess = (callback: (data: any) => void) => {
  if (!paddle) return;
  
  paddle.Checkout.on('checkout.completed', (data) => {
    callback(data);
  });
};
```

#### 5. Update Profile Component

```typescript
// components/Profile.tsx
import { openCheckout, initPaddle, onPaymentSuccess } from '../services/paddleService';

// In your component
useEffect(() => {
  initPaddle();
  
  onPaymentSuccess((data) => {
    console.log('Payment successful!', data);
    // Update user to Pro status
    onUpgrade();
  });
}, []);

const handleUpgradeClick = async () => {
  setIsUpgrading(true);
  
  try {
    await openCheckout(
      'pri_01234567890', // Your Paddle price ID
      user.email
    );
  } catch (error) {
    console.error('Payment failed:', error);
    alert('Payment failed. Please try again.');
  } finally {
    setIsUpgrading(false);
  }
};
```

#### 6. Backend Webhook (Verify Payment)

You'll need a backend endpoint to receive Paddle webhooks:

```typescript
// api/paddle-webhook.ts (Vercel serverless function example)
import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook signature
  const signature = req.headers['paddle-signature'] as string;
  const isValid = verifyPaddleWebhook(req.body, signature);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  // Handle different event types
  switch (event.event_type) {
    case 'subscription.created':
      // User subscribed - activate Pro
      await activateProMembership(event.data.custom_data.userId);
      break;
      
    case 'subscription.canceled':
      // User canceled - deactivate Pro
      await deactivateProMembership(event.data.custom_data.userId);
      break;
      
    case 'subscription.payment_failed':
      // Payment failed - send email notification
      await notifyPaymentFailed(event.data.custom_data.userId);
      break;
  }

  res.status(200).json({ received: true });
}

function verifyPaddleWebhook(body: any, signature: string): boolean {
  // Paddle provides verification code in their docs
  // https://developer.paddle.com/webhooks/signature-verification
  const secret = process.env.PADDLE_WEBHOOK_SECRET!;
  // ... verification logic
  return true; // Simplified
}
```

### Paddle Pricing:
- **5% + payment processing fees** (total ~8-10%)
- They handle everything, so it's worth it

---

## Option 2: Cloudpayments Integration (For CIS Market)

### Why Cloudpayments?
- ✅ Popular in Kazakhstan/Russia
- ✅ Lower fees (~3%)
- ✅ Supports local payment methods
- ✅ Good for CIS customers

### Setup Steps:

#### 1. Sign up
```
https://cloudpayments.kz/
```

#### 2. Install SDK
```bash
npm install cloudpayments
```

#### 3. Frontend Integration

```typescript
// services/cloudpaymentsService.ts

declare global {
  interface Window {
    cp: any;
  }
}

export const initCloudPayments = () => {
  // Load CloudPayments widget
  const script = document.createElement('script');
  script.src = 'https://widget.cloudpayments.kz/bundles/cloudpayments.js';
  document.head.appendChild(script);
};

export const processPayment = (amount: number, email: string, userId: string) => {
  return new Promise((resolve, reject) => {
    const widget = new window.cp.CloudPayments();
    
    widget.pay('charge', {
      publicId: process.env.CLOUDPAYMENTS_PUBLIC_ID, // Your public ID
      description: 'Lumina Pro Subscription',
      amount: amount,
      currency: 'USD', // or 'KZT' for tenge
      email: email,
      accountId: userId,
      data: {
        userId: userId,
      }
    }, {
      onSuccess: (options: any) => {
        resolve(options);
      },
      onFail: (reason: any, options: any) => {
        reject(reason);
      },
    });
  });
};
```

---

## Option 3: Cryptocurrency (Coinbase Commerce)

### Why Crypto?
- ✅ No geographic restrictions
- ✅ Low fees (~1%)
- ✅ Fast settlement
- ❌ Not everyone has crypto

### Setup:

```bash
npm install @coinbase/coinbase-commerce-node
```

```typescript
// services/cryptoPaymentService.ts
import { Client, resources } from '@coinbase/coinbase-commerce-node';

Client.init(process.env.COINBASE_COMMERCE_API_KEY!);

export const createCryptoCheckout = async (amount: number, userId: string) => {
  const checkoutData = {
    name: 'Lumina Pro Subscription',
    description: 'Monthly subscription to Lumina Pro',
    pricing_type: 'fixed_price',
    local_price: {
      amount: amount.toString(),
      currency: 'USD'
    },
    metadata: {
      userId: userId
    }
  };

  const checkout = await resources.Checkout.create(checkoutData);
  return checkout.hosted_url; // Redirect user here
};
```

---

## Recommended Multi-Payment Setup

```typescript
// services/paymentService.ts

export enum PaymentProvider {
  PADDLE = 'paddle',
  CLOUDPAYMENTS = 'cloudpayments',
  CRYPTO = 'crypto',
}

export const getAvailablePaymentMethods = (userCountry: string) => {
  const methods = [];
  
  // Paddle available worldwide
  methods.push({
    provider: PaymentProvider.PADDLE,
    name: 'Credit Card (International)',
    icon: '💳',
    recommended: true,
  });
  
  // CloudPayments for CIS
  if (['KZ', 'RU', 'BY', 'AM', 'KG'].includes(userCountry)) {
    methods.push({
      provider: PaymentProvider.CLOUDPAYMENTS,
      name: 'Credit Card (Local)',
      icon: '💳',
      recommended: true,
      discount: 10, // 10% discount for local payment
    });
  }
  
  // Crypto always available
  methods.push({
    provider: PaymentProvider.CRYPTO,
    name: 'Cryptocurrency',
    icon: '₿',
    recommended: false,
  });
  
  return methods;
};

export const processPayment = async (
  provider: PaymentProvider,
  amount: number,
  userEmail: string,
  userId: string
) => {
  switch (provider) {
    case PaymentProvider.PADDLE:
      return await openCheckout('pri_xxx', userEmail);
      
    case PaymentProvider.CLOUDPAYMENTS:
      return await processPayment(amount, userEmail, userId);
      
    case PaymentProvider.CRYPTO:
      const url = await createCryptoCheckout(amount, userId);
      window.location.href = url;
      break;
  }
};
```

---

## Cost Comparison

| Provider | Setup Fee | Transaction Fee | Monthly Fee | Payout to KZ |
|----------|-----------|-----------------|-------------|--------------|
| **Paddle** | $0 | ~8-10% | $0 | ✅ Wire transfer |
| **Cloudpayments** | ~$100 | ~3% | ~$20 | ✅ Direct |
| **Coinbase** | $0 | ~1% | $0 | ✅ Crypto/Wire |
| **Kaspi** | Varies | ~2% | Varies | ✅ Direct |

---

## My Recommendation

**Start with Paddle only:**
1. Easiest to set up
2. Works from Kazakhstan
3. Handles everything for you
4. You can add other methods later

**Later, add Cloudpayments:**
- When you have CIS customers
- To offer lower fees for local users
- To support local payment methods

---

## Next Steps

1. **Sign up for Paddle** (takes 1-2 days for approval)
2. **Create your products** in Paddle dashboard
3. **Integrate Paddle SDK** (I can help with this)
4. **Set up webhook endpoint** to verify payments
5. **Test in sandbox mode**
6. **Go live!**

Would you like me to help you implement any of these?

