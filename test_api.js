/**
 * Automated Verification Script for AI Shopping Concierge & PayPal Checkout
 */

const http = require('http');

function post(urlPath, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'GET',
      headers,
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING VERIFICATION TESTS ---');
  const sessionId = 'test-session-' + Date.now();
  const sessionHeader = { 'x-session-id': sessionId };

  // 1. Config Test
  console.log('\n[1] Testing GET /api/config...');
  const cfg = await get('/api/config');
  console.log('Status:', cfg.status);
  console.log('Config response: [clientId present:', Boolean(cfg.data && cfg.data.clientId) + ']');
  if (cfg.status !== 200 || !cfg.data.clientId) throw new Error('Config failed');

  // 2. Chat: Search & Budget Guard
  console.log('\n[2] Testing POST /api/chat ("Gift for sister under $30, reading and tea")...');
  const chat1 = await post(
    '/api/chat',
    { message: 'I need a birthday gift for my sister under $30, she likes reading and tea.' },
    sessionHeader
  );
  console.log('Status:', chat1.status);
  console.log('Executed tools:', chat1.data.executedTools?.map((t) => t.tool));
  console.log('Reply preview:', chat1.data.reply?.substring(0, 150) + '...');
  if (chat1.status !== 200) throw new Error('Chat 1 failed');

  // 3. Chat: Add first two
  console.log('\n[3] Testing POST /api/chat ("Add the first two")...');
  const chat2 = await post('/api/chat', { message: 'Add the first two' }, sessionHeader);
  console.log('Status:', chat2.status);
  console.log('Executed tools:', chat2.data.executedTools?.map((t) => t.tool));
  console.log('Cart items count:', chat2.data.cart?.itemCount);
  console.log('Cart total:', chat2.data.cart?.total);
  if (chat2.status !== 200 || chat2.data.cart?.itemCount === 0) throw new Error('Chat 2 (add) failed');

  // 4. Chat: Ready to check out
  console.log('\n[4] Testing POST /api/chat ("Ready to check out")...');
  const chat3 = await post('/api/chat', { message: 'Ready to check out' }, sessionHeader);
  console.log('Status:', chat3.status);
  console.log('Checkout Ready flag:', chat3.data.cart?.checkoutReady);
  if (chat3.status !== 200 || !chat3.data.cart?.checkoutReady) throw new Error('Chat 3 (checkout) failed');

  // 5. Create PayPal Order (Authoritative pricing check)
  console.log('\n[5] Testing POST /api/paypal/create-order...');
  const orderRes = await post('/api/paypal/create-order', {}, sessionHeader);
  console.log('Status:', orderRes.status);
  console.log('Order Response:', orderRes.data);
  if (orderRes.status !== 200 || !orderRes.data.orderId) throw new Error('Create order failed');

  // 6. Capture PayPal Order
  console.log('\n[6] Testing POST /api/paypal/capture-order...');
  const captureRes = await post(
    '/api/paypal/capture-order',
    { orderId: orderRes.data.orderId },
    sessionHeader
  );
  console.log('Status:', captureRes.status);
  console.log('Capture Status:', captureRes.data.capture?.status);
  console.log('AI Summary preview:\n', captureRes.data.summary);
  if (captureRes.status !== 200) {
    throw new Error('Capture order failed');
  }

  // 7. Promo Code Voucher Verification
  console.log('\n[7] Testing POST /api/cart/promo ("COZY10")...');
  // First add an item to cart
  await post('/api/cart/update', { action: 'add', productId: 'tea-01', quantity: 2 }, sessionHeader);
  const promoRes = await post('/api/cart/promo', { code: 'COZY10' }, sessionHeader);
  console.log('Status:', promoRes.status);
  console.log('Discount applied:', promoRes.data.discount);
  console.log('New total:', promoRes.data.total);
  if (promoRes.status !== 200 || !promoRes.data.discount) throw new Error('Promo failed');

  // 8. Direct Debit Card Checkout
  console.log('\n[8] Testing POST /api/paypal/card-checkout (Debit Card Payment)...');
  const cardRes = await post(
    '/api/paypal/card-checkout',
    {
      cardholderName: 'Eleanor Vance',
      cardNumber: '4000123456789010',
      expDate: '12/28',
      cvv: '888',
      billingZip: '90210',
    },
    sessionHeader
  );
  console.log('Status:', cardRes.status);
  console.log('Card Payment Auth ID:', cardRes.data.authId);
  console.log('Order ID:', cardRes.data.orderId);
  if (cardRes.status !== 200 || !cardRes.data.authId) throw new Error('Card payment failed');

  console.log('\n✅ ALL 8 VERIFICATION TESTS (PAYPAL + DEBIT CARD + PROMO) PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('\n❌ Test run failed:', err);
  process.exit(1);
});

