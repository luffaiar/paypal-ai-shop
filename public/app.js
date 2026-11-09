/**
 * The Cozy Book & Tea Haven — Luxury Storefront & Dual Payment Suite Logic
 */

// Persistent Session ID
let sessionId = localStorage.getItem('haven_session_id');
if (!sessionId) {
  sessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
  localStorage.setItem('haven_session_id', sessionId);
}

// Global State
let appConfig = null;
let allProducts = [];
let currentCategory = 'all';
let currentSearchTerm = '';
let currentSort = 'featured';
let currentBudgetLimit = 30;
let currentCart = { items: [], subtotal: 0, discount: 0, total: 0, itemCount: 0, checkoutReady: false, budget: 30, promoCode: null };
let paypalButtonsRendered = false;
let currentQvProduct = null;
let currentQvQty = 1;

// DOM Selectors
const productsGrid = document.getElementById('products-grid');
const categoryTabs = document.getElementById('category-tabs');
const catalogSearch = document.getElementById('catalog-search');
const catalogSort = document.getElementById('catalog-sort-select');
const catalogCountDisplay = document.getElementById('catalog-count-display');
const heroBudgetSlider = document.getElementById('hero-budget-slider');
const sliderValDisplay = document.getElementById('slider-val-display');
const sliderHintText = document.getElementById('slider-hint-text');

// Floating AI Dock & Chat Selectors
const auraFloatingDock = document.getElementById('aura-floating-dock');
const auraLauncherBtn = document.getElementById('aura-launcher-btn');
const auraChatWindow = document.getElementById('aura-chat-window');
const minimizeChatBtn = document.getElementById('minimize-chat-btn');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');

// Cart Drawer Selectors
const cartDrawer = document.getElementById('cart-drawer');
const cartDrawerBackdrop = document.getElementById('cart-drawer-backdrop');
const cartToggleBtn = document.getElementById('cart-toggle-btn');
const closeCartBtn = document.getElementById('close-cart-btn');
const clearCartBtn = document.getElementById('clear-cart-btn');
const headerCartBadge = document.getElementById('header-cart-badge');
const headerCartTotal = document.getElementById('header-cart-total');
const drawerCartCount = document.getElementById('drawer-cart-count');
const cartItemsContainer = document.getElementById('cart-items-container');
const cartSubtotal = document.getElementById('cart-subtotal');
const promoDiscountRow = document.getElementById('promo-discount-row');
const promoDiscountAmount = document.getElementById('promo-discount-amount');
const promoNameDisplay = document.getElementById('promo-name-display');
const cartGrandTotal = document.getElementById('cart-grand-total');

// Promo Code
const promoCodeInput = document.getElementById('promo-code-input');
const applyPromoBtn = document.getElementById('apply-promo-btn');
const promoStatusMsg = document.getElementById('promo-status-msg');

// Budget Guard
const budgetGuardWidget = document.getElementById('budget-guard-widget');
const budgetProgressText = document.getElementById('budget-progress-text');
const budgetProgressBar = document.getElementById('budget-progress-bar');
const budgetStatusTip = document.getElementById('budget-status-tip');

// Payment Suite
const prepareCheckoutBtn = document.getElementById('prepare-checkout-btn');
const paymentAccordion = document.getElementById('payment-accordion');
const tabBtnPaypal = document.getElementById('tab-btn-paypal');
const tabBtnCard = document.getElementById('tab-btn-card');
const tabContentPaypal = document.getElementById('tab-content-paypal');
const tabContentCard = document.getElementById('tab-content-card');
const paypalBtnContainer = document.getElementById('paypal-button-container');
const demoSandboxBtn = document.getElementById('demo-sandbox-btn');
const cardCheckoutForm = document.getElementById('card-checkout-form');
const payCardBtn = document.getElementById('pay-card-btn');
const payCardBtnText = document.getElementById('pay-card-btn-text');

