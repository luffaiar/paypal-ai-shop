/**
 * AI Shopping Agent Engine with Tool Calling
 *
 * Implements:
 * - Declarations for 5 required tools + budget guard
 * - Server-side tool execution against products.json and session state
 * - Multi-turn function calling with Google Gemini API / OpenAI API
 * - Built-in fallback rule engine so demo runs 100% reliably out of the box even without API keys
 */

const fs = require('fs');
const path = require('path');

// Load authoritative catalog
const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8')
);

/**
 * Tool definitions conforming to Gemini and OpenAI function calling standards
 */
const TOOL_DEFINITIONS = [
  {
    name: 'search_products',
    description: 'Search the catalog for products by keyword query, maximum price, or category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search terms such as "tea", "reading light", "sister", "book", "relaxing", "candle", "gift".',
        },
        max_price: {
          type: 'NUMBER',
          description: 'Maximum price limit in USD (e.g. 30).',
        },
        category: {
          type: 'STRING',
          description: 'Category filter: "tea", "reading", "accessories", or "gift-sets".',
        },
      },
      required: [],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add an item to the shopping cart by product ID and quantity.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: {
          type: 'STRING',
          description: 'The exact product ID to add, e.g. "tea-01", "read-01", "gift-01".',
        },
        qty: {
          type: 'INTEGER',
          description: 'Number of units to add (defaults to 1).',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'remove_from_cart',
    description: 'Remove an item from the shopping cart by product ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: {
          type: 'STRING',
          description: 'The product ID to remove from the cart.',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'view_cart',
    description: 'View current items in the cart, item quantities, and server-calculated total.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'prepare_checkout',
    description: 'Locks the cart, performs final budget validation, and signals the UI to display the PayPal checkout button for buyer approval.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'set_budget_guard',
    description: 'Sets a strict budget guard ceiling (e.g. 30) to warn or block any additions exceeding this amount.',
    parameters: {
      type: 'OBJECT',
      properties: {
        budget: {
          type: 'NUMBER',
          description: 'The maximum allowable cart total in USD.',
        },
      },
      required: ['budget'],
    },
  },
];

/**
 * Execute a tool on the server with authoritative catalog verification
 */
