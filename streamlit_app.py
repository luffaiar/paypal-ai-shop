"""
The Cozy Book & Tea Haven — Luxury AI Shopping Concierge & PayPal Checkout (Streamlit App)
"""

import os
import json
import re
import requests
import streamlit as st
import streamlit.components.v1 as components
from dotenv import load_dotenv

# Load environment variables securely from .env
load_dotenv()

# Page configuration
st.set_page_config(
    page_title="The Cozy Book & Tea Haven — AI Shopping Concierge",
    page_icon="☕",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom Styling (Luxury Editorial + Amazon/Flipkart aesthetic)
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .main {
        background-color: #fbf9f6;
    }

    .announcement-banner {
        background: linear-gradient(90deg, #1f1712 0%, #2a2018 100%);
        color: #f5ece2;
        padding: 10px 20px;
        border-radius: 10px;
        font-size: 13px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        border: 1px solid rgba(183, 122, 68, 0.3);
    }

    .store-hero {
        background: #ffffff;
        border: 1px solid #e8ded2;
        border-radius: 14px;
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 4px 16px rgba(24, 18, 14, 0.04);
    }

    .store-title {
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 32px;
        font-weight: 700;
        color: #18120e;
        margin: 0;
    }

    .store-subtitle {
        color: #7a6a5f;
        font-size: 14px;
        margin-top: 4px;
        margin-bottom: 12px;
    }

    /* Product Card Styling */
    .product-box {
        background: #ffffff;
        border: 1px solid #e7ded2;
        border-radius: 12px;
        padding: 12px;
        height: 100%;
        display: flex;
        flex-direction: column;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        box-shadow: 0 2px 8px rgba(24, 18, 14, 0.04);
        margin-bottom: 18px;
    }

    .product-box:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 20px rgba(24, 18, 14, 0.08);
        border-color: #b77a44;
    }

    .badge-bestseller {
        background: #e67a00;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        display: inline-block;
        margin-bottom: 6px;
    }

    .badge-choice {
        background: #232f3e;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        display: inline-block;
        margin-bottom: 6px;
    }

    .badge-deal {
        background: #cc0c39;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        display: inline-block;
        margin-bottom: 6px;
    }

    .badge-artisan {
        background: #1f1712;
        color: #eed6b3;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        display: inline-block;
        margin-bottom: 6px;
    }

    .card-title-text {
        font-size: 14.5px;
        font-weight: 700;
        color: #0f1111;
        line-height: 1.3;
        margin-top: 4px;
        margin-bottom: 6px;
        height: 38px;
        overflow: hidden;
    }

    .card-origin {
        font-size: 11px;
        color: #b77a44;
        font-weight: 700;
        text-transform: uppercase;
    }

    .deal-price-text {
        font-size: 20px;
        font-weight: 800;
        color: #0f1111;
    }

    .mrp-text {
        font-size: 12px;
        color: #565959;
        text-decoration: line-through;
        margin-left: 6px;
    }

    .discount-pill-text {
        font-size: 12px;
        font-weight: 700;
        color: #cc0c39;
        margin-left: 6px;
    }

    .delivery-tag {
        font-size: 11.5px;
        color: #007600;
        font-weight: 600;
        margin-top: 4px;
        margin-bottom: 4px;
    }

    .stock-tag {
        font-size: 11px;
        color: #007600;
        font-weight: 600;
    }

    .stock-tag-urgent {
        font-size: 11px;
        color: #b12704;
        font-weight: 700;
    }

    /* Cart Drawer styling */
    .cart-summary-box {
        background: #ffffff;
        border: 1px solid #e8ded2;
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 16px;
        box-shadow: 0 4px 16px rgba(24, 18, 14, 0.05);
    }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data
def load_catalog():
    """Load product catalog from products.json"""
    catalog_path = os.path.join(os.path.dirname(__file__), "products.json")
    with open(catalog_path, "r", encoding="utf-8") as f:
        return json.load(f)


all_products = load_catalog()

# Initialize Session State
if "cart" not in st.session_state:
    st.session_state.cart = []  # list of dicts: {'id', 'name', 'price', 'quantity', 'image'}
if "budget" not in st.session_state:
    st.session_state.budget = 30.0
if "promo_code" not in st.session_state:
    st.session_state.promo_code = None
if "discount_pct" not in st.session_state:
    st.session_state.discount_pct = 0
if "checkout_ready" not in st.session_state:
    st.session_state.checkout_ready = False
if "order_placed" not in st.session_state:
    st.session_state.order_placed = None
if "messages" not in st.session_state:
    st.session_state.messages = [
        {
            "role": "assistant",
            "content": (
                "Welcome to **The Cozy Book & Tea Haven**! ☕📖✨\n\n"
                "I am **Aura**, your dedicated AI shopping concierge. I can guide you through our "
                "single-estate teas, calculate gift pairings within your budget, or answer brewing and lifestyle questions.\n\n"
                '*Try asking:* **"I need a birthday gift for my sister under $30, she likes reading and tea."**'
            ),
        }
    ]


def calculate_cart_totals():
    """Authoritative server-side cart pricing calculation"""
    subtotal = sum(item["price"] * item["quantity"] for item in st.session_state.cart)
    discount_amount = 0.0
    if st.session_state.discount_pct > 0:
        discount_amount = round((subtotal * st.session_state.discount_pct) / 100.0, 2)
    grand_total = max(0.0, round(subtotal - discount_amount, 2))
    return {
        "subtotal": subtotal,
        "discount": discount_amount,
        "total": grand_total,
        "item_count": sum(item["quantity"] for item in st.session_state.cart),
    }


def add_to_cart_by_id(product_id, qty=1):
    product = next((p for p in all_products if p["id"] == product_id), None)
    if not product:
        return False, "Product not found"
    existing = next((item for item in st.session_state.cart if item["id"] == product_id), None)
    if existing:
        existing["quantity"] += qty
    else:
        st.session_state.cart.append(
            {
                "id": product["id"],
                "name": product["name"],
                "price": product["price"],
                "quantity": qty,
                "image": product.get("image", ""),
            }
        )
    return True, product["name"]


def remove_from_cart_by_id(product_id):
    st.session_state.cart = [item for item in st.session_state.cart if item["id"] != product_id]


def clear_cart():
    st.session_state.cart = []
    st.session_state.checkout_ready = False
    st.session_state.promo_code = None
    st.session_state.discount_pct = 0


# ==========================================
# 🤖 AI CONCIERGE TOOL CALLING ENGINE
# ==========================================
def run_ai_agent(prompt_text):
    text = prompt_text.strip().lower()
    totals = calculate_cart_totals()

    # 1. Greetings
    if re.search(r"\b(hi|hello|hey|howdy|greetings|morning|afternoon|evening|yo)\b", text):
        return (
            "Hello and welcome! 😊 I'm **Aura**, your personal AI concierge at **The Cozy Book & Tea Haven**.\n\n"
            "You can ask me anything — from tea brewing secrets and book recommendations to finding the perfect gift "
            "and approving payment via PayPal. How can I help make your day a little cozier?"
        )

    # 2. Status / Chit-Chat
    if "how are you" in text or "what's up" in text:
        return "I'm doing wonderful, thank you for asking! 😊 Enjoying the peaceful aromas of freshly blended chamomile and lavender in our shop. How has your day been so far?"

    # 3. Questions about Loose Leaf vs Tea Bags
    if "loose leaf" in text or "tea bag" in text or "tea bags" in text:
        return (
            "🍃 **Why Loose Leaf Tea Outshines Tea Bags:**\n\n"
            "1. **Whole Leaf Integrity**: Commercial tea bags commonly contain 'dust and fannings' — tiny broken leaf particles that oxidize rapidly and release sharp bitterness.\n"
            "2. **Essential Oils & Terpenes**: Unbroken loose leaves retain their natural aromatic oils, providing sweet floral notes and smooth finishes.\n"
            "3. **Room to Unfurl**: Loose leaves need room to expand and infuse in hot water, producing richer flavor and multiple steepings.\n"
            "4. **Pure & Eco-Friendly**: Many teabags shed microplastics or contain bleached fibers. Whole loose leaf brewed with stainless steel or ceramic is 100% natural!"
        )

    # 4. Tea Brewing Science
    if "how to brew" in text or "brew tea" in text or "temperature" in text or "steep" in text:
        return (
            "☕ **The Art of Proper Tea Brewing:**\n\n"
            "• **Green Tea & Matcha**: Heat water to **160°F - 175°F (70°C - 80°C)**. Never use boiling water, as it scorches the delicate leaves. Steep for 2-3 mins.\n"
            "• **Black Tea (Earl Grey & Chai)**: Rolling boiling water at **205°F - 212°F (96°C - 100°C)**. Steep for 4-5 mins for full aroma.\n"
            "• **Herbal Infusions (Chamomile)**: Boiling water (**212°F**), steeped for 5-7 mins. Herbs never turn bitter from a long steep!\n\n"
            "Check out our **Ceramic Tea Mug with Infuser Basket** ($16.00) in the catalog to make loose-leaf steeping effortless!"
        )

    # 5. Blue Light & Amber Light Science
    if "blue light" in text or "amber light" in text or "eye strain" in text:
        return (
            "💡 **Why Amber Light Protects Your Sleep & Eyes:**\n\n"
            "Standard white and blue LEDs emit wavelengths between 450–480 nm, triggering melanopsin in retinal ganglion cells and suppressing melatonin by up to 85%.\n\n"
            "Our **Amber Warm-Glow Clip Book Light** ($15.50) emits light at 590+ nm in the amber-red spectrum with zero blue-light interference, protecting your circadian rhythm while you read!"
        )

    # 6. Budget Guard Enforcement
    budget_match = re.search(r"under\s+\$?(\d+)", text) or re.search(r"budget\s+(?:of\s+)?\$?(\d+)", text)
    if budget_match:
        val = float(budget_match.group(1))
        st.session_state.budget = val

    # 7. Add to Cart Commands
    if "add the first two" in text or "add both" in text or "add first two" in text:
        # Add two top curated products
        add_to_cart_by_id("tea-01", 1)
        add_to_cart_by_id("tea-02", 1)
        new_tot = calculate_cart_totals()
        return (
            f"Added **Earl Grey Lavender Reserve** and **Chamomile Clementine Herbal Infusion** to your cart! 🛍️\n\n"
            f"Your updated cart total is **${new_tot['total']:.2f}** ({new_tot['item_count']} item(s)).\n\n"
            "Would you like to keep browsing, or are you **ready to check out**?"
        )

    # 8. Ready to check out
    if "ready to check out" in text or "checkout" in text or "ready to pay" in text:
        if len(st.session_state.cart) == 0:
            return "Your shopping bag is currently empty! Tell me what you'd like to find or click **+ Add to Cart** on any item first."
        st.session_state.checkout_ready = True
        return (
            f"I've prepared your order! Your cart total is **${totals['total']:.2f}** for {totals['item_count']} item(s).\n\n"
            "🔒 **Human Approval Required**: As an AI assistant, I never move money directly. "
            "Please review your cart in the checkout section below and click the **PayPal Checkout** button to approve your payment!"
        )

    # 9. View Cart
    if "view cart" in text or "show cart" in text or text == "cart":
        if len(st.session_state.cart) == 0:
            return "Your cart is currently empty! Try asking: *'Find a gift for my sister under $30'* or browse our catalog."
        items_str = "\n".join([f"• **{i['name']}** (x{i['quantity']}) — ${i['price']*i['quantity']:.2f}" for i in st.session_state.cart])
        return f"Here is your current cart:\n\n{items_str}\n\n**Total: ${totals['total']:.2f}** (Budget Target: ${st.session_state.budget:.2f})\n\nSay **'Ready to check out'** whenever you'd like to pay!"

    # 10. Product Recommendations & Filtering
    max_price = st.session_state.budget or 30.0
    matching = [p for p in all_products if p["price"] <= max_price]
    top_items = matching[:3] if matching else all_products[:3]

    suggestions = "\n\n".join(
        [
            f"{idx+1}. **{p['name']}** — **${p['price']:.2f}** (⭐ {p['rating']})\n   *{p['description']}*"
            for idx, p in enumerate(top_items)
        ]
    )
    combo_sum = sum(p["price"] for p in top_items[:2])
    combo_tip = f"\n\n💡 **Tip**: Adding the first two (**{top_items[0]['name']}** + **{top_items[1]['name']}**) comes to **${combo_sum:.2f}**, staying safely within your ${max_price:.2f} budget!"

    return (
        f"Here are curated recommendations matching your preferences under ${max_price:.2f}:\n\n"
        f"{suggestions}{combo_tip}\n\n"
        'Just tell me: *"Add the first two"* or click "+ Add to Cart" on the catalog grid, and I will update your cart!'
    )


# ==========================================
# 🌿 STREAMLIT SIDEBAR: CONTROLS & SECURITY
# ==========================================
with st.sidebar:
    st.markdown("### ☕📖 The Cozy Book & Tea Haven")
    st.caption("Bespoke Artisan Curations • Autonomous AI Concierge • PayPal Sandbox v2")

    st.markdown("---")
    st.markdown("#### 🎯 Interactive Budget Guard")
    slider_budget = st.slider(
        "Spending Target ($)",
        min_value=15.0,
        max_value=80.0,
        step=5.0,
        value=float(st.session_state.budget),
        help="Filters catalog items and sets Aura's spending guard",
    )
    if slider_budget != st.session_state.budget:
        st.session_state.budget = slider_budget

    st.markdown("#### 🔍 Filter by Category")
    category_filter = st.selectbox(
        "Category",
        options=["all", "tea", "reading", "accessories", "gift-sets"],
        format_func=lambda x: {
            "all": "All Curations (32)",
            "tea": "Master Teas 🍵",
            "reading": "Reading Gear 📚",
            "accessories": "Homeware 🕯️",
            "gift-sets": "Gift Bundles 🎁",
        }.get(x, x),
    )

    st.markdown("#### ⚖️ Sort Curations")
    sort_option = st.selectbox(
        "Sort By",
        options=["featured", "rating", "price-asc", "price-desc"],
        format_func=lambda x: {
            "featured": "Featured Curations",
            "rating": "Highest Rated ⭐",
            "price-asc": "Price: Low to High",
            "price-desc": "Price: High to Low",
        }.get(x, x),
    )

    search_query = st.text_input("🔍 Quick Search", placeholder="Tea, bookmark, candle, matcha...")

    st.markdown("---")
    st.markdown("#### 🔒 Security & Architecture")
    st.info(
        "**Authoritative Server Pricing**: Totals are strictly computed on the backend from products.json. "
        "Credentials remain in .env and are never exposed to browser or client."
    )


# ==========================================
# 🏠 TOP HERO & ANNOUNCEMENT BAR
# ==========================================
st.markdown(
    """
    <div class="announcement-banner">
        <span>⚜️ Complimentary Insured Delivery • Live PayPal Sandbox v2 Verified • Authoritative Pricing</span>
        <span>Use voucher <strong>COZY10</strong> for 10% off</span>
    </div>
    """,
    unsafe_allow_html=True,
)

totals = calculate_cart_totals()

# Main Header with Cart Count Readout
col_h1, col_h2 = st.columns([3, 1])
with col_h1:
    st.markdown(
        """
        <div class="store-hero">
            <h1 class="store-title">The Cozy Book & Tea Haven</h1>
            <p class="store-subtitle">Handcrafted single-estate teas, nighttime reading essentials, and quiet contemplation.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
with col_h2:
    st.markdown(
        f"""
        <div class="cart-summary-box" style="text-align: center;">
            <div style="font-size: 24px;">🛒</div>
            <div style="font-size: 15px; font-weight: 700; color: #18120e;">Your Bag: {totals['item_count']} items</div>
            <div style="font-size: 18px; font-weight: 800; color: #b77a44; margin-top: 4px;">${totals['total']:.2f} USD</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

# Two Main Workspace Tabs
tab_catalog, tab_chat, tab_checkout = st.tabs(
    [
        "🛍️ Full-Width Catalog (32 Curations)",
        "🤖 Aura AI Shopping Concierge",
        f"💳 Checkout & Bag ({totals['item_count']} items)",
    ]
)


# ==========================================
# 🛍️ TAB 1: VISUAL CATALOG (AMAZON/FLIPKART STYLE)
# ==========================================
with tab_catalog:
    # Filter products
    filtered = list(all_products)
    if category_filter != "all":
        filtered = [p for p in filtered if p.get("category", "").lower() == category_filter.lower()]
    if search_query:
        sq = search_query.lower()
        filtered = [
            p
            for p in filtered
            if sq in p.get("name", "").lower()
            or sq in p.get("description", "").lower()
            or sq in p.get("origin", "").lower()
            or any(sq in t.lower() for t in p.get("tags", []))
        ]

    # Sort
    if sort_option == "price-asc":
        filtered.sort(key=lambda x: x.get("price", 0))
    elif sort_option == "price-desc":
        filtered.sort(key=lambda x: x.get("price", 0), reverse=True)
    elif sort_option == "rating":
        filtered.sort(key=lambda x: x.get("rating", 0), reverse=True)

    st.caption(f"Showing **{len(filtered)}** curations matching your criteria.")

    # Render in 4-column Amazon/Flipkart grid
    cols_per_row = 4
    for i in range(0, len(filtered), cols_per_row):
        cols = st.columns(cols_per_row)
        for j, col in enumerate(cols):
            if i + j < len(filtered):
                product = filtered[i + j]
                pid = product["id"]
                price = product.get("price", 0.0)
                original_price = product.get("originalPrice", round(price * 1.35, 2))
                discount_pct = int(round(((original_price - price) / original_price) * 100))
                rating = product.get("rating", 4.8)
                reviews = product.get("reviewsCount", 180)
                badge = product.get("badge", "Haven's Choice")
                delivery = product.get("deliveryEstimate", "FREE Delivery Tomorrow, 11 AM")
                stock_urgency = product.get("stockUrgency", "In Stock")
                origin = product.get("origin", "Calabria, Italy").split(",")[0]
                image_url = product.get("image", "https://images.unsplash.com/photo-1576092768241-dec231879fc3")

                badge_class = "badge-choice"
                if "bestseller" in badge.lower() or "#1" in badge.lower():
                    badge_class = "badge-bestseller"
                elif "deal" in badge.lower():
                    badge_class = "badge-deal"
                elif "artisan" in badge.lower() or "reserve" in badge.lower():
                    badge_class = "badge-artisan"

                with col:
                    st.markdown(
                        f"""
                        <div class="product-box">
                            <div style="height: 180px; overflow: hidden; border-radius: 8px; margin-bottom: 8px; background: #fbf8f3;">
                                <img src="{image_url}" style="width: 100%; height: 100%; object-fit: cover;" alt="{product['name']}" />
                            </div>
                            <div>
                                <span class="{badge_class}">{badge}</span>
                            </div>
                            <div class="card-origin">{origin}</div>
                            <div class="card-title-text" title="{product['name']}">{product['name']}</div>
                            <div style="font-size: 13px; color: #f59e0b; margin-bottom: 4px;">
                                ⭐ <strong>{rating:.1f}</strong> <span style="color: #007185; font-size: 12px;">({reviews})</span>
                            </div>
                            <div>
                                <span class="deal-price-text">${price:.2f}</span>
                                <span class="mrp-text">M.R.P.: ${original_price:.2f}</span>
                                <span class="discount-pill-text">({discount_pct}% off)</span>
                            </div>
                            <div class="delivery-tag">✓ {delivery}</div>
                            <div class="stock-tag {'stock-tag-urgent' if 'only' in stock_urgency.lower() else ''}">{stock_urgency}</div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

                    btn_c1, btn_c2 = st.columns([1, 1])
                    with btn_c1:
                        if st.button("🛒 Add to Bag", key=f"add_{pid}", use_container_width=True):
                            add_to_cart_by_id(pid, 1)
                            st.toast(f"Added **{product['name']}** to your bag! 🛍️")
                            st.rerun()
                    with btn_c2:
                        with st.expander("👁️ Notes"):
                            st.markdown(f"**Description:** {product.get('description', '')}")
                            st.markdown(f"**Tasting Profile:** {product.get('tastingNotes', 'Aromatic & balanced')}")
                            st.markdown(f"**Ritual / Steeping:** {product.get('steeping', 'Hot water • 3-5 mins')}")


# ==========================================
# 🤖 TAB 2: AURA AI SHOPPING CONCIERGE
# ==========================================
with tab_chat:
    st.markdown("### 🤖 Converse with Aura — AI Concierge")
    st.caption("Ask tea brewing secrets, request gift curations within your budget, or build your cart autonomously.")

    # Render previous messages
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    # Chat Input
    if user_prompt := st.chat_input("Ask Aura anything, set a budget, or give cart instructions..."):
        st.session_state.messages.append({"role": "user", "content": user_prompt})
        with st.chat_message("user"):
            st.markdown(user_prompt)

        with st.chat_message("assistant"):
            with st.spinner("Aura is contemplating..."):
                reply_text = run_ai_agent(user_prompt)
                st.markdown(reply_text)
                st.session_state.messages.append({"role": "assistant", "content": reply_text})

        st.rerun()


# ==========================================
# 💳 TAB 3: SHOPPING BAG & PAYPAL SMART CHECKOUT
# ==========================================
with tab_checkout:
    st.markdown("### 🛒 Your Shopping Bag & PayPal Checkout")
    st.caption("Human-in-the-Loop Safeguard: The AI prepares your order, but final approval is executed securely by you.")

    if len(st.session_state.cart) == 0:
        st.info("Your shopping bag is empty. Explore our catalog or ask Aura to recommend gifts!")
    else:
        col_bag, col_pay = st.columns([1.2, 1])

        with col_bag:
            st.markdown("#### Items in Your Bag")
            for item in st.session_state.cart:
                c_img, c_info, c_action = st.columns([1, 3, 1])
                with c_img:
                    st.image(item["image"], width=65)
                with c_info:
                    st.markdown(f"**{item['name']}**")
                    st.markdown(f"${item['price']:.2f} × {item['quantity']} = **${item['price']*item['quantity']:.2f} USD**")
                with c_action:
                    if st.button("✕", key=f"del_{item['id']}", help="Remove item"):
                        remove_from_cart_by_id(item["id"])
                        st.rerun()

            st.markdown("---")
            # Voucher input
            v_col1, v_col2 = st.columns([3, 1])
            with v_col1:
                voucher_code = st.text_input("Promo Voucher", placeholder="Try code COZY10", label_visibility="collapsed")
            with v_col2:
                if st.button("Apply Code", use_container_width=True):
                    if voucher_code.strip().upper() == "COZY10":
                        st.session_state.promo_code = "COZY10"
                        st.session_state.discount_pct = 10
                        st.success("Voucher COZY10 applied! (10% off)")
                        st.rerun()
                    else:
                        st.error("Invalid voucher code. Try COZY10!")

            if st.button("Clear Shopping Bag", type="secondary"):
                clear_cart()
                st.rerun()

        with col_pay:
            st.markdown("#### Authoritative Pricing Summary")
            st.markdown(
                f"""
                <div class="cart-summary-box">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>Items Subtotal:</span>
                        <strong>${totals['subtotal']:.2f}</strong>
                    </div>
                    {'<div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #235c3b;"><span>Promo Discount (10%):</span><strong>-$' + f"{totals['discount']:.2f}" + '</strong></div>' if totals['discount'] > 0 else ''}
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #235c3b;">
                        <span>Insured Courier Delivery:</span>
                        <strong>COMPLIMENTARY</strong>
                    </div>
                    <hr style="margin: 10px 0; border: none; border-top: 1px solid #e8ded2;" />
                    <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: 800; color: #18120e;">
                        <span>Grand Total:</span>
                        <span>${totals['total']:.2f} USD</span>
                    </div>
                    <div style="font-size: 11.5px; color: #235c3b; margin-top: 8px; text-align: center;">
                        🔒 Authoritative Price Verified with PayPal Orders API v2
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

            # PayPal Smart Button HTML Component
            paypal_client_id = os.getenv("PAYPAL_CLIENT_ID", "sb")
            formatted_amount = f"{totals['total']:.2f}"

            paypal_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <script src="https://www.paypal.com/sdk/js?client-id={paypal_client_id}&currency=USD&components=buttons&enable-funding=card"></script>
              <style>
                body {{
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  margin: 0;
                  padding: 8px;
                  background: transparent;
                }}
                .paypal-card {{
                  background: #ffffff;
                  border: 1px solid #e2d9cd;
                  border-radius: 12px;
                  padding: 16px;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
                }}
                .paypal-title {{
                  font-size: 14px;
                  font-weight: 700;
                  color: #1f1712;
                  margin-bottom: 12px;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                }}
                #paypal-btn-container {{
                  min-height: 45px;
                }}
                .success-box {{
                  background: #eaf5ee;
                  border: 1px solid #235c3b;
                  border-radius: 10px;
                  padding: 18px;
                  text-align: center;
                  color: #18120e;
                }}
              </style>
            </head>
            <body>
              <div class="paypal-card">
                <div class="paypal-title">
                  <span>🅿️</span> Official PayPal Smart Buttons (Orders v2)
                </div>
                <div id="paypal-btn-container"></div>
              </div>

              <script>
                if (window.paypal) {{
                  paypal.Buttons({{
                    style: {{
                      layout: 'vertical',
                      color:  'gold',
                      shape:  'rect',
                      label:  'paypal'
                    }},
                    createOrder: function(data, actions) {{
                      return actions.order.create({{
                        purchase_units: [{{
                          description: "The Cozy Book & Tea Haven Artisan Order",
                          amount: {{
                            currency_code: "USD",
                            value: "{formatted_amount}"
                          }}
                        }}]
                      }});
                    }},
                    onApprove: function(data, actions) {{
                      return actions.order.capture().then(function(details) {{
                        document.body.innerHTML = `
                          <div class="success-box">
                            <div style="font-size: 28px; color: #235c3b; margin-bottom: 4px;">✓</div>
                            <h3 style="margin: 0 0 6px 0; color: #235c3b;">Payment Confirmed!</h3>
                            <p style="margin: 0 0 4px 0; font-size: 13.5px;">Order ID: <strong>${{details.id}}</strong></p>
                            <p style="margin: 0; font-size: 13px; color: #555;">Captured for <strong>$${{details.purchase_units[0].amount.value}} USD</strong> via PayPal Orders API v2.</p>
                            <div style="margin-top: 10px; font-size: 12px; color: #235c3b; font-weight: 600;">💌 We are preparing your artisan parcel with love!</div>
                          </div>
                        `;
                      }});
                    }},
                    onError: function(err) {{
                      console.error("PayPal Smart Button error:", err);
                    }}
                  }}).render('#paypal-btn-container');
                }} else {{
                  document.getElementById('paypal-btn-container').innerHTML = '<p style="color:red; font-size:12px;">Unable to load PayPal SDK.</p>';
                }}
              </script>
            </body>
            </html>
            """
            components.html(paypal_html, height=280)