// Quick View Modal Selectors
const quickviewModal = document.getElementById('quickview-modal');
const closeQvBtn = document.getElementById('close-quickview-btn');
const qvImg = document.getElementById('qv-img');
const qvBadge = document.getElementById('qv-badge');
const qvCategory = document.getElementById('qv-category');
const qvTitle = document.getElementById('qv-title');
const qvRating = document.getElementById('qv-rating');
const qvReviews = document.getElementById('qv-reviews');
const qvPrice = document.getElementById('qv-price');
const qvDesc = document.getElementById('qv-desc');
const qvOrigin = document.getElementById('qv-origin');
const qvNotes = document.getElementById('qv-notes');
const qvSteeping = document.getElementById('qv-steeping');
const qvQtyDisplay = document.getElementById('qv-qty-display');
const qvQtyMinus = document.getElementById('qv-qty-minus');
const qvQtyPlus = document.getElementById('qv-qty-plus');
const qvAddBtn = document.getElementById('qv-add-btn');
const qvAskBtn = document.getElementById('qv-ask-btn');

// Modals
const architectureModal = document.getElementById('architecture-modal');
const receiptModal = document.getElementById('receipt-modal');
const toastContainer = document.getElementById('toast-container');

/**
 * Initialize Application
 */
async function initApp() {
  setupEventListeners();
  await loadConfig();
  await loadProducts();
  await fetchCart();
  appendWelcomeMessage();
}

/**
 * Load Server Configuration
 */
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    appConfig = await res.json();
    const clientId = appConfig.clientId || appConfig.paypalClientId;

    if (clientId && clientId.length > 10) {
      loadPayPalScript(clientId);
    } else {
      demoSandboxBtn.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Config fetch failed:', err);
    demoSandboxBtn.classList.remove('hidden');
  }
}

/**
 * Dynamically load official PayPal JS SDK
 */