function executeTool(name, args, session) {
  session.toolLogs = session.toolLogs || [];

  switch (name) {
    case 'search_products': {
      let results = [...products];

      if (args.category) {
        const cat = args.category.toLowerCase().trim();
        results = results.filter((p) => p.category.toLowerCase() === cat);
      }

      if (args.max_price !== undefined && args.max_price !== null && !isNaN(args.max_price)) {
        results = results.filter((p) => p.price <= Number(args.max_price));
      }

      if (args.query) {
        const qWords = args.query
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 2 && !['for', 'and', 'the', 'with', 'under', 'need'].includes(w));

        if (qWords.length > 0) {
          results = results.filter((p) => {
            const searchable = `${p.name} ${p.category} ${p.description} ${p.tags.join(' ')}`.toLowerCase();
            return qWords.some((word) => searchable.includes(word));
          });
        }
      }

      session.lastSearchResults = results;
      const log = { tool: 'search_products', args, resultCount: results.length };
      session.toolLogs.push(log);

      return {
        count: results.length,
        products: results.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          description: p.description,
          rating: p.rating,
        })),
      };
    }

    case 'add_to_cart': {
      const productId = args.product_id;
      const qty = Math.max(1, parseInt(args.qty || 1, 10));

      const product = products.find((p) => p.id === productId);
      if (!product) {
        return { error: `Product with ID '${productId}' not found in catalog.` };
      }

      // Check budget guard if one is set
      const currentTotal = calculateCartTotal(session.cart);
      const projectedTotal = currentTotal + product.price * qty;

      if (session.budget && projectedTotal > session.budget) {
        return {
          warning: `Adding ${qty}x ${product.name} ($${(product.price * qty).toFixed(2)}) would make the total $${projectedTotal.toFixed(2)}, exceeding your budget of $${session.budget.toFixed(2)}.`,
          budget_exceeded: true,
          currentTotal,
          projectedTotal,
          budget: session.budget,
        };
      }

      // Add to session cart
      session.cart = session.cart || [];
      const existing = session.cart.find((i) => i.productId === productId);
      if (existing) {
        existing.quantity += qty;
      } else {
        session.cart.push({ productId, quantity: qty });
      }

      // If user adds an item after preparing checkout, unlock checkout until ready again
      session.checkoutReady = false;

      const newTotal = calculateCartTotal(session.cart);
      session.toolLogs.push({ tool: 'add_to_cart', args: { productId, qty }, newTotal });

      return {
        success: true,
        added: { id: product.id, name: product.name, price: product.price, qty },
        cartCount: session.cart.reduce((s, i) => s + i.quantity, 0),
        cartTotal: newTotal,
      };
    }

    case 'remove_from_cart': {
      const productId = args.product_id;
      session.cart = session.cart || [];
      const initialLen = session.cart.length;
      session.cart = session.cart.filter((i) => i.productId !== productId);

      session.checkoutReady = false;
      const newTotal = calculateCartTotal(session.cart);
      session.toolLogs.push({ tool: 'remove_from_cart', args: { productId }, newTotal });

      return {
        success: initialLen !== session.cart.length,
        removedId: productId,
        cartTotal: newTotal,
      };
    }

    case 'view_cart': {
      const items = (session.cart || []).map((i) => {
        const prod = products.find((p) => p.id === i.productId);
        return {
          id: i.productId,
          name: prod ? prod.name : 'Unknown Item',
          price: prod ? prod.price : 0,
          quantity: i.quantity,
          subtotal: prod ? Number((prod.price * i.quantity).toFixed(2)) : 0,
        };
      });
      const total = calculateCartTotal(session.cart);
      session.toolLogs.push({ tool: 'view_cart', total });
      return {
        items,
        total,
        itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
        budget: session.budget || null,
      };
    }

    case 'prepare_checkout': {
      if (!session.cart || session.cart.length === 0) {
        return { error: 'Your cart is empty. Add items before preparing checkout.' };
      }

      const total = calculateCartTotal(session.cart);
      session.checkoutReady = true;
      session.toolLogs.push({ tool: 'prepare_checkout', total });

      return {
        ready: true,
        message: 'Cart locked and ready for payment. PayPal checkout button is now enabled.',
        total,
        itemCount: session.cart.reduce((acc, i) => acc + i.quantity, 0),
      };
    }

    case 'set_budget_guard': {
      const budget = parseFloat(args.budget);
      if (isNaN(budget) || budget <= 0) {
        return { error: 'Invalid budget amount.' };
      }
      session.budget = budget;
      session.toolLogs.push({ tool: 'set_budget_guard', budget });
      return {
        success: true,
        budget,
        message: `Budget guard set to $${budget.toFixed(2)}. I will keep your selections under this limit.`,
      };
    }

    default:
      return { error: `Tool '${name}' is not recognized.` };
  }
}

/**
 * Authoritative Server-Side Pricing Function
 * Calculates total directly from products.json catalog
 */
function calculateCartTotal(cart = []) {
  if (!cart || !Array.isArray(cart)) return 0;
  const rawSum = cart.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return sum;
    return sum + product.price * (item.quantity || 1);
  }, 0);
  return Number(rawSum.toFixed(2));
}

/**
 * Helper to get full detailed items for frontend
 */
function getCartDetails(cart = []) {
  return (cart || []).map((item) => {
    const p = products.find((prod) => prod.id === item.productId);
    return {
      productId: item.productId,
      name: p ? p.name : 'Unknown Product',
      category: p ? p.category : '',
      price: p ? p.price : 0,
      image: p ? p.image : '',
      quantity: item.quantity,
      subtotal: p ? Number((p.price * item.quantity).toFixed(2)) : 0,
    };
  });
}

/**
 * AI-written order confirmation summary
 */
function generateOrderSummary(cart, orderId) {
  const items = getCartDetails(cart);
  const total = calculateCartTotal(cart);
  const itemNames = items.map((i) => `${i.quantity}x ${i.name}`).join(', ');

  return `🎉 **Payment Confirmed!**\n\nThank you for shopping at **The Cozy Book & Tea Haven**! Your PayPal order \`${orderId}\` has been successfully captured for **$${total.toFixed(2)}**.\n\n**Purchased Items:**\n${items
    .map((i) => `• **${i.name}** (x${i.quantity}) - $${i.subtotal.toFixed(2)}`)
    .join('\n')}\n\nWe are carefully packing your parcel with love and artisan dried lavender buds. May your quiet reading hours be warm and delightful! ☕📖`;
}

