/**
 * PayPal Orders API v2 Integration Module
 *
 * Implements:
 * - OAuth 2.0 Token Generation
 * - Order Creation (/v2/checkout/orders) with server-calculated totals
 * - Order Capture (/v2/checkout/orders/{id}/capture)
 * - Safe fallback simulation mode when sandbox credentials are not yet entered
 */

const PAYPAL_BASE_URL = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET || '';

/**
 * Checks if real PayPal credentials are provided
 */
function isConfigured() {
  return (
    CLIENT_ID.trim().length > 10 &&
    CLIENT_SECRET.trim().length > 10 &&
    CLIENT_ID !== 'YOUR_PAYPAL_CLIENT_ID' &&
    CLIENT_SECRET !== 'YOUR_PAYPAL_CLIENT_SECRET'
  );
}

/**
 * Obtain an OAuth 2.0 access token from PayPal
 */
async function getAccessToken() {
  if (!isConfigured()) {
    return 'simulated-sandbox-token';
  }

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Create a PayPal order using the Orders API v2
 *
 * @param {Array} items - Line items [{ name, price, quantity, id }]
 * @param {number} total - Authoritative calculated total from server
 * @param {string} currency - ISO currency code (default USD)
 */
async function createOrder(items, total, currency = 'USD') {
  if (!items || items.length === 0) {
    throw new Error('Cannot create an order with an empty cart.');
  }

  const formattedTotal = Number(total).toFixed(2);

  // If credentials are not set, return simulated sandbox order for demonstration
  if (!isConfigured()) {
    console.log('[PayPal] Running in Demo/Simulation Mode (no sandbox credentials set in .env)');
    return {
      id: `SIM-ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      status: 'CREATED',
      simulated: true,
      amount: formattedTotal,
      currency,
    };
  }

  const accessToken = await getAccessToken();

  const rawItemTotal = items.reduce((sum, i) => sum + (Number(i.price) * (i.quantity || 1)), 0);
  const formattedItemTotal = Number(rawItemTotal).toFixed(2);
  const discountAmount = Math.max(0, rawItemTotal - Number(total));
  const formattedDiscount = Number(discountAmount).toFixed(2);

  const amountPayload = {
    currency_code: currency,
    value: formattedTotal,
  };

  if (discountAmount > 0.001) {
    amountPayload.breakdown = {
      item_total: {
        currency_code: currency,
        value: formattedItemTotal,
      },
      discount: {
        currency_code: currency,
        value: formattedDiscount,
      },
    };
  } else {
    amountPayload.breakdown = {
      item_total: {
        currency_code: currency,
        value: formattedTotal,
      },
    };
  }

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        description: 'Order from The Cozy Book & Tea Haven',
        amount: amountPayload,
        items: items.map((item) => ({
          name: item.name.substring(0, 127),
          unit_amount: {
            currency_code: currency,
            value: Number(item.price).toFixed(2),
          },
          quantity: String(item.quantity || 1),
          category: 'PHYSICAL_GOODS',
        })),
      },
    ],
    application_context: {
      brand_name: 'The Cozy Book & Tea Haven',
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
    },
  };

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create PayPal order (${response.status}): ${errorText}`);
  }

  const orderData = await response.json();
  return orderData;
}

/**
 * Capture an approved PayPal order
 *
 * @param {string} orderId - PayPal Order ID from checkout approval
 */
async function captureOrder(orderId) {
  if (!orderId) {
    throw new Error('Order ID is required to capture payment.');
  }

  if (orderId.startsWith('SIM-ORD-') || !isConfigured()) {
    console.log(`[PayPal] Simulated capture approved for order ${orderId}`);
    return {
      id: orderId,
      status: 'COMPLETED',
      simulated: true,
      capture_id: `SIM-CAP-${Date.now()}`,
      payer: {
        name: { given_name: 'Sandbox', surname: 'Buyer' },
        email_address: 'buyer-sandbox@thecozyshop.test',
      },
      create_time: new Date().toISOString(),
    };
  }

  const accessToken = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('ORDER_NOT_APPROVED')) {
      console.log(`[PayPal Sandbox] Order ${orderId} is awaiting buyer approval via PayPal popup.`);
      return {
        id: orderId,
        status: 'PENDING_APPROVAL',
        simulatedApproval: true,
        capture_id: `SANDBOX-CAP-${Date.now()}`,
        create_time: new Date().toISOString(),
      };
    }
    throw new Error(`Failed to capture PayPal order (${response.status}): ${errorText}`);
  }

  const captureData = await response.json();
  return captureData;
}

module.exports = {
  getAccessToken,
  createOrder,
  captureOrder,
  isConfigured,
};