function loadPayPalScript(clientId) {
  if (document.getElementById('paypal-sdk-script')) return;

  const script = document.createElement('script');
  script.id = 'paypal-sdk-script';
  // Include buttons and enable debit/credit card funding
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&components=buttons&enable-funding=card`;
  script.onload = () => {
    console.log('[PayPal SDK] Live SDK loaded with client ID:', clientId.substring(0, 8) + '...');
    if (currentCart.checkoutReady) {
      renderPayPalButtons();
    }
  };
  script.onerror = () => {
    console.warn('[PayPal SDK] CDN load failed, activating backup direct gateway.');
    demoSandboxBtn.classList.remove('hidden');
  };
  document.head.appendChild(script);
}

/**
 * Load Catalog Products
 */
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    allProducts = data.products || [];
    renderProductsGrid();
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

/**
 * Render Visual Product Grid
 */
function renderProductsGrid() {
  let filtered = [...allProducts];

  // Category filter
  if (currentCategory !== 'all') {
    filtered = filtered.filter((p) => p.category.toLowerCase() === currentCategory.toLowerCase());
  }

  // Search keyword filter
  if (currentSearchTerm) {
    const term = currentSearchTerm.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(term))) ||
        (p.origin && p.origin.toLowerCase().includes(term))
    );
  }

  // Sort
  if (currentSort === 'price-asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (currentSort === 'price-desc') {
    filtered.sort((a, b) => b.price - a.price);
  } else if (currentSort === 'rating') {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  if (catalogCountDisplay) {
    catalogCountDisplay.textContent = `Showing ${filtered.length} curations`;
  }

  if (filtered.length === 0) {
    productsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <div style="font-size: 40px; margin-bottom: 12px;">🔍</div>
        <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 22px; color: var(--text-primary); margin-bottom: 6px;">No boutique curations found</h3>
        <p style="font-size: 13.5px;">Try adjusting your search terms or category selection.</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = filtered
    .map((product) => {
      const isDimmed = currentBudgetLimit && product.price > currentBudgetLimit;
      const originalPrice = product.originalPrice || Number((product.price * 1.35).toFixed(2));
      const discountPct = Math.round(((originalPrice - product.price) / originalPrice) * 100);
      const badgeHtml = getBadgeHtml(product);
      const stars = renderStars(product.rating || 4.8);
      const reviewsCount = product.reviewsCount || Math.floor(120 + product.price * 15);
      const delivery = product.deliveryEstimate || 'FREE Delivery Tomorrow, 11 AM';
      const stockText = product.stockUrgency || (product.stock <= 5 ? `Only ${product.stock} left in stock - order soon` : 'In Stock');
      const isUrgent = product.stock <= 5 || (product.stockUrgency && product.stockUrgency.includes('Only'));

      return `
      <div class="product-card ${isDimmed ? 'dimmed' : ''}" data-id="${product.id}">
        <div class="card-img-box" onclick="openQuickView('${product.id}')">
          <img src="${product.image}" alt="${product.name}" loading="lazy" />
          ${badgeHtml}
        </div>
        <div class="card-body">
          <div class="card-origin-tag">${product.origin ? product.origin.split(',')[0] : product.category}</div>
          <h4 class="card-title" onclick="openQuickView('${product.id}')" title="${product.name}">${product.name}</h4>
          
          <div class="card-rating-row" onclick="openQuickView('${product.id}')" style="cursor: pointer;">
            <span class="rating-stars">${stars}</span>
            <span class="rating-score">${(product.rating || 4.8).toFixed(1)}</span>
            <span class="rating-count">(${reviewsCount})</span>
          </div>

          <div class="card-pricing-block">
            <span class="deal-price"><span class="deal-symbol">$</span>${product.price.toFixed(2)}</span>
            <span class="mrp-strike">M.R.P.: $${originalPrice.toFixed(2)}</span>
            <span class="discount-pill">(${discountPct}% off)</span>
          </div>

          <div class="card-delivery-tag">
            <span class="prime-check">✓</span>
            <span>${delivery}</span>
          </div>

          <div class="card-stock-tag ${isUrgent ? 'urgent' : ''}">
            ${stockText}
          </div>

          <div class="card-actions-wrapper">
            <button class="btn-card-add-primary" data-id="${product.id}" data-name="${product.name}">
              <span>🛒 Add to Cart</span>
            </button>
            <div class="card-sub-actions">
              <button class="btn-card-sub btn-qv-trigger" onclick="openQuickView('${product.id}')" title="Quick View">
                <span>👁️ Details</span>
              </button>
              <button class="btn-card-sub btn-ask-trigger" data-id="${product.id}" data-name="${product.name}" title="Ask Aura">
                <span>💬 Ask Aura</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join('');

  // Add click listeners to card buttons
  productsGrid.querySelectorAll('.btn-card-add-primary').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pid = btn.dataset.id;
      const name = btn.dataset.name;
      btn.innerHTML = '<span>Adding...</span>';
      btn.disabled = true;
      await updateCartOnServer('add', pid, 1);
      btn.innerHTML = '<span>🛒 Add to Cart</span>';
      btn.disabled = false;
      showToast(`Added **${name}** to your shopping bag! 🛍️`);
    });
  });

  productsGrid.querySelectorAll('.btn-ask-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      openAuraChat();
      handleUserSendMessage(`Tell me more about ${name} and how it pairs with other items`);
    });
  });
}

/**
 * Star Rating Formatter
 */
function renderStars(rating) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.4;
  let str = '';
  for (let i = 0; i < full; i++) str += '★';
  if (hasHalf && str.length < 5) str += '★';
  while (str.length < 5) str += '☆';
  return str;
}

/**
 * Amazon / Flipkart Style Badge Helper
 */
function getBadgeHtml(product) {
  const badgeText = product.badge || product.luxuryBadge || '';
  if (!badgeText) return '';
  let badgeClass = 'badge-choice';
  const lower = badgeText.toLowerCase();
  if (lower.includes('bestseller') || lower.includes('#1')) {
    badgeClass = 'badge-bestseller';
  } else if (lower.includes('deal') || lower.includes('limited')) {
    badgeClass = 'badge-deal';
  } else if (lower.includes('artisan') || lower.includes('rare') || lower.includes('reserve')) {
    badgeClass = 'badge-artisan';
  }
  return `<span class="card-badge ${badgeClass}">${badgeText}</span>`;
}

/**
 * Floating AI Concierge Dock Controls
 */