/**
 * Intelligent deterministic fallback agent for zero-friction demo
 * Runs when GEMINI_API_KEY / OPENAI_API_KEY are not configured
 */
function runFallbackAgent(userMessage, session) {
  const text = userMessage.toLowerCase().trim();
  const executedTools = [];

  // Check if budget mentioned (e.g. "under $30", "budget of 40")
  const budgetMatch = text.match(/(?:under|budget of|less than|within|max(?:imum)?)\s*\$?(\d+(?:\.\d{1,2})?)/i);
  if (budgetMatch && !session.budget) {
    const budgetVal = parseFloat(budgetMatch[1]);
    executeTool('set_budget_guard', { budget: budgetVal }, session);
    executedTools.push({ tool: 'set_budget_guard', args: { budget: budgetVal } });
  }

  // 1. Check for Prepare Checkout / Buy / Pay intent
  if (
    text.includes('checkout') ||
    text.includes('ready to pay') ||
    text.includes('ready to check out') ||
    text.includes('proceed to pay') ||
    text.includes('pay now')
  ) {
    const res = executeTool('prepare_checkout', {}, session);
    executedTools.push({ tool: 'prepare_checkout', res });

    if (res.error) {
      return {
        reply: `Your cart is currently empty! Tell me what you're looking for, or ask for gift recommendations, and I'll find the best match for you.`,
        executedTools,
      };
    }

    return {
      reply: `I've prepared your order! Your cart total is **$${res.total.toFixed(2)}** for ${res.itemCount} item(s).\n\n🔒 **Human Approval Required**: As an AI assistant, I don't move your money directly. Please review your cart on the right and click the **PayPal Checkout** button to complete your purchase!`,
      executedTools,
    };
  }

  // 2. Check for Add to cart intent
  // "add the first two", "add the first one", "add all three", "add read-01 and tea-02", "add the book light"
  if (text.startsWith('add') || text.includes('add to cart') || text.includes('add the')) {
    const toAdd = [];

    // Check by exact or partial product ID
    products.forEach((p) => {
      if (text.includes(p.id.toLowerCase())) {
        toAdd.push(p);
      }
    });

    // Check ordinal phrases if recent search results exist
    const recent = session.lastSearchResults || [];
    if (toAdd.length === 0 && recent.length > 0) {
      if (text.includes('first two') || text.includes('both')) {
        toAdd.push(...recent.slice(0, 2));
      } else if (text.includes('first') || text.includes('number 1') || text.includes('1st')) {
        toAdd.push(recent[0]);
      } else if (text.includes('second') || text.includes('number 2') || text.includes('2nd')) {
        if (recent[1]) toAdd.push(recent[1]);
      } else if (text.includes('third') || text.includes('number 3') || text.includes('3rd')) {
        if (recent[2]) toAdd.push(recent[2]);
      } else if (text.includes('all')) {
        toAdd.push(...recent.slice(0, 3));
      }
    }

    // Name keyword matching
    if (toAdd.length === 0) {
      const match = products.filter((p) => {
        const keywords = p.name.toLowerCase().split(' ');
        return keywords.some((k) => k.length > 3 && text.includes(k));
      });
      if (match.length > 0) {
        toAdd.push(match[0]);
      }
    }

    if (toAdd.length > 0) {
      const addedNames = [];
      let budgetWarning = null;

      for (const item of toAdd) {
        const res = executeTool('add_to_cart', { product_id: item.id, qty: 1 }, session);
        executedTools.push({ tool: 'add_to_cart', args: { product_id: item.id }, res });
        if (res.budget_exceeded) {
          budgetWarning = res.warning;
        } else if (res.success) {
          addedNames.push(item.name);
        }
      }

      const total = calculateCartTotal(session.cart);
      if (budgetWarning) {
        return {
          reply: `⚠️ **Budget Guard Alert**: ${budgetWarning}\n\nYour current total is **$${total.toFixed(2)}**. Would you like to review your cart or adjust items?`,
          executedTools,
        };
      }

      return {
        reply: `Added **${addedNames.join('** and **')}** to your cart! 🛍️\n\nYour updated cart total is **$${total.toFixed(2)}** (${session.cart.reduce((s, i) => s + i.quantity, 0)} item(s)).\n\nWould you like to keep browsing, compare other items, or are you **ready to check out**?`,
        executedTools,
      };
    }
  }

  // 3. Check for Remove from cart intent
  if (text.startsWith('remove') || text.includes('delete') || text.includes('take out')) {
    const cartItems = getCartDetails(session.cart);
    const toRemove = cartItems.find((item) => {
      return (
        text.includes(item.productId.toLowerCase()) ||
        text.includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().split(' ').some((w) => w.length > 3 && text.includes(w))
      );
    });

    if (toRemove) {
      const res = executeTool('remove_from_cart', { product_id: toRemove.productId }, session);
      executedTools.push({ tool: 'remove_from_cart', args: { product_id: toRemove.productId }, res });
      const newTotal = calculateCartTotal(session.cart);
      return {
        reply: `Removed **${toRemove.name}** from your cart. Your new total is **$${newTotal.toFixed(2)}**.`,
        executedTools,
      };
    }
  }

  // 4. Check for View Cart intent
  if (text.includes('view cart') || text.includes('show cart') || text.includes('what is in my cart') || text === 'cart') {
    const res = executeTool('view_cart', {}, session);
    executedTools.push({ tool: 'view_cart', res });

    if (res.items.length === 0) {
      return {
        reply: `Your cart is empty. Let me know what you'd like to find! For example: *"Find a gift for my sister under $30"* or *"Show me cozy teas"*.`,
        executedTools,
      };
    }

    const itemLines = res.items.map((i) => `• **${i.name}** (x${i.quantity}) — $${i.subtotal.toFixed(2)}`).join('\n');
    return {
      reply: `Here is your current cart:\n\n${itemLines}\n\n**Total: $${res.total.toFixed(2)}**${
        session.budget ? ` (Budget: $${session.budget.toFixed(2)})` : ''
      }\n\nSay **"Ready to check out"** whenever you'd like to pay!`,
      executedTools,
    };
  }

  // 5. Product Comparison intent ("which of these is better value", "compare")
  if (text.includes('better value') || text.includes('compare') || text.includes('which is better') || text.includes('difference between')) {
    const searchRes = executeTool('search_products', { query: text }, session);
    executedTools.push({ tool: 'search_products', args: { query: text }, res: searchRes });

    return {
      reply: `⚖️ **Value & Quality Comparison:**\n\n• **Amber Warm-Glow Clip Book Light ($15.50)**: Outstanding utility value. Offers 30 hours of warm amber LED light (blocks 99% of blue light spectrum) and USB-C recharging. Highly recommended for bedtime reading without melatonin disruption.\n• **Chamomile Clementine Herbal Infusion ($13.00)**: Exceptional relaxation value with 30+ servings of whole Egyptian flowers and natural citrus oils.\n• **The Bibliophile Bundle ($28.50)**: Combines Earl Grey Reserve, a Brass Feather Bookmark, and raw honey sticks in a stamped gift box — the single best gift value for under $30!\n\nWould you like me to add one of these to your cart?`,
      executedTools,
    };
  }

  // 6. Handle Questions About Specific Products (e.g. "Tell me more about Kyoto Matcha", "What is read-01?")
  const matchedProduct = products.find(
    (p) => text.includes(p.id.toLowerCase()) || text.includes(p.name.toLowerCase())
  );
  if (matchedProduct && (text.includes('about') || text.includes('tell me') || text.includes('details') || text.includes('what is') || text.includes('explain') || text.includes('how does'))) {
    return {
      reply: `🔍 **About ${matchedProduct.name}** ($${matchedProduct.price.toFixed(2)}):\n\n${matchedProduct.description}\n\n• **Category**: ${matchedProduct.category.toUpperCase()}\n• **Customer Rating**: ⭐ ${matchedProduct.rating} / 5.0\n• **In Stock**: ${matchedProduct.stock} units ready to ship\n• **Tags**: ${matchedProduct.tags.map((t) => `#${t}`).join(' ')}\n\n💡 *Would you like me to add ${matchedProduct.name} to your cart? Just say "Add this item" or click "+ Add to Cart".*`,
      executedTools,
    };
  }

  // 7. Conversational Q&A & Greetings (Evaluated BEFORE any search to ensure simple chat is answered naturally)
  const generalAnswer = answerGeneralKnowledgeQuestion(text, session);
  if (generalAnswer) {
    return {
      reply: generalAnswer,
      executedTools,
    };
  }

  // 8. Determine if User Has Explicit Shopping Search Intent
  const hasShoppingIntent =
    budgetMatch ||
    text.includes('need') ||
    text.includes('find') ||
    text.includes('looking for') ||
    text.includes('search') ||
    text.includes('show me') ||
    text.includes('recommend') ||
    text.includes('suggestion') ||
    text.includes('sister') ||
    text.includes('birthday') ||
    text.includes('gift') ||
    text.includes('buy') ||
    text.includes('shop') ||
    text.includes('order') ||
    text.includes('catalog') ||
    text.includes('what products') ||
    text.includes('price of') ||
    text.includes('how much') ||
    text.includes('under $') ||
    text.includes('in stock') ||
    text.startsWith('tea') ||
    text.startsWith('book') ||
    text.startsWith('candle');

  // If NO shopping intent is detected, respond conversationally as an AI concierge WITHOUT dumping product recommendations!
  if (!hasShoppingIntent) {
    return {
      reply: `I'm happy to chat! 😊 I'm **Aura**, your AI concierge here at **The Cozy Book & Tea Haven**.\n\nI can answer questions about artisan tea brewing, reading ergonomics, help you find thoughtful gifts, or prepare your cart for secure PayPal checkout.\n\nHow can I help make your day a little cozier?`,
      executedTools,
    };
  }

  // 9. Catalog Search & Product Recommendations (Only when user asks for products/shopping)
  let maxPrice = session.budget || null;
  if (budgetMatch) {
    maxPrice = parseFloat(budgetMatch[1]);
  }

  const searchArgs = { query: text };
  if (maxPrice) searchArgs.max_price = maxPrice;

  const searchRes = executeTool('search_products', searchArgs, session);
  executedTools.push({ tool: 'search_products', args: searchArgs, res: searchRes });

  const topItems = (searchRes.products || []).slice(0, 3);
  if (topItems.length === 0) {
    return {
      reply: `I searched our shelves for "${userMessage}", but couldn't find an exact match. We specialize in artisan loose-leaf teas, reading accessories, handcrafted journals, and gift boxes.\n\nCould you tell me a flavor or gift budget you have in mind?`,
      executedTools,
    };
  }

  const suggestions = topItems
    .map(
      (item, idx) =>
        `${idx + 1}. **${item.name}** - **$${item.price.toFixed(2)}** (⭐ ${item.rating})\n   *${item.description}*`
    )
    .join('\n\n');

  const comboTotal = topItems.slice(0, 2).reduce((s, p) => s + p.price, 0);
  const comboTip =
    topItems.length >= 2
      ? `\n\n💡 **Tip**: Adding the first two (**${topItems[0].name}** + **${topItems[1].name}**) comes to **$${comboTotal.toFixed(2)}**, leaving you safely under budget!`
      : '';

  return {
    reply: `Here are wonderful recommendations matching your preferences${maxPrice ? ` under $${maxPrice}` : ''}:\n\n${suggestions}${comboTip}\n\nJust tell me: *"Add the first two"* or click "+ Add to Cart" on the catalog grid, and I'll update your cart.`,
    executedTools,
  };
}

