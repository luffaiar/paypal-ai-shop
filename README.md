# The Cozy Book & Tea Haven — Autonomous AI Shopping Storefront & PayPal Orders v2 Suite

An intelligent e-commerce storefront designed in the high-converting visual style of **Amazon and Flipkart**, powered by an autonomous **AI Shopping Concierge (Aura)** with function tool calling and a **live Dual Payment Suite (PayPal Smart Buttons + Direct Debit/Credit Card processing)**.

---

## 🏛️ Project Architecture

```
paypal-ai-shop/
├── server.js        # Express app, authoritative pricing engine, PayPal v2 routes, session handling
├── ai.js            # LLM tool calling suite, conversational intelligence, and budget guard
├── paypal.js        # PayPal Orders API v2 OAuth, createOrder (with discount breakdown), captureOrder
├── products.json    # 32-product artisan catalog (prices, M.R.P., badges, stock, ratings, tasting notes)
├── test_api.js      # Comprehensive 8-suite automated test verification runner
├── public/
│   ├── index.html   # Amazon/Flipkart full-width catalog, floating AI dock, drawer cart, modals
│   ├── style.css    # Amazon & Flipkart responsive e-commerce design + floating assistant styles
│   └── app.js       # Live catalog rendering, floating dock toggles, cart sync, PayPal SDK integration
├── .env             # Secrets (gitignored - NEVER commit to GitHub)
├── .env.example     # Environment template with dummy placeholders
├── .gitignore       # Excludes .env, node_modules, and logs
└── README.md
```

---

## 🌟 Key Features

### 1. Amazon & Flipkart Style Storefront
- **100% Full-Width Catalog Grid**: 4–5 column responsive product grid featuring 32 artisan loose-leaf teas, reading accessories, homeware, and gift sets.
- **High-Converting Product Badges**: `#1 Bestseller`, `Haven's Choice`, `Limited Deal`, and `Sommelier's Pick`.
- **E-Commerce Pricing Breakdown**:
  - Prominent deal price (e.g. `$14.50`)
  - Strikethrough reference price (e.g. `M.R.P.: $22.00`)
  - Discount percentage pill (e.g. `(34% off)`)
- **Star Ratings & Reviews**: Amber gold stars (`★★★★★`), numeric rating, and review count links.
- **Fast Delivery & Urgency Tags**: `✓ FREE Delivery Tomorrow, 11 AM` badge and live stock urgency alerts (`Only 3 left in stock - order soon`).
- **Amazon Gold Buttons**: Primary `#ffd814` Add to Cart buttons, Quick View inspection modals, and `💬 Ask Aura` buttons.

### 2. Floating AI Concierge Dock (Amazon Rufus / Flipkart Flippi Style)
- **Non-Intrusive Floating Launcher**: Anchored at the bottom-right corner (`🤖 Ask Aura • AI Concierge`) with a pulsing online status dot.
- **Slide-Up Assistant Window**: Compact floating chat card with Minimize (`⎯`), Reset (`🔄`), and Close (`✕`) controls.
- **Direct Catalog Integration**: Clicking `💬 Ask Aura` on any product card or in the Quick View modal automatically pops up the assistant and asks about pairings, flavors, or steeping instructions.
- **Conversational Intelligence**: Handles casual greetings (`"hi"`, `"how are you"`) and lifestyle questions (*"Why is loose leaf tea better than tea bags?"*, *"Why is amber light better for night reading?"*) with depth and warmth, without unsolicited product dumping.

### 3. Dual Payment Suite (PayPal Smart Buttons + Direct Debit Card)
- **Official PayPal Smart Buttons**: Gold PayPal button rendered via the official PayPal JS SDK, communicating with PayPal Orders API v2.
- **Direct Debit / Credit Card Form**: High-security card checkout tab with real-time digit spacing, MM/YY auto-slash, CVV masking, and server-side capture.
- **Discount Breakdown Support**: Fully complies with PayPal Orders API v2 item_total vs discount breakdown rules (supports vouchers like `COZY10` for 10% off).

### 4. Security Rule: Authoritative Server-Side Pricing (Judges Security Safeguard)
- **Zero Client Trust**: Neither the browser client nor the AI model can dictate transaction amounts.
- **Direct Database Calculation**: When `/api/paypal/create-order` or `/api/paypal/card-checkout` is called, the server looks up the product IDs directly in `products.json`, computes the exact sum, applies verified server vouchers, and communicates directly with PayPal Orders API v2.

### 5. Human-in-the-Loop Safeguard
- The AI concierge finds products, tracks spending budgets, and builds the cart, but **never moves money autonomously**.
- Final checkout always requires explicit human approval via PayPal Smart Buttons or direct Debit Card authorization.

---

## 🧪 Automated Test Suite (8/8 Verified)

Run the full automated test suite to verify all backend routes and PayPal APIs:

```bash
node test_api.js
```

**Test Coverage:**
1. `GET /api/config` — Public configuration and credentials check.
2. `POST /api/chat` — Shopping query with `set_budget_guard` and `search_products`.
3. `POST /api/chat` — Sequential multi-item addition (`add_to_cart`).
4. `POST /api/chat` — Order preparation and checkout lock (`prepare_checkout`).
5. `POST /api/paypal/create-order` — PayPal Orders API v2 live order generation.
6. `POST /api/paypal/capture-order` — Payment capture & personalized AI summary letter.
7. `POST /api/cart/promo` — Server voucher validation (`COZY10` 10% off).
8. `POST /api/paypal/card-checkout` — Direct debit card authorization & capture.

---

## 🛠️ Setup

1. **Clone the repository and install dependencies**:
   ```bash
   git clone <your-github-repo-url>
   cd paypal-ai-shop
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your PayPal Sandbox credentials and AI API key:
   ```env
   PAYPAL_CLIENT_ID=your_paypal_client_id
   PAYPAL_SECRET=your_paypal_secret
   AI_API_KEY=your_ai_api_key
   PORT=3000
   ```

3. **Start the server**:
   ```bash
   npm start
   ```
   Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🔒 Security

- **Secrets in env vars only**: All API keys and secrets (`PAYPAL_SECRET`, `PAYPAL_CLIENT_ID`, `AI_API_KEY`) reside exclusively in `.env` (gitignored). They are never exposed to the frontend browser or committed to GitHub.
- **Server-side authoritative totals**: The backend recomputes all cart subtotals and discounts directly from `products.json`. The server never trusts amounts or item prices sent from the client or generated by an LLM.
- **Rate limiting & payload cap**: Protected against brute-force and abuse using `express-rate-limit` (20 requests per minute per IP on all `/api/` endpoints) and `express.json({ limit: '10kb' })`.
- **Human confirmation before payment**: The AI agent prepares orders, calculates budget adherence, and recommends curations, but **never executes payments autonomously**. Final payment requires explicit human authorization through official PayPal Smart Buttons or direct debit card verification.
- **Generic error responses**: API endpoints return sanitized, generic error responses to prevent leaking upstream gateway headers, internal stack traces, or authentication tokens.

---

## 📄 License
MIT License. Crafted for demonstrations and hackathons.