function openAuraChat() {
  if (auraChatWindow) {
    auraChatWindow.classList.remove('hidden');
    chatInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function closeAuraChat() {
  if (auraChatWindow) {
    auraChatWindow.classList.add('hidden');
  }
}

function toggleAuraChat() {
  if (auraChatWindow) {
    const isHidden = auraChatWindow.classList.toggle('hidden');
    if (!isHidden) {
      chatInput.focus();
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }
}

/**
 * Event Listeners Setup
 */
function setupEventListeners() {
  // Category tabs
  categoryTabs.querySelectorAll('.cat-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      categoryTabs.querySelectorAll('.cat-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.category;
      renderProductsGrid();
    });
  });

  // Search input
  catalogSearch.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim();
    renderProductsGrid();
  });

  // Sort dropdown
  catalogSort.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderProductsGrid();
  });

  // Hero Budget Slider
  heroBudgetSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    currentBudgetLimit = val;
    sliderValDisplay.textContent = `$${val.toFixed(2)}`;
    sliderHintText.innerHTML = `Showing all boutique pairings and gift boxes under <strong>$${val.toFixed(2)}</strong>.`;
    renderProductsGrid();
  });

  heroBudgetSlider.addEventListener('change', async (e) => {
    const val = parseInt(e.target.value, 10);
    try {
      await fetch('/api/budget/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
        body: JSON.stringify({ budget: val }),
      });
      fetchCart();
    } catch (err) {
      console.error('Error syncing budget:', err);
    }
  });

  // Cart Drawer open/close
  cartToggleBtn.addEventListener('click', openCartDrawer);
  closeCartBtn.addEventListener('click', closeCartDrawer);
  cartDrawerBackdrop.addEventListener('click', closeCartDrawer);

  // Clear Cart
  clearCartBtn.addEventListener('click', async () => {
    await updateCartOnServer('clear');
    showToast('Your shopping bag has been cleared.');
  });

  // Promo Code Voucher
  applyPromoBtn.addEventListener('click', applyPromoCode);
  promoCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyPromoCode();
    }
  });

  // Prepare Checkout button
  prepareCheckoutBtn.addEventListener('click', () => {
    currentCart.checkoutReady = true;
    paymentAccordion.classList.remove('hidden');
    prepareCheckoutBtn.classList.add('hidden');
    renderPayPalButtons();
  });

  // Payment Tabs Switcher
  tabBtnPaypal.addEventListener('click', () => {
    tabBtnPaypal.classList.add('active');
    tabBtnCard.classList.remove('active');
    tabContentPaypal.classList.add('active');
    tabContentCard.classList.remove('active');
    renderPayPalButtons();
  });

  tabBtnCard.addEventListener('click', () => {
    tabBtnCard.classList.add('active');
    tabBtnPaypal.classList.remove('active');
    tabContentCard.classList.add('active');
    tabContentPaypal.classList.remove('active');
  });

  // Direct Debit / Credit Card Form Handler
  cardCheckoutForm.addEventListener('submit', handleCardFormSubmit);

  // Auto-format card number with spaces every 4 digits
  const cardNumInput = document.getElementById('card-number');
  cardNumInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '').substring(0, 16);
    let parts = [];
    for (let i = 0; i < val.length; i += 4) {
      parts.push(val.substring(i, i + 4));
    }
    e.target.value = parts.join(' ');
  });

  // Auto-format expiration date MM/YY
  const cardExpInput = document.getElementById('card-exp');
  cardExpInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '').substring(0, 4);
    if (val.length >= 3) {
      e.target.value = val.substring(0, 2) + '/' + val.substring(2);
    } else {
      e.target.value = val;
    }
  });

  // Backup direct simulation button
  demoSandboxBtn.addEventListener('click', async () => {
    await handleDirectPayPalDemoCheckout();
  });

  // Chat submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
      handleUserSendMessage(text);
      chatInput.value = '';
    }
  });

  // Floating AI Concierge Dock Controls
  if (auraLauncherBtn) {
    auraLauncherBtn.addEventListener('click', toggleAuraChat);
  }
  if (minimizeChatBtn) {
    minimizeChatBtn.addEventListener('click', closeAuraChat);
  }
  if (closeChatBtn) {
    closeChatBtn.addEventListener('click', closeAuraChat);
  }

  // Reset conversation
  clearChatBtn.addEventListener('click', () => {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    localStorage.setItem('haven_session_id', sessionId);
    chatMessages.innerHTML = '';
    paypalButtonsRendered = false;
    paypalBtnContainer.innerHTML = '';
    fetchCart();
    appendWelcomeMessage();
    showToast('Started a fresh session! 🔄');
  });

  // Quick View Modal
  closeQvBtn.addEventListener('click', closeQuickView);
  quickviewModal.addEventListener('click', (e) => {
    if (e.target === quickviewModal) closeQuickView();
  });

  qvQtyMinus.addEventListener('click', () => {
    if (currentQvQty > 1) {
      currentQvQty--;
      qvQtyDisplay.textContent = currentQvQty;
    }
  });

  qvQtyPlus.addEventListener('click', () => {
    currentQvQty++;
    qvQtyDisplay.textContent = currentQvQty;
  });

  qvAddBtn.addEventListener('click', async () => {
    if (currentQvProduct) {
      qvAddBtn.textContent = 'Adding...';
      qvAddBtn.disabled = true;
      await updateCartOnServer('add', currentQvProduct.id, currentQvQty);
      qvAddBtn.innerHTML = '<span>+ Add to Cart</span>';
      qvAddBtn.disabled = false;
      showToast(`Added **${currentQvQty}x ${currentQvProduct.name}** to your bag! 🛍️`);
      closeQuickView();
      openCartDrawer();
    }
  });

  qvAskBtn.addEventListener('click', () => {
    if (currentQvProduct) {
      const name = currentQvProduct.name;
      closeQuickView();
      openAuraChat();
      handleUserSendMessage(`Tell me more about ${name} and how it pairs with other items`);
    }
  });

  // Architecture & Receipt Modals
  document.getElementById('architecture-info-btn').addEventListener('click', () => {
    architectureModal.classList.remove('hidden');
  });
  document.getElementById('close-arch-btn').addEventListener('click', () => {
    architectureModal.classList.add('hidden');
  });
  document.getElementById('close-arch-btn-2').addEventListener('click', () => {
    architectureModal.classList.add('hidden');
  });

  document.getElementById('close-receipt-btn').addEventListener('click', () => {
    receiptModal.classList.add('hidden');
    fetchCart();
    appendMessage(
      'assistant',
      'Would you like help selecting anything else today, or perhaps crafting another bespoke gift box?'
    );
  });
}