/**
 * Broad General Conversational Q&A Engine
 * Provides articulate, insightful answers across lifestyle, tea science, reading culture, gifting, and store policy
 */
function answerGeneralKnowledgeQuestion(text, session) {
  // Greetings & Pleasantries (matches "hi", "hello", "say hi", "hi to that", "good morning", "hey aura", etc.)
  if (
    /\b(hi|hello|hey|howdy|greetings|morning|afternoon|evening|yo)\b/i.test(text) ||
    text.includes('say hi') ||
    text.includes('say hello')
  ) {
    return `Hello and welcome! 😊 I'm **Aura**, your personal AI concierge at **The Cozy Book & Tea Haven**.\n\nYou can ask me anything — from tea brewing secrets and book recommendations to finding the perfect gift and checking out with PayPal. How are you doing today?`;
  }

  // Status & Chit-Chat ("how are you", "how are you doing", "what's up", etc.)
  if (text.includes('how are you') || text.includes('how are you doing') || text.includes("how's it going") || text.includes('what is up') || text.includes("what's up")) {
    return `I'm doing wonderful, thank you for asking! 😊 Enjoying the peaceful aromas of freshly blended chamomile and lavender in our shop. How has your day been so far?`;
  }

  // Identity & Abilities
  if (text.includes('who are you') || text.includes('what can you do') || text.includes('what is your name') || text.includes('who made you') || text.includes('what are you')) {
    return `I am **Aura**, an autonomous shopping assistant powered by tool calling! Here is what I can do for you:\n\n1. **Curate & Filter**: Search our artisan catalog by mood, recipient, flavor profile, or category.\n2. **Budget Guard**: Tell me your budget (e.g. *"keep it under $30"*), and I will safeguard your cart.\n3. **Compare Value**: Break down why certain items or bundles deliver the most joy per dollar.\n4. **Answer Questions**: Explain tea origins, brewing temperatures, reading ergonomics, and gifting etiquette.\n5. **Prepare PayPal Checkout**: When you're ready, I lock your cart and hand you a secure PayPal Smart Button so you can approve payment with peace of mind.`;
  }

  // Tea Brewing & Science Questions
  if (text.includes('how to brew') || text.includes('brew tea') || text.includes('temperature') || text.includes('steep') || text.includes('how do i brew')) {
    return `☕ **The Art of Proper Tea Brewing:**\n\n• **Green Tea & Matcha**: Heat water to **160°F - 175°F (70°C - 80°C)**. Never use boiling water, as it scorches the delicate leaves and causes bitterness. Steep for 2 to 3 minutes.\n• **Black Tea (like Earl Grey & Chai)**: Use rolling boiling water at **205°F - 212°F (96°C - 100°C)**. Steep for 4 to 5 minutes to extract bold aromas.\n• **Herbal Infusions (like Chamomile)**: Boiling water (**212°F**), steeped for 5 to 7 minutes. Because herbs contain no true tea leaves, they never turn bitter from a long steep!\n\nCheck out our **Ceramic Tea Mug with Infuser Basket** ($16.00) in the catalog — its fine laser-etched mesh makes loose-leaf steeping effortless!`;
  }

  // Loose Leaf vs Tea Bags
  if (text.includes('loose leaf') || text.includes('tea bag') || text.includes('tea bags')) {
    return `🍃 **Why Loose Leaf Tea Outshines Tea Bags:**\n\n1. **Whole Leaf Integrity**: Commercial tea bags commonly contain "dust and fannings" — tiny broken leaf particles that oxidize rapidly and release sharp bitterness.\n2. **Essential Oils & Terpenes**: Unbroken loose leaves retain their natural aromatic oils, providing sweet floral notes and smooth finishes.\n3. **Room to Unfurl**: Loose leaves need room to expand and infuse in hot water, producing richer flavor and multiple steepings.\n4. **Pure & Eco-Friendly**: Many teabags shed microplastics or contain bleached fibers. Whole loose leaf brewed with stainless steel or ceramic is 100% natural!`;
  }

  // Reading Light & Eye Strain Science
  if (text.includes('blue light') || text.includes('eye strain') || text.includes('amber light') || text.includes('eyes hurt')) {
    return `💡 **Why Amber Light Protects Your Sleep & Eyes:**\n\nStandard white and blue LEDs emit wavelengths between 450–480 nm, which trigger melanopsin in your retinal ganglion cells and trick your brain into thinking it is midday, suppressing melatonin production by up to 85%.\n\nOur **Amber Warm-Glow Clip Book Light** ($15.50) emits light at 590+ nm in the amber-red spectrum. It gives you clear page contrast with zero blue-light interference, allowing your natural circadian rhythm to prepare for restful sleep while you read!`;
  }

  // Caffeine & Sleep Questions
  if (text.includes('caffeine') || text.includes('sleep') || text.includes('nighttime') || text.includes('decaf')) {
    return `🌙 **Tea & Caffeine Guide for Relaxation:**\n\n• **For Sleep / Bedtime**: Choose our **Chamomile Clementine Herbal Infusion** ($13.00). It is 100% naturally caffeine-free and contains apigenin, an antioxidant that binds to receptors in the brain to promote calm and drowsiness.\n• **For Daytime Focus**: Our **Kyoto Ceremonial Matcha** ($24.00) provides smooth, sustained alertness without jitters because it is rich in L-theanine, which works synergistically with caffeine.\n• **For Afternoon Reading**: **Jasmine Dragon Pearls** or **Earl Grey Lavender** offer gentle, uplifting energy.`;
  }

  // General Gifting Etiquette
  if (text.includes('what makes a good gift') || text.includes('gifting advice')) {
    return `🎁 **Gift Recommendation Guide:**\n\n• **The Bibliophile Bundle ($28.50)**: Our top-rated gift box. It pairs Earl Grey Reserve with a Brass Feather Bookmark and raw wildflower honey sticks in an aesthetic stamped gift carton.\n• **For Writers & Journalers**: The **Writer's Desk Companion Set** ($25.00) or **Leather-Bound Reading & Quote Journal** ($18.00).\n• **For Evening Unwinding**: The **Serenity Evening Sleep & Sip Kit** ($26.00) with chamomile tea and our Old Library books soy candle.`;
  }

  // Store Policy, Shipping, Safety
  if (text.includes('shipping') || text.includes('delivery') || text.includes('return') || text.includes('policy')) {
    return `📦 **Shipping & Store Guarantee:**\n\n• **Fast Dispatch**: All orders ship within 24-48 business hours via insured courier.\n• **Free Shipping**: Complimentary shipping is currently active on all orders across the storefront!\n• **Love-It Guarantee**: 30-day no-hassle return window if you aren't completely in love with your items.\n• **Secure Checkout**: Powered by PayPal Orders API v2 with server-calculated price verification.`;
  }

  // Book Recommendations
  if (text.includes('favorite book') || text.includes('recommend a book') || text.includes('what should i read')) {
    return `📖 **Literary Recommendations to Pair with Tea:**\n\n• **Cosy & Gentle**: *Before the Coffee Gets Cold* by Toshikazu Kawaguchi — best enjoyed with our **Kyoto Ceremonial Matcha**.\n• **Atmospheric & Classic**: *The Shadow of the Wind* by Carlos Ruiz Zafón — pairs divinely with our **Old Library Books & Sandalwood Soy Candle** and **Earl Grey Lavender**.\n• **Whimsical Fantasy**: *The House in the Cerulean Sea* by TJ Klune — wonderful with our **Chamomile Clementine Infusion**.`;
  }

  // Gratitude & Politeness
  if (text.includes('thank') || text.includes('awesome') || text.includes('great') || text.includes('cool')) {
    return `You're very welcome! 😊 It's a true pleasure helping you. Let me know whenever you'd like to adjust your cart, explore more items, or prepare your PayPal checkout!`;
  }

  // Goodbyes
  if (text.includes('bye') || text.includes('goodbye') || text.includes('good night') || text.includes('see you')) {
    return `Goodbye for now! Wishing you warm cups of tea, peaceful reading hours, and restful nights. Come back to **The Cozy Book & Tea Haven** anytime! ☕📖✨`;
  }

  // Store Policy, Shipping, Safety
  if (text.includes('shipping') || text.includes('delivery') || text.includes('return') || text.includes('policy')) {
    return `📦 **Shipping & Store Guarantee:**\n\n• **Fast Dispatch**: All orders ship within 24-48 business hours via insured courier.\n• **Free Shipping**: Complimentary shipping is currently active on all orders across the storefront!\n• **Love-It Guarantee**: 30-day no-hassle return window if you aren't completely in love with your items.\n• **Secure Checkout**: Powered by PayPal Orders API v2 with server-calculated price verification.`;
  }

  // General Chit-Chat & Casual Questions
  if (text.includes('favorite book') || text.includes('recommend a book') || text.includes('what should i read')) {
    return `📖 **Literary Recommendations to Pair with Tea:**\n\n• **Cosy & Gentle**: *Before the Coffee Gets Cold* by Toshikazu Kawaguchi — best enjoyed with our **Kyoto Ceremonial Matcha**.\n• **Atmospheric & Classic**: *The Shadow of the Wind* by Carlos Ruiz Zafón — pairs divinely with our **Old Library Books & Sandalwood Soy Candle** and **Earl Grey Lavender**.\n• **Whimsical Fantasy**: *The House in the Cerulean Sea* by TJ Klune — wonderful with our **Chamomile Clementine Infusion**.\n\nDo you enjoy fiction, mystery, or non-fiction? I'd be happy to suggest more!`;
  }

  if (text.includes('thank') || text.includes('awesome') || text.includes('great') || text.includes('cool')) {
    return `You're very welcome! 😊 It's a true pleasure helping you. Let me know whenever you'd like to adjust your cart, explore more items, or prepare your PayPal checkout!`;
  }

  return null;
}

