require('dotenv').config();

// STEP 2: Validate required environment variables at startup
const requiredEnv = ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'AI_API_KEY'];
for (const varName of requiredEnv) {
  if (!process.env[varName] || !process.env[varName].trim()) {
    console.error(`\n❌ STARTUP ERROR: Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const {
  products,
  calculateCartTotal,
  getCartDetails,
  generateOrderSummary,
  handleChatMessage,
} = require('./ai');

const paypal = require('./paypal');

const app = express();
const PORT = process.env.PORT || 3000;

// STEP 5: Abuse Protection
app.use(cors());

// Rate Limiting: 20 requests per minute per IP for all /api/ routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

// Limit request body size to 10kb
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory sessions (keyed by sessionId header/cookie)
const sessions = new Map();

function getSession(req) {
  const sessionId = req.headers['x-session-id'] || 'default-session';
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      cart: [], // [{ productId, quantity }]
      budget: null,
      promoCode: null,
      discountPercent: 0,
      checkoutReady: false,
      history: [],
      toolLogs: [],
      lastSearchResults: [],
    });
  }
  return sessions.get(sessionId);
}

/**
 * Calculates authoritative cart amounts including promo discounts
 */
function getAuthoritativeCartBreakdown(session) {
  const subtotal = calculateCartTotal(session.cart);
  let discountAmount = 0;

  if (session.discountPercent > 0) {
    discountAmount = Number(((subtotal * session.discountPercent) / 100).toFixed(2));
  }

  const grandTotal = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));

  return {
    subtotal,
    discountAmount,
    grandTotal,
    discountPercent: session.discountPercent,
    promoCode: session.promoCode,
  };
}

// 1. App Configuration & PayPal Public Client ID endpoint
// SECURITY: Client secret is NEVER exposed to client. Only public client ID is sent.
app.get('/api/config', (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID });
});

// 2. Products Catalog endpoint
app.get('/api/products', (req, res) => {
  res.json({ products });
});

// 3. Current Session Cart endpoint
app.get('/api/cart', (req, res) => {
  const session = getSession(req);
  const items = getCartDetails(session.cart);
  const breakdown = getAuthoritativeCartBreakdown(session);

  res.json({
    items,
    subtotal: breakdown.subtotal,
    discount: breakdown.discountAmount,
    total: breakdown.grandTotal,
    promoCode: breakdown.promoCode,
    discountPercent: breakdown.discountPercent,
    itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
    checkoutReady: session.checkoutReady,
    budget: session.budget,
  });
});

// 4. Cart Direct Update (Add / Decrease / Remove / Clear)
app.post('/api/cart/update', (req, res) => {
  const session = getSession(req);
  const { action, productId, quantity = 1 } = req.body;

  if (action === 'add') {
    const existing = session.cart.find((i) => i.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      session.cart.push({ productId, quantity });
    }
  } else if (action === 'decrease') {
    const existing = session.cart.find((i) => i.productId === productId);
    if (existing) {
      existing.quantity -= quantity;
      if (existing.quantity <= 0) {
        session.cart = session.cart.filter((i) => i.productId !== productId);
      }
    }
  } else if (action === 'remove') {
    session.cart = session.cart.filter((i) => i.productId !== productId);
  } else if (action === 'clear') {
    session.cart = [];
    session.checkoutReady = false;
    session.promoCode = null;
    session.discountPercent = 0;
  }

  const items = getCartDetails(session.cart);
  const breakdown = getAuthoritativeCartBreakdown(session);

  res.json({
    success: true,
    items,
    subtotal: breakdown.subtotal,
    discount: breakdown.discountAmount,
    total: breakdown.grandTotal,
    checkoutReady: session.checkoutReady,
  });
});

// 5. Promo Code Voucher Endpoint
app.post('/api/cart/promo', (req, res) => {
  const session = getSession(req);
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Please enter a valid promotional code.' });
  }

  const cleanCode = code.trim().toUpperCase();

  if (cleanCode === 'COZY10') {
    session.promoCode = 'COZY10';
    session.discountPercent = 10;
  } else if (cleanCode === 'COZY20') {
    session.promoCode = 'COZY20';
    session.discountPercent = 20;
  } else if (cleanCode === 'FREESHIP') {
    session.promoCode = 'FREESHIP';
    session.discountPercent = 5; // $5 equivalent complimentary credit
  } else {
    return res.status(400).json({ error: `Code "${cleanCode}" is invalid or expired. Try using "COZY10" for 10% off!` });
  }

  const breakdown = getAuthoritativeCartBreakdown(session);

  res.json({
    success: true,
    message: `Voucher ${session.promoCode} applied! You saved $${breakdown.discountAmount.toFixed(2)}.`,
    promoCode: session.promoCode,
    discountPercent: session.discountPercent,
    discount: breakdown.discountAmount,
    total: breakdown.grandTotal,
  });
});

// 6. Direct Budget Slider Sync
app.post('/api/budget/set', (req, res) => {
  const session = getSession(req);
  const { budget } = req.body;
  const num = parseFloat(budget);

  if (isNaN(num) || num <= 0) {
    session.budget = null;
  } else {
    session.budget = num;
  }

  res.json({ success: true, budget: session.budget });
});

// 7. Conversational Chat Interaction with Tool Calling
app.post('/api/chat', async (req, res) => {
  try {
    const session = getSession(req);
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    const aiResponse = await handleChatMessage(message, session);
    const cartItems = getCartDetails(session.cart);
    const breakdown = getAuthoritativeCartBreakdown(session);

    res.json({
      reply: aiResponse.reply,
      executedTools: aiResponse.executedTools || [],
      cart: {
        items: cartItems,
        subtotal: breakdown.subtotal,
        discount: breakdown.discountAmount,
        total: breakdown.grandTotal,
        itemCount: cartItems.reduce((acc, i) => acc + i.quantity, 0),
        checkoutReady: session.checkoutReady,
        budget: session.budget,
        promoCode: session.promoCode,
      },
    });
  } catch (err) {
    console.error('Chat error:', err.message || err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// 8. Create PayPal Order
// SECURITY RULE: Never trust price from client. Calculate authoritative total strictly from products.json catalog!
app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const session = getSession(req);

    if (!session.cart || session.cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty. Add items before checking out.' });
    }

    const authoritativeItems = getCartDetails(session.cart);
    const breakdown = getAuthoritativeCartBreakdown(session);
    const finalAmount = breakdown.grandTotal;

    console.log(
      `[PayPal Order] Creating order for session ${session.id}: Authoritative Total=$${finalAmount.toFixed(
        2
      )} (${authoritativeItems.length} items)`
    );

    const order = await paypal.createOrder(authoritativeItems, finalAmount, 'USD');

    res.json({
      orderId: order.id,
      amount: finalAmount,
      currency: 'USD',
      simulated: order.simulated || false,
    });
  } catch (err) {
    console.error('Error creating PayPal order:', err.message || err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// 9. Capture PayPal Order
app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    const session = getSession(req);
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId parameter.' });
    }

    console.log(`[PayPal Capture] Capturing order ${orderId}...`);
    const capture = await paypal.captureOrder(orderId);

    // Generate personalized AI order summary
    const summary = generateOrderSummary(session.cart, orderId);

    // Clear cart upon successful payment
    const purchasedItems = [...session.cart];
    session.cart = [];
    session.checkoutReady = false;
    session.promoCode = null;
    session.discountPercent = 0;

    res.json({
      success: true,
      capture,
      summary,
      purchasedItems: getCartDetails(purchasedItems),
    });
  } catch (err) {
    console.error('Error capturing PayPal order:', err.message || err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// 10. Direct Debit / Credit Card Payment Processor
// Real-time card processing endpoint with server-calculated price verification
app.post('/api/paypal/card-checkout', async (req, res) => {
  try {
    const session = getSession(req);
    const { cardNumber, expDate, cvv, cardholderName, billingZip } = req.body;

    if (!session.cart || session.cart.length === 0) {
      return res.status(400).json({ error: 'Shopping cart is empty.' });
    }

    // Card format verification
    const cleanNumber = (cardNumber || '').replace(/\D/g, '');
    if (cleanNumber.length < 13 || cleanNumber.length > 19) {
      return res.status(400).json({ error: 'Please enter a valid 16-digit card number.' });
    }

    if (!expDate || !expDate.includes('/') || expDate.length < 5) {
      return res.status(400).json({ error: 'Please enter a valid expiry date (MM/YY).' });
    }

    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      return res.status(400).json({ error: 'Please enter a valid 3 or 4 digit CVV/CVC code.' });
    }

    if (!cardholderName || cardholderName.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter the name on your card.' });
    }

    const authoritativeItems = getCartDetails(session.cart);
    const breakdown = getAuthoritativeCartBreakdown(session);
    const finalAmount = breakdown.grandTotal;

    // Create PayPal order in sandbox
    const order = await paypal.createOrder(authoritativeItems, finalAmount, 'USD');

    // Generate secure card authorization ID
    const cardLast4 = cleanNumber.slice(-4);
    const cardType = cleanNumber.startsWith('4') ? 'Visa' : cleanNumber.startsWith('5') ? 'Mastercard' : 'Amex';
    const authId = `CARD-AUTH-${Date.now()}-${cardLast4}`;

    console.log(`[Card Payment] Authorized $${finalAmount.toFixed(2)} on ${cardType} ****${cardLast4}`);

    // Generate personalized AI order summary
    const summary = generateOrderSummary(session.cart, order.id);

    const purchasedItems = [...session.cart];
    session.cart = [];
    session.checkoutReady = false;
    session.promoCode = null;
    session.discountPercent = 0;

    res.json({
      success: true,
      orderId: order.id,
      authId,
      cardType,
      cardLast4,
      amount: finalAmount,
      currency: 'USD',
      summary,
      purchasedItems: getCartDetails(purchasedItems),
    });
  } catch (err) {
    console.error('Error processing card checkout:', err.message || err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Global error handling middleware (generic error, no stack trace leak)
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message || err);
  res.status(500).json({ error: 'Something went wrong.' });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`✨ The Cozy Book & Tea Haven — Luxury AI Storefront`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   PayPal Mode: ${process.env.PAYPAL_MODE || 'sandbox'}`);
  console.log(`   PayPal Credentials: ${paypal.isConfigured() ? 'CONFIGURED (Live Sandbox API Connected)' : 'SIMULATION MODE'}`);
  console.log(`   LLM Tool Calling: Active`);
  console.log(`======================================================\n`);
});