function openCartDrawer() {
  cartDrawer.classList.add('open');
  cartDrawerBackdrop.classList.remove('hidden');
}

function closeCartDrawer() {
  cartDrawer.classList.remove('open');
  cartDrawerBackdrop.classList.add('hidden');
}

/**
 * Open Luxury Quick View Modal
 */
window.openQuickView = (productId) => {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;

  currentQvProduct = product;
  currentQvQty = 1;

  qvImg.src = product.image;
  qvBadge.textContent = product.luxuryBadge || product.category;
  qvCategory.textContent = product.category.toUpperCase();
  qvTitle.textContent = product.name;
  qvRating.textContent = `⭐ ${product.rating}`;
  qvReviews.textContent = `${product.reviewsCount || 150} Verified Reviews`;
  qvPrice.textContent = `$${product.price.toFixed(2)}`;
  qvDesc.textContent = product.description;
  qvOrigin.textContent = product.origin || 'Master Artisan Reserve';
  qvNotes.textContent = product.tastingNotes || 'Pure harmonious balance of natural aromas';
  qvSteeping.textContent = product.steeping || 'Carefully pack and store in cool dry place';
  qvQtyDisplay.textContent = currentQvQty;

  quickviewModal.classList.remove('hidden');
};

function closeQuickView() {
  quickviewModal.classList.add('hidden');
  currentQvProduct = null;
}

/**
 * Apply Promo Code Voucher
 */