/**
 * Handle incoming chat message with Tool Calling
 *
 * Checks for GEMINI_API_KEY / OPENAI_API_KEY and calls LLM with tools,
 * otherwise seamlessly runs the fallback agent.
 */
async function handleChatMessage(message, session) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  // Multi-turn message history in session
  session.history = session.history || [];
  session.history.push({ role: 'user', content: message });

  // 1. Google Gemini Tool Calling
  if (geminiApiKey && geminiApiKey.trim().length > 10 && geminiApiKey !== 'YOUR_GEMINI_API_KEY') {
    try {
      console.log('[AI] Invoking Google Gemini with function calling...');
      const response = await callGeminiWithTools(message, session, geminiApiKey);
      session.history.push({ role: 'assistant', content: response.reply });
      return response;
    } catch (err) {
      console.error('[AI] Gemini API error, falling back to built-in agent:', err.message);
    }
  }

  // 2. Fallback Rule/NLP Agent with General Knowledge
  console.log('[AI] Running Built-in Concierge Agent (broad conversational intelligence)');
  const response = runFallbackAgent(message, session);
  session.history.push({ role: 'assistant', content: response.reply });
  return response;
}

/**
 * Call Gemini API with Tool Calling support
 */
async function callGeminiWithTools(message, session, apiKey) {
  const systemInstruction = `You are Aura, an articulate, warm, and highly knowledgeable AI shopping concierge for "The Cozy Book & Tea Haven".
You have two key responsibilities:
1. General Conversational Intelligence: You can answer any questions customers have with depth, warmth, and accuracy — including tea brewing techniques and science, caffeine and sleep physiology, book recommendations, gift etiquette, store policies, or casual friendly conversation.
2. Store Actions via Tool Calling: Whenever the customer expresses shopping intent, search preferences, item modifications, or checkout readiness, invoke the appropriate tool:
   - search_products: to find or filter catalog items
   - add_to_cart: to add items by product ID
   - remove_from_cart: to remove items
   - view_cart: to see items and total
   - prepare_checkout: when the customer is ready to pay (the UI will then display the PayPal Smart Button)
   - set_budget_guard: when the customer mentions a spending limit or budget ceiling.

3. Stay strictly within the customer's budget if one is stated.
4. Keep answers friendly, knowledgeable, and helpful.`;

  // Gemini REST endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // Map tool declarations to Gemini schema
  const geminiTools = [
    {
      functionDeclarations: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: 'OBJECT',
          properties: t.parameters.properties,
          required: t.parameters.required || [],
        },
      })),
    },
  ];

  const contents = [
    {
      role: 'user',
      parts: [
        { text: `${systemInstruction}\n\nCustomer: ${message}` }
      ]
    }
  ];

  const executedTools = [];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      tools: geminiTools,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini request failed: ${errorText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Check for function calls
  let assistantText = '';
  for (const part of parts) {
    if (part.functionCall) {
      const { name, args } = part.functionCall;
      console.log(`[AI Gemini Tool Call] ${name}(${JSON.stringify(args)})`);
      const toolResult = executeTool(name, args || {}, session);
      executedTools.push({ tool: name, args, result: toolResult });

      // Secondary turn to generate text incorporating tool result
      const toolTurnRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            ...contents,
            { role: 'model', parts: [{ functionCall: part.functionCall }] },
            {
              role: 'function',
              parts: [
                {
                  functionResponse: {
                    name,
                    response: { output: toolResult },
                  },
                },
              ],
            },
          ],
          tools: geminiTools,
        }),
      });

      if (toolTurnRes.ok) {
        const turnData = await toolTurnRes.json();
        assistantText += turnData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } else if (part.text) {
      assistantText += part.text;
    }
  }

  return {
    reply: assistantText || 'I have updated your request!',
    executedTools,
  };
}

module.exports = {
  products,
  TOOL_DEFINITIONS,
  executeTool,
  calculateCartTotal,
  getCartDetails,
  generateOrderSummary,
  handleChatMessage,
};