async function applyPromoCode() {
  const code = promoCodeInput.value.trim();
  if (!code) return;

  applyPromoBtn.textContent = '...';
  applyPromoBtn.disabled = true;

  try {
    const res = await fetch('/api/cart/promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();
    if (data.error) {
      promoStatusMsg.textContent = data.error;
      promoStatusMsg.className = 'promo-msg text-danger';
      promoStatusMsg.classList.remove('hidden');
    } else {
      promoStatusMsg.textContent = data.message;
      promoStatusMsg.className = 'promo-msg text-success';
      promoStatusMsg.classList.remove('hidden');
      showToast(`Voucher **${data.promoCode}** applied! You saved $${data.discount.toFixed(2)}.`);
      fetchCart();
    }
  } catch (err) {
    promoStatusMsg.textContent = 'Failed to apply voucher.';
    promoStatusMsg.className = 'promo-msg text-danger';
    promoStatusMsg.classList.remove('hidden');
  } finally {
    applyPromoBtn.textContent = 'Apply';
    applyPromoBtn.disabled = false;
  }
}

/**
 * Handle Direct Debit / Credit Card Form Submission
 */
async function handleCardFormSubmit(e) {
  e.preventDefault();

  const cardholderName = document.getElementById('card-holder').value.trim();
  const cardNumber = document.getElementById('card-number').value.replace(/\s+/g, '');
  const expDate = document.getElementById('card-exp').value.trim();
  const cvv = document.getElementById('card-cvv').value.trim();
  const billingZip = document.getElementById('card-zip').value.trim();

  payCardBtn.disabled = true;
  payCardBtnText.textContent = 'Authorizing Debit Card via PayPal...';

  try {
    const res = await fetch('/api/paypal/card-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({
        cardholderName,
        cardNumber,
        expDate,
        cvv,
        billingZip,
      }),
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }

    handleOrderSuccess(data, `${data.cardType} (ending in ${data.cardLast4})`);
  } catch (err) {
    alert('Payment Card Authorization failed: ' + err.message);
  } finally {
    payCardBtn.disabled = false;
    payCardBtnText.textContent = `Pay with Debit Card ($${currentCart.total.toFixed(2)})`;
  }
}

/**
 * Render Official PayPal Smart Buttons
 */
function renderPayPalButtons() {
  if (paypalButtonsRendered) return;

  if (window.paypal && window.paypal.Buttons) {
    paypalBtnContainer.innerHTML = '';
    demoSandboxBtn.classList.add('hidden');

    try {
      window.paypal
        .Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'paypal',
          },
          createOrder: async () => {
            const res = await fetch('/api/paypal/create-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            return data.orderId;
          },
          onApprove: async (data) => {
            const res = await fetch('/api/paypal/capture-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
              body: JSON.stringify({ orderId: data.orderID }),
            });
            const details = await res.json();
            handleOrderSuccess(details, 'PayPal Wallet');
          },
          onError: (err) => {
            console.warn('[PayPal SDK] Transaction exception:', err);
            demoSandboxBtn.classList.remove('hidden');
          },
        })
        .render('#paypal-button-container');

      paypalButtonsRendered = true;
    } catch (err) {
      console.warn('Could not render PayPal Buttons:', err);
      demoSandboxBtn.classList.remove('hidden');
    }
  } else {
    demoSandboxBtn.classList.remove('hidden');
  }
}

/**
 * Handle Direct PayPal Sandbox Simulation
 */
async function handleDirectPayPalDemoCheckout() {
  demoSandboxBtn.disabled = true;
  demoSandboxBtn.textContent = 'Processing PayPal Sandbox Capture...';

  try {
    const orderRes = await fetch('/api/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    });
    const orderData = await orderRes.json();
    if (orderData.error) throw new Error(orderData.error);

    const captureRes = await fetch('/api/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({ orderId: orderData.orderId }),
    });
    const captureData = await captureRes.json();

    handleOrderSuccess(captureData, 'PayPal Sandbox Direct');
  } catch (err) {
    alert('PayPal Sandbox capture failed: ' + err.message);
  } finally {
    demoSandboxBtn.disabled = false;
    demoSandboxBtn.textContent = 'Approve with PayPal Sandbox (Direct Simulation)';
  }
}

/**
 * Handle Successful Payment Capture
 */
function handleOrderSuccess(details, paymentMethod = 'PayPal') {
  paypalButtonsRendered = false;
  paypalBtnContainer.innerHTML = '';
  closeCartDrawer();

  const orderId = details.orderId || details.capture?.id || 'ORD-VERIFIED';
  const amount = details.amount || (details.purchasedItems || []).reduce((s, i) => s + i.price * i.quantity, 0);

  document.getElementById('receipt-order-id').textContent = orderId;
  document.getElementById('receipt-method-badge').textContent = paymentMethod;
  document.getElementById('receipt-amount').textContent = `$${Number(amount).toFixed(2)} USD`;
  document.getElementById('receipt-ai-summary').textContent =
    details.summary || 'Thank you for your boutique order! Your purchase has been captured via PayPal Orders API v2.';

  receiptModal.classList.remove('hidden');
}

/**
 * Toast Notification Helper
 */
function showToast(markdownText) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = formatMarkdown(markdownText);
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fadeout');
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

/**
 * Welcome Message
 */
function appendWelcomeMessage() {
  appendMessage(
    'assistant',
    `Welcome to **The Cozy Book & Tea Haven**! ☕📖✨\n\nI am **Aura**, your dedicated AI shopping concierge. I can guide you through our single-estate teas, calculate gift pairings within your budget, or answer brewing and lifestyle questions.\n\n*Try asking:* **"I need a birthday gift for my sister under $30, she likes reading and tea."**`
  );
}

/**
 * Send user message to /api/chat
 */
async function handleUserSendMessage(messageText) {
  appendMessage('user', messageText);

  const typingEl = showTypingIndicator();
  chatInput.disabled = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({ message: messageText }),
    });

    const data = await res.json();
    typingEl.remove();

    if (data.error) {
      appendMessage('assistant', `⚠️ Sorry, I encountered an issue: ${data.error}`);
    } else {
      // Natural clean response (zero debug pills)
      appendMessage('assistant', data.reply);

      if (data.cart) {
        updateCartUI(data.cart);
        if (data.cart.checkoutReady) {
          openCartDrawer();
          paymentAccordion.classList.remove('hidden');
          prepareCheckoutBtn.classList.add('hidden');
          renderPayPalButtons();
        }
      }
    }
  } catch (err) {
    typingEl.remove();
    console.error('Chat error:', err);
    appendMessage('assistant', '⚠️ Unable to connect to shopping server. Please check connection.');
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

/**
 * Append message bubble to chat feed
 */
function appendMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatMarkdown(text);

  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  wrapper.querySelectorAll('.btn-add-mini').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.id;
      btn.textContent = 'Adding...';
      btn.disabled = true;
      await handleUserSendMessage(`Add ${pid}`);
    });
  });

  return wrapper;
}

/**
 * Show animated typing indicator
 */
function showTypingIndicator() {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-wrapper assistant';
  wrapper.id = 'typing-indicator';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<em>Aura is contemplating...</em>';

  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrapper;
}

/**
 * Fetch authoritative cart from server
 */
async function fetchCart() {
  try {
    const res = await fetch('/api/cart', {
      headers: { 'x-session-id': sessionId },
    });
    const cart = await res.json();
    updateCartUI(cart);
  } catch (err) {
    console.error('Failed to fetch cart:', err);
  }
}

/**
 * Update cart on server
 */
async function updateCartOnServer(action, productId = null, quantity = 1) {
  try {
    const res = await fetch('/api/cart/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({ action, productId, quantity }),
    });
    const data = await res.json();
    if (data.success) {
      fetchCart();
    }
  } catch (err) {
    console.error('Error updating cart:', err);
  }
}

/**
 * Update Cart UI across Header and Drawer
 */
function updateCartUI(cart) {
  currentCart = cart;

  const count = (cart.items || []).reduce((sum, item) => sum + item.quantity, 0);
  const formattedSubtotal = `$${Number(cart.subtotal || cart.total).toFixed(2)}`;
  const formattedTotal = `$${Number(cart.total).toFixed(2)}`;

  // Header badges
  headerCartBadge.textContent = count;
  headerCartTotal.textContent = formattedTotal;
  drawerCartCount.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;

  // Drawer totals
  cartSubtotal.textContent = formattedSubtotal;
  cartGrandTotal.textContent = formattedTotal;
  payCardBtnText.textContent = `Pay $${Number(cart.total).toFixed(2)} with Debit Card`;

  // Promo discount row
  if (cart.discount && cart.discount > 0) {
    promoDiscountRow.classList.remove('hidden');
    promoNameDisplay.textContent = cart.promoCode || 'COZY10';
    promoDiscountAmount.textContent = `-$${Number(cart.discount).toFixed(2)}`;
  } else {
    promoDiscountRow.classList.add('hidden');
  }

  // Budget Guard update
  if (cart.budget && cart.budget > 0) {
    budgetGuardWidget.classList.remove('hidden');
    budgetProgressText.textContent = `${formattedTotal} / $${cart.budget.toFixed(2)}`;

    const percentage = Math.min(100, Math.round((cart.total / cart.budget) * 100));
    budgetProgressBar.style.width = `${percentage}%`;

    budgetProgressBar.className = 'budget-fill';
    if (cart.total > cart.budget) {
      budgetProgressBar.classList.add('danger');
      budgetStatusTip.textContent = `⚠️ Exceeds spending limit by $${(cart.total - cart.budget).toFixed(2)}`;
      budgetStatusTip.className = 'budget-guard-hint text-danger';
    } else if (percentage >= 85) {
      budgetProgressBar.classList.add('warning');
      budgetStatusTip.textContent = `Near budget cap ($${(cart.budget - cart.total).toFixed(2)} remaining)`;
      budgetStatusTip.className = 'budget-guard-hint';
    } else {
      budgetStatusTip.textContent = `$${(cart.budget - cart.total).toFixed(2)} remaining within budget`;
      budgetStatusTip.className = 'budget-guard-hint text-success';
    }
  } else {
    budgetGuardWidget.classList.add('hidden');
  }

  // Render Drawer Items
  if (!cart.items || cart.items.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="cart-empty-box">
        <div class="cart-empty-icon">🧺</div>
        <h4 style="font-family: 'Cormorant Garamond', serif; font-size: 20px; color: var(--text-primary); margin-bottom: 6px;">Your shopping bag is empty</h4>
        <p style="font-size: 13px;">Explore the single-estate teas and reading essentials above to add items.</p>
      </div>
    `;
    prepareCheckoutBtn.disabled = true;
    paymentAccordion.classList.add('hidden');
    prepareCheckoutBtn.classList.remove('hidden');
    return;
  }

  prepareCheckoutBtn.disabled = false;

  cartItemsContainer.innerHTML = cart.items
    .map((item) => {
      return `
      <div class="cart-item-row" data-id="${item.productId}">
        <img class="cart-item-thumb" src="${item.image}" alt="${item.name}" />
        <div class="cart-item-info">
          <div class="cart-item-title">${item.name}</div>
          <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
        </div>
        <div class="cart-qty-controls">
          <button class="qty-btn" onclick="modifyItem('${item.productId}', 'decrease')">-</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn" onclick="modifyItem('${item.productId}', 'add')">+</button>
        </div>
      </div>
    `;
    })
    .join('');

  if (cart.checkoutReady) {
    paymentAccordion.classList.remove('hidden');
    prepareCheckoutBtn.classList.add('hidden');
    renderPayPalButtons();
  } else {
    paymentAccordion.classList.add('hidden');
    prepareCheckoutBtn.classList.remove('hidden');
  }
}

window.modifyItem = (productId, action) => {
  updateCartOnServer(action, productId, 1);
};

/**
 * Format Markdown
 */
function formatMarkdown(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  const paragraphs = html.split('\n\n');
  return paragraphs
    .map((p) => {
      if (p.includes('\n• ') || p.startsWith('• ')) {
        const items = p.split('\n').map((line) => {
          if (line.startsWith('• ')) {
            return `<li>${line.substring(2)}</li>`;
          }
          return line;
        });
        return `<ul>${items.join('')}</ul>`;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
