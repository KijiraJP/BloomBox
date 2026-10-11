const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();
const database = db.promise();

const OPTION_TYPES = new Set(["wrapping", "ribbon", "greeting_card"]);
const MAX_MESSAGE_LENGTH = 250;
const recommendationRequests = new Map();
const RECOMMENDATION_WINDOW_MS = 60 * 1000;
const MAX_RECOMMENDATIONS_PER_WINDOW = 6;
const VISUAL_OFFSET_LIMIT = 14;
const MIN_VISUAL_SCALE = 0.7;
const MAX_VISUAL_SCALE = 1.4;
const MIN_LAYER_ORDER = 1;
const MAX_LAYER_ORDER = 12;

const recommendationSchema = {
  type: "object",
  properties: {
    bouquet_name: { type: "string" },
    flowers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_id: { type: "integer" },
          quantity: { type: "integer" }
        },
        required: ["product_id", "quantity"]
      }
    },
    reason: { type: "string" }
  },
  required: ["bouquet_name", "flowers", "reason"]
};

function asPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function parseVisualValue(value, { min, max, label }) {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    const error = new Error(`${label} must be between ${min} and ${max}.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function checkRecommendationRateLimit(userId) {
  const now = Date.now();
  const recentRequests = (recommendationRequests.get(userId) || [])
    .filter((timestamp) => now - timestamp < RECOMMENDATION_WINDOW_MS);
  if (recentRequests.length >= MAX_RECOMMENDATIONS_PER_WINDOW) return false;
  recentRequests.push(now);
  recommendationRequests.set(userId, recentRequests);
  return true;
}

function validateRecommendation(rawRecommendation, availableFlowers, size, budget) {
  if (!rawRecommendation || !Array.isArray(rawRecommendation.flowers)) return null;

  const availableById = new Map(availableFlowers.map((flower) => [Number(flower.product_id), flower]));
  const quantities = new Map();
  for (const item of rawRecommendation.flowers) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) return null;
    if (!availableById.has(productId)) return null;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  const flowers = [...quantities.entries()].map(([productId, quantity]) => {
    const product = availableById.get(productId);
    return { ...product, quantity, line_total: toMoney(Number(product.price) * quantity) };
  });
  if (!flowers.length) return null;

  const flowerCount = flowers.reduce((sum, flower) => sum + flower.quantity, 0);
  const flowerSubtotal = flowers.reduce((sum, flower) => sum + flower.line_total, 0);
  const totalPrice = flowerSubtotal + Number(size.base_price);
  const exceedsStock = flowers.some((flower) => flower.quantity > Number(flower.stock_quantity));
  if (exceedsStock || flowerCount > Number(size.max_flower_slots) || totalPrice > budget) return null;

  return {
    bouquet_name: String(rawRecommendation.bouquet_name || "BloomBox recommendation").trim().slice(0, 80),
    reason: String(rawRecommendation.reason || "Selected from available BloomBox flowers.").trim().slice(0, 300),
    flowers: flowers.map((flower) => ({
      product_id: flower.product_id,
      product_name: flower.product_name,
      product_image: flower.product_image,
      unit_price: toMoney(flower.price),
      quantity: flower.quantity,
      line_total: flower.line_total
    })),
    flower_count: flowerCount,
    price_breakdown: {
      flower_subtotal: toMoney(flowerSubtotal),
      bouquet_base_cost: toMoney(size.base_price),
      estimated_total: toMoney(totalPrice)
    }
  };
}

function createFallbackRecommendation(availableFlowers, size, budget, preferredFlowers) {
  const preferredTerms = preferredFlowers.map((flower) => flower.toLowerCase());
  const sortedFlowers = [...availableFlowers].sort((left, right) => {
    const leftPreferred = preferredTerms.some((term) => left.product_name.toLowerCase().includes(term));
    const rightPreferred = preferredTerms.some((term) => right.product_name.toLowerCase().includes(term));
    if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
    return Number(left.price) - Number(right.price);
  });
  const selected = [];
  let total = Number(size.base_price);
  for (const flower of sortedFlowers) {
    if (selected.length >= Number(size.max_flower_slots)) break;
    if (total + Number(flower.price) > budget) continue;
    selected.push({ product_id: flower.product_id, quantity: 1 });
    total += Number(flower.price);
  }
  return validateRecommendation({
    bouquet_name: "BloomBox availability selection",
    flowers: selected,
    reason: "This availability-based selection was created locally because Gemini was unavailable."
  }, availableFlowers, size, budget);
}

async function getOwnedBouquet(customBouquetId, userId, { lock = false } = {}) {
  const [rows] = await database.query(
    `
      SELECT cb.*, bso.display_name AS bouquet_size_name, bso.max_flower_slots, bso.base_price
      FROM custom_bouquets cb
      INNER JOIN bouquet_size_options bso
        ON bso.size_code = cb.bouquet_size_code
      WHERE cb.custom_bouquet_id = ?
        AND cb.user_id = ?
      ${lock ? "FOR UPDATE" : ""}
    `,
    [customBouquetId, userId]
  );

  return rows[0] || null;
}

async function getOption(optionId, expectedType) {
  if (optionId === null || optionId === undefined || optionId === "") {
    return null;
  }

  const parsedOptionId = asPositiveInteger(optionId);
  if (!parsedOptionId) {
    const error = new Error("Invalid customization option.");
    error.status = 400;
    throw error;
  }

  const [rows] = await database.query(
    `
      SELECT option_id, option_type, option_name, option_color, additional_price
      FROM bouquet_options
      WHERE option_id = ?
        AND option_type = ?
        AND is_active = 1
    `,
    [parsedOptionId, expectedType]
  );

  if (!rows[0]) {
    const error = new Error(`Selected ${expectedType.replace("_", " ")} is unavailable.`);
    error.status = 400;
    throw error;
  }

  return rows[0];
}

async function refreshBouquetPrice(customBouquetId) {
  const [bouquetRows] = await database.query(
    `
      SELECT cb.bouquet_size_code, bso.base_price,
        cb.wrapping_option_id, cb.ribbon_option_id, cb.greeting_card_option_id
      FROM custom_bouquets cb
      INNER JOIN bouquet_size_options bso ON bso.size_code = cb.bouquet_size_code
      WHERE cb.custom_bouquet_id = ?
    `,
    [customBouquetId]
  );

  const bouquet = bouquetRows[0];
  if (!bouquet) return;

  const [flowerRows] = await database.query(
    `SELECT COALESCE(SUM(unit_price), 0) AS flower_subtotal
     FROM custom_bouquet_slots
     WHERE custom_bouquet_id = ?`,
    [customBouquetId]
  );

  const optionIds = [
    bouquet.wrapping_option_id,
    bouquet.ribbon_option_id,
    bouquet.greeting_card_option_id
  ].filter(Boolean);
  let wrappingCost = 0;
  let addOnCost = 0;

  if (optionIds.length > 0) {
    const [optionRows] = await database.query(
      `SELECT option_id, option_type, additional_price
       FROM bouquet_options
       WHERE option_id IN (?)`,
      [optionIds]
    );

    optionRows.forEach((option) => {
      if (option.option_type === "wrapping") {
        wrappingCost += Number(option.additional_price);
      } else {
        addOnCost += Number(option.additional_price);
      }
    });
  }

  const flowerSubtotal = Number(flowerRows[0].flower_subtotal);
  const baseCost = Number(bouquet.base_price);
  const totalPrice = flowerSubtotal + baseCost + wrappingCost + addOnCost;

  await database.query(
    `UPDATE custom_bouquets
     SET flower_subtotal = ?, bouquet_base_cost = ?, wrapping_cost = ?,
         add_on_cost = ?, total_price = ?
     WHERE custom_bouquet_id = ?`,
    [
      toMoney(flowerSubtotal),
      toMoney(baseCost),
      toMoney(wrappingCost),
      toMoney(addOnCost),
      toMoney(totalPrice),
      customBouquetId
    ]
  );
}

async function buildBouquetResponse(customBouquetId, userId) {
  const bouquet = await getOwnedBouquet(customBouquetId, userId);
  if (!bouquet) return null;

  const [slots] = await database.query(
    `
      SELECT cbs.custom_bouquet_slot_id, cbs.slot_number, cbs.product_id,
        cbs.unit_price, cbs.position_x, cbs.position_y, cbs.visual_scale,
        cbs.layer_order, p.product_name, p.product_image, ps.stock_quantity
      FROM custom_bouquet_slots cbs
      INNER JOIN products p ON p.product_id = cbs.product_id
      LEFT JOIN product_stock ps ON ps.product_id = p.product_id
      WHERE cbs.custom_bouquet_id = ?
      ORDER BY cbs.slot_number ASC
    `,
    [customBouquetId]
  );

  const [options] = await database.query(
    `
      SELECT option_id, option_type, option_name, option_color, additional_price
      FROM bouquet_options
      WHERE option_id IN (?, ?, ?)
    `,
    [
      bouquet.wrapping_option_id || 0,
      bouquet.ribbon_option_id || 0,
      bouquet.greeting_card_option_id || 0
    ]
  );

  const optionsById = Object.fromEntries(options.map((option) => [option.option_id, option]));

  return {
    custom_bouquet_id: bouquet.custom_bouquet_id,
    bouquet_status: bouquet.bouquet_status,
    bouquet_size: {
      code: bouquet.bouquet_size_code,
      name: bouquet.bouquet_size_name,
      max_flower_slots: bouquet.max_flower_slots,
      base_price: toMoney(bouquet.bouquet_base_cost)
    },
    theme_color: bouquet.theme_color,
    personalized_message: bouquet.personalized_message,
    customization: {
      wrapping: optionsById[bouquet.wrapping_option_id] || null,
      ribbon: optionsById[bouquet.ribbon_option_id] || null,
      greeting_card: optionsById[bouquet.greeting_card_option_id] || null
    },
    price_breakdown: {
      flower_subtotal: toMoney(bouquet.flower_subtotal),
      bouquet_base_cost: toMoney(bouquet.bouquet_base_cost),
      wrapping_cost: toMoney(bouquet.wrapping_cost),
      add_on_cost: toMoney(bouquet.add_on_cost),
      total_price: toMoney(bouquet.total_price)
    },
    flower_count: slots.length,
    slots: slots.map((slot) => ({
      ...slot,
      unit_price: toMoney(slot.unit_price),
      position_x: slot.position_x === null ? null : Number(slot.position_x),
      position_y: slot.position_y === null ? null : Number(slot.position_y),
      visual_scale: slot.visual_scale === null ? null : Number(slot.visual_scale),
      layer_order: slot.layer_order === null ? null : Number(slot.layer_order),
      stock_quantity: Number(slot.stock_quantity || 0)
    }))
  };
}

router.use(authenticateToken, authorizeRoles("customer"));

// Active flowers with current inventory for the Bouquet Builder catalog.
router.get("/catalog", async (req, res) => {
  try {
    const [flowers] = await database.query(`
      SELECT p.product_id, p.product_name, p.product_image, p.description, p.price,
        p.category, COALESCE(ps.stock_quantity, 0) AS stock_quantity
      FROM products p
      LEFT JOIN product_stock ps ON ps.product_id = p.product_id
      WHERE p.status = 'active'
        AND LOWER(p.category) = 'flower'
      ORDER BY p.product_name ASC
    `);

    return res.json(flowers.map((flower) => ({
      ...flower,
      price: toMoney(flower.price),
      stock_quantity: Number(flower.stock_quantity)
    })));
  } catch (error) {
    console.error("Error loading bouquet flower catalog:", error);
    return res.status(500).json({ message: "Failed to load available flowers." });
  }
});

// The configurable size, wrapping, ribbon, and greeting-card choices.
router.get("/configuration", async (req, res) => {
  try {
    const [sizes] = await database.query(
      `SELECT size_code, display_name, max_flower_slots, base_price
       FROM bouquet_size_options WHERE is_active = 1 ORDER BY max_flower_slots ASC`
    );
    const [options] = await database.query(
      `SELECT option_id, option_type, option_name, option_color, option_image, additional_price
       FROM bouquet_options WHERE is_active = 1 ORDER BY option_type, option_id`
    );

    return res.json({
      sizes: sizes.map((size) => ({ ...size, base_price: toMoney(size.base_price) })),
      options: options.map((option) => ({ ...option, additional_price: toMoney(option.additional_price) }))
    });
  } catch (error) {
    console.error("Error loading bouquet configuration:", error);
    return res.status(500).json({ message: "Failed to load bouquet configuration." });
  }
});

// Gemini suggests a bouquet; BloomBox validates every returned ID, quantity,
// capacity, price, and stock value before the customer can see or apply it.
router.post("/recommendations", async (req, res) => {
  const { occasion, budget, preferred_color: preferredColor, preferred_flowers: preferredFlowersInput, bouquet_size: bouquetSize } = req.body;
  const numericBudget = Number(budget);
  const preferredFlowers = Array.isArray(preferredFlowersInput)
    ? preferredFlowersInput.filter((flower) => typeof flower === "string").map((flower) => flower.trim()).filter(Boolean).slice(0, 8)
    : typeof preferredFlowersInput === "string"
      ? preferredFlowersInput.split(",").map((flower) => flower.trim()).filter(Boolean).slice(0, 8)
      : [];

  if (typeof occasion !== "string" || !occasion.trim() || occasion.trim().length > 80) {
    return res.status(400).json({ message: "Please provide an occasion of up to 80 characters." });
  }
  if (!Number.isFinite(numericBudget) || numericBudget <= 0 || numericBudget > 100000) {
    return res.status(400).json({ message: "Please provide a valid budget." });
  }
  if (typeof bouquetSize !== "string") {
    return res.status(400).json({ message: "Please select a bouquet size." });
  }
  if (!checkRecommendationRateLimit(req.user.user_id)) {
    return res.status(429).json({ message: "Too many recommendation requests. Please wait one minute and try again." });
  }

  try {
    const [sizeRows] = await database.query(
      `SELECT size_code, display_name, max_flower_slots, base_price
       FROM bouquet_size_options WHERE size_code = ? AND is_active = 1`,
      [bouquetSize]
    );
    const size = sizeRows[0];
    if (!size) return res.status(400).json({ message: "Selected bouquet size is unavailable." });

    const [availableFlowers] = await database.query(`
      SELECT p.product_id, p.product_name, p.product_image, p.price,
        COALESCE(ps.stock_quantity, 0) AS stock_quantity
      FROM products p
      INNER JOIN product_stock ps ON ps.product_id = p.product_id
      WHERE p.status = 'active'
        AND LOWER(p.category) = 'flower'
        AND ps.stock_quantity > 0
      ORDER BY p.product_id ASC
    `);
    if (!availableFlowers.length) {
      return res.status(409).json({ message: "No flowers are currently available for a recommendation." });
    }

    const safeCatalog = availableFlowers.map((flower) => ({
      product_id: Number(flower.product_id),
      product_name: flower.product_name,
      price_php: toMoney(flower.price),
      available_stock: Number(flower.stock_quantity)
    }));
    const prompt = `You recommend a custom bouquet for BloomBox Florals. Use ONLY product IDs in this supplied catalog. Never invent flowers, prices, or stock. Return a composition that stays within the selected size capacity and PHP budget.\n\nCustomer preferences:\n- Occasion: ${occasion.trim()}\n- Budget: PHP ${numericBudget.toFixed(2)}\n- Preferred color: ${typeof preferredColor === "string" && preferredColor.trim() ? preferredColor.trim().slice(0, 50) : "no preference"}\n- Preferred flowers: ${preferredFlowers.length ? preferredFlowers.join(", ") : "no preference"}\n- Bouquet size: ${size.display_name}, maximum ${size.max_flower_slots} flowers\n- Bouquet base cost: PHP ${toMoney(size.base_price).toFixed(2)}\n\nAvailable catalog:\n${JSON.stringify(safeCatalog)}\n\nReturn a concise bouquet_name, flowers array, and reason.`;

    if (!process.env.GEMINI_API_KEY) {
      const fallback = createFallbackRecommendation(availableFlowers, size, numericBudget, preferredFlowers);
      if (!fallback) return res.status(503).json({ message: "Gemini is not configured and no valid local selection fits this budget." });
      return res.status(200).json({ source: "fallback", notice: "Gemini is not configured; this is an availability-based local selection.", recommendation: fallback });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const geminiResponse = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
          responseJsonSchema: recommendationSchema
        }
      });
      const recommendation = validateRecommendation(JSON.parse(geminiResponse.text), availableFlowers, size, numericBudget);
      if (!recommendation) {
        const fallback = createFallbackRecommendation(availableFlowers, size, numericBudget, preferredFlowers);
        if (!fallback) return res.status(422).json({ message: "Gemini returned an invalid recommendation and no valid fallback fits the budget." });
        return res.status(200).json({ source: "fallback", notice: "Gemini's suggestion did not pass BloomBox validation; a local selection is shown instead.", recommendation: fallback });
      }
      return res.status(200).json({ source: "gemini", recommendation });
    } catch (geminiError) {
      console.error("Gemini recommendation error:", geminiError?.message || geminiError);
      const fallback = createFallbackRecommendation(availableFlowers, size, numericBudget, preferredFlowers);
      if (!fallback) return res.status(503).json({ message: "Gemini is temporarily unavailable and no valid local selection fits this budget." });
      return res.status(200).json({ source: "fallback", notice: "Gemini is temporarily unavailable; this is an availability-based local selection.", recommendation: fallback });
    }
  } catch (error) {
    console.error("Error generating bouquet recommendation:", error);
    return res.status(500).json({ message: "Unable to create a bouquet recommendation." });
  }
});

// Start a saved, customer-owned draft. Inventory is checked only when flowers are added.
router.post("/drafts", async (req, res) => {
  const userId = req.user.user_id;
  const { bouquet_size_code } = req.body;

  if (typeof bouquet_size_code !== "string") {
    return res.status(400).json({ message: "Please select a bouquet size." });
  }

  try {
    const [sizeRows] = await database.query(
      `SELECT size_code FROM bouquet_size_options WHERE size_code = ? AND is_active = 1`,
      [bouquet_size_code]
    );
    if (!sizeRows[0]) {
      return res.status(400).json({ message: "Selected bouquet size is unavailable." });
    }

    const [result] = await database.query(
      `INSERT INTO custom_bouquets (user_id, bouquet_size_code) VALUES (?, ?)`,
      [userId, bouquet_size_code]
    );
    await refreshBouquetPrice(result.insertId);

    return res.status(201).json({
      message: "Bouquet draft created.",
      bouquet: await buildBouquetResponse(result.insertId, userId)
    });
  } catch (error) {
    console.error("Error creating bouquet draft:", error);
    return res.status(500).json({ message: "Failed to create bouquet draft." });
  }
});

router.get("/drafts/:id", async (req, res) => {
  const bouquetId = asPositiveInteger(req.params.id);
  if (!bouquetId) return res.status(400).json({ message: "Invalid bouquet draft." });

  try {
    const bouquet = await buildBouquetResponse(bouquetId, req.user.user_id);
    if (!bouquet) return res.status(404).json({ message: "Bouquet draft not found." });
    return res.json({ bouquet });
  } catch (error) {
    console.error("Error loading bouquet draft:", error);
    return res.status(500).json({ message: "Failed to load bouquet draft." });
  }
});

// Update size and presentation details. A smaller size is rejected when it cannot hold every flower.
router.patch("/drafts/:id", async (req, res) => {
  const bouquetId = asPositiveInteger(req.params.id);
  const userId = req.user.user_id;
  if (!bouquetId) return res.status(400).json({ message: "Invalid bouquet draft." });

  const { bouquet_size_code, theme_color, wrapping_option_id, ribbon_option_id, greeting_card_option_id, personalized_message } = req.body;
  if (personalized_message !== undefined && (typeof personalized_message !== "string" || personalized_message.length > MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ message: `Personalized message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
  }

  try {
    const bouquet = await getOwnedBouquet(bouquetId, userId);
    if (!bouquet) return res.status(404).json({ message: "Bouquet draft not found." });
    if (bouquet.bouquet_status !== "draft") return res.status(409).json({ message: "Only an active draft can be changed." });

    let selectedSize = bouquet.bouquet_size_code;
    if (bouquet_size_code !== undefined) {
      const [sizeRows] = await database.query(
        `SELECT size_code, max_flower_slots FROM bouquet_size_options WHERE size_code = ? AND is_active = 1`,
        [bouquet_size_code]
      );
      if (!sizeRows[0]) return res.status(400).json({ message: "Selected bouquet size is unavailable." });
      const [countRows] = await database.query(
        `SELECT COUNT(*) AS flower_count FROM custom_bouquet_slots WHERE custom_bouquet_id = ?`,
        [bouquetId]
      );
      if (Number(countRows[0].flower_count) > Number(sizeRows[0].max_flower_slots)) {
        return res.status(409).json({
          message: `Remove flowers before changing to this size. It holds up to ${sizeRows[0].max_flower_slots} flowers.`
        });
      }
      selectedSize = sizeRows[0].size_code;
    }

    const wrapping = wrapping_option_id === undefined ? undefined : await getOption(wrapping_option_id, "wrapping");
    const ribbon = ribbon_option_id === undefined ? undefined : await getOption(ribbon_option_id, "ribbon");
    const card = greeting_card_option_id === undefined ? undefined : await getOption(greeting_card_option_id, "greeting_card");

    await database.query(
      `UPDATE custom_bouquets
       SET bouquet_size_code = ?,
           theme_color = ?,
           wrapping_option_id = ?,
           ribbon_option_id = ?,
           greeting_card_option_id = ?,
           personalized_message = ?
       WHERE custom_bouquet_id = ?`,
      [
        selectedSize,
        theme_color === undefined ? bouquet.theme_color : (theme_color || null),
        wrapping === undefined ? bouquet.wrapping_option_id : (wrapping ? wrapping.option_id : null),
        ribbon === undefined ? bouquet.ribbon_option_id : (ribbon ? ribbon.option_id : null),
        card === undefined ? bouquet.greeting_card_option_id : (card ? card.option_id : null),
        personalized_message === undefined ? bouquet.personalized_message : (personalized_message || null),
        bouquetId
      ]
    );
    await refreshBouquetPrice(bouquetId);
    return res.json({ message: "Bouquet draft updated.", bouquet: await buildBouquetResponse(bouquetId, userId) });
  } catch (error) {
    console.error("Error updating bouquet draft:", error);
    return res.status(error.status || 500).json({ message: error.message || "Failed to update bouquet draft." });
  }
});

// One request adds exactly one flower instance to the next empty fixed slot.
router.post("/drafts/:id/flowers", async (req, res) => {
  const bouquetId = asPositiveInteger(req.params.id);
  const productId = asPositiveInteger(req.body.product_id);
  const userId = req.user.user_id;
  if (!bouquetId || !productId) return res.status(400).json({ message: "A valid bouquet and flower are required." });

  try {
    await database.beginTransaction();
    const bouquet = await getOwnedBouquet(bouquetId, userId, { lock: true });
    if (!bouquet) {
      await database.rollback();
      return res.status(404).json({ message: "Bouquet draft not found." });
    }
    if (bouquet.bouquet_status !== "draft") {
      await database.rollback();
      return res.status(409).json({ message: "Only an active draft can be changed." });
    }

    const [flowerRows] = await database.query(
      `SELECT p.product_id, p.product_name, p.price, COALESCE(ps.stock_quantity, 0) AS stock_quantity
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.product_id
       WHERE p.product_id = ? AND p.status = 'active' AND LOWER(p.category) = 'flower'
       FOR UPDATE`,
      [productId]
    );
    const flower = flowerRows[0];
    if (!flower || Number(flower.stock_quantity) <= 0) {
      await database.rollback();
      return res.status(409).json({ message: "This flower is currently unavailable." });
    }

    const [slotRows] = await database.query(
      `SELECT slot_number, product_id FROM custom_bouquet_slots
       WHERE custom_bouquet_id = ? ORDER BY slot_number FOR UPDATE`,
      [bouquetId]
    );
    if (slotRows.length >= Number(bouquet.max_flower_slots)) {
      await database.rollback();
      return res.status(409).json({ message: `This ${bouquet.bouquet_size_name} bouquet is full.` });
    }

    const selectedCount = slotRows.filter((slot) => Number(slot.product_id) === productId).length;
    if (selectedCount >= Number(flower.stock_quantity)) {
      await database.rollback();
      return res.status(409).json({ message: "You already selected every available stem of this flower." });
    }

    const usedSlots = new Set(slotRows.map((slot) => Number(slot.slot_number)));
    let nextSlot = 1;
    while (usedSlots.has(nextSlot)) nextSlot += 1;

    await database.query(
      `INSERT INTO custom_bouquet_slots (custom_bouquet_id, slot_number, product_id, unit_price)
       VALUES (?, ?, ?, ?)`,
      [bouquetId, nextSlot, productId, flower.price]
    );
    await refreshBouquetPrice(bouquetId);
    await database.commit();

    return res.status(201).json({ message: `${flower.product_name} added to slot ${nextSlot}.`, bouquet: await buildBouquetResponse(bouquetId, userId) });
  } catch (error) {
    await database.rollback();
    console.error("Error adding flower to bouquet:", error);
    return res.status(500).json({ message: "Failed to add flower to bouquet." });
  }
});

// Apply a previously returned recommendation in one transaction. This adds to
// empty slots only, so a customer's existing manual arrangement is preserved.
router.post("/drafts/:id/apply-recommendation", async (req, res) => {
  const bouquetId = asPositiveInteger(req.params.id);
  const userId = req.user.user_id;
  const requestedFlowers = Array.isArray(req.body.flowers) ? req.body.flowers : [];
  if (!bouquetId || !requestedFlowers.length) {
    return res.status(400).json({ message: "A bouquet and recommendation flowers are required." });
  }

  const requestedQuantities = new Map();
  for (const item of requestedFlowers) {
    const productId = asPositiveInteger(item?.product_id);
    const quantity = asPositiveInteger(item?.quantity);
    if (!productId || !quantity) return res.status(400).json({ message: "Recommendation contains an invalid flower quantity." });
    requestedQuantities.set(productId, (requestedQuantities.get(productId) || 0) + quantity);
  }

  try {
    await database.beginTransaction();
    const bouquet = await getOwnedBouquet(bouquetId, userId, { lock: true });
    if (!bouquet) {
      await database.rollback();
      return res.status(404).json({ message: "Bouquet draft not found." });
    }
    if (bouquet.bouquet_status !== "draft") {
      await database.rollback();
      return res.status(409).json({ message: "Only an active draft can receive a recommendation." });
    }

    const [existingSlots] = await database.query(
      `SELECT slot_number, product_id FROM custom_bouquet_slots
       WHERE custom_bouquet_id = ? ORDER BY slot_number FOR UPDATE`,
      [bouquetId]
    );
    const requestedCount = [...requestedQuantities.values()].reduce((sum, quantity) => sum + quantity, 0);
    const emptySlots = Number(bouquet.max_flower_slots) - existingSlots.length;
    if (requestedCount > emptySlots) {
      await database.rollback();
      return res.status(409).json({ message: `This recommendation needs ${requestedCount} empty slots, but only ${emptySlots} remain. Remove flowers or start a new draft.` });
    }

    const productIds = [...requestedQuantities.keys()];
    const [products] = await database.query(
      `SELECT p.product_id, p.product_name, p.price, COALESCE(ps.stock_quantity, 0) AS stock_quantity
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.product_id
       WHERE p.product_id IN (?) AND p.status = 'active' AND LOWER(p.category) = 'flower'
       FOR UPDATE`,
      [productIds]
    );
    if (products.length !== productIds.length) {
      await database.rollback();
      return res.status(409).json({ message: "One or more recommended flowers are no longer available." });
    }

    const existingByProduct = new Map();
    existingSlots.forEach((slot) => existingByProduct.set(Number(slot.product_id), (existingByProduct.get(Number(slot.product_id)) || 0) + 1));
    const productsById = new Map(products.map((product) => [Number(product.product_id), product]));
    for (const [productId, quantity] of requestedQuantities) {
      const product = productsById.get(productId);
      if (Number(product.stock_quantity) < quantity + (existingByProduct.get(productId) || 0)) {
        await database.rollback();
        return res.status(409).json({ message: `${product.product_name} no longer has enough stock for this recommendation.` });
      }
    }

    const occupiedSlots = new Set(existingSlots.map((slot) => Number(slot.slot_number)));
    const insertedSlots = [];
    let nextSlot = 1;
    for (const [productId, quantity] of requestedQuantities) {
      const product = productsById.get(productId);
      for (let index = 0; index < quantity; index += 1) {
        while (occupiedSlots.has(nextSlot)) nextSlot += 1;
        insertedSlots.push([bouquetId, nextSlot, productId, product.price]);
        occupiedSlots.add(nextSlot);
        nextSlot += 1;
      }
    }
    await database.query(
      `INSERT INTO custom_bouquet_slots (custom_bouquet_id, slot_number, product_id, unit_price) VALUES ?`,
      [insertedSlots]
    );
    await refreshBouquetPrice(bouquetId);
    await database.commit();
    return res.status(200).json({
      message: "AI recommendation added to the next available bouquet slots.",
      bouquet: await buildBouquetResponse(bouquetId, userId)
    });
  } catch (error) {
    await database.rollback();
    console.error("Error applying bouquet recommendation:", error);
    return res.status(500).json({ message: "Failed to apply the recommendation." });
  }
});

// Move into an empty slot or swap two occupied slots. No stock or price changes occur here.
router.put("/drafts/:id/slots/:slotNumber/move", async (req, res) => {
  const bouquetId = asPositiveInteger(req.params.id);
  const sourceSlot = asPositiveInteger(req.params.slotNumber);
  const destinationSlot = asPositiveInteger(req.body.destination_slot);
  const userId = req.user.user_id;
  if (!bouquetId || !sourceSlot || !destinationSlot) return res.status(400).json({ message: "Valid source and destination slots are required." });
  if (sourceSlot === destinationSlot) return res.status(400).json({ message: "Choose a different destination slot." });

  try {
    await database.beginTransaction();
    const bouquet = await getOwnedBouquet(bouquetId, userId, { lock: true });
    if (!bouquet) {
      await database.rollback();
      return res.status(404).json({ message: "Bouquet draft not found." });
    }
    if (bouquet.bouquet_status !== "draft") {
      await database.rollback();
      return res.status(409).json({ message: "Only an active draft can be rearranged." });
    }
    if (sourceSlot > Number(bouquet.max_flower_slots) || destinationSlot > Number(bouquet.max_flower_slots)) {
      await database.rollback();
      return res.status(400).json({ message: "That slot is not available for this bouquet size." });
    }

    const [slotRows] = await database.query(
      `SELECT custom_bouquet_slot_id, slot_number FROM custom_bouquet_slots
       WHERE custom_bouquet_id = ? AND slot_number IN (?, ?) FOR UPDATE`,
      [bouquetId, sourceSlot, destinationSlot]
    );
    const source = slotRows.find((slot) => Number(slot.slot_number) === sourceSlot);
    const destination = slotRows.find((slot) => Number(slot.slot_number) === destinationSlot);
    if (!source) {
      await database.rollback();
      return res.status(404).json({ message: "There is no flower in the selected source slot." });
    }

    if (destination) {
      // Swap via a temporary slot outside the selectable range so the unique constraint is always respected.
      const temporarySlot = Number(bouquet.max_flower_slots) + 1;
      await database.query(`UPDATE custom_bouquet_slots SET slot_number = ? WHERE custom_bouquet_slot_id = ?`, [temporarySlot, source.custom_bouquet_slot_id]);
      await database.query(`UPDATE custom_bouquet_slots SET slot_number = ? WHERE custom_bouquet_slot_id = ?`, [sourceSlot, destination.custom_bouquet_slot_id]);
      await database.query(`UPDATE custom_bouquet_slots SET slot_number = ? WHERE custom_bouquet_slot_id = ?`, [destinationSlot, source.custom_bouquet_slot_id]);
    } else {
      await database.query(`UPDATE custom_bouquet_slots SET slot_number = ? WHERE custom_bouquet_slot_id = ?`, [destinationSlot, source.custom_bouquet_slot_id]);
    }
    await database.commit();

    return res.json({ message: destination ? "Flowers swapped." : "Flower moved.", bouquet: await buildBouquetResponse(bouquetId, userId) });
  } catch (error) {
    await database.rollback();
    console.error("Error moving bouquet flower:", error);
    return res.status(500).json({ message: "Failed to move bouquet flower." });
  }
});

// Save presentation-only adjustments for one flower instance. These values never affect stock or price.
router.put("/drafts/:id/slots/:slotNumber/visual", async (req, res) => {
  const bouquetId = asPositiveInteger(req.params.id);
  const slotNumber = asPositiveInteger(req.params.slotNumber);
  const userId = req.user.user_id;
  if (!bouquetId || !slotNumber) return res.status(400).json({ message: "Invalid bouquet slot." });

  const visualFields = [];
  const values = [];

  try {
    if (hasOwn(req.body, "position_x")) {
      visualFields.push("position_x = ?");
      values.push(parseVisualValue(req.body.position_x, { min: -VISUAL_OFFSET_LIMIT, max: VISUAL_OFFSET_LIMIT, label: "Horizontal adjustment" }));
    }
    if (hasOwn(req.body, "position_y")) {
      visualFields.push("position_y = ?");
      values.push(parseVisualValue(req.body.position_y, { min: -VISUAL_OFFSET_LIMIT, max: VISUAL_OFFSET_LIMIT, label: "Vertical adjustment" }));
    }
    if (hasOwn(req.body, "visual_scale")) {
      visualFields.push("visual_scale = ?");
      values.push(parseVisualValue(req.body.visual_scale, { min: MIN_VISUAL_SCALE, max: MAX_VISUAL_SCALE, label: "Flower size" }));
    }
    if (hasOwn(req.body, "layer_order")) {
      const layer = req.body.layer_order === null ? null : Number(req.body.layer_order);
      if (layer !== null && (!Number.isInteger(layer) || layer < MIN_LAYER_ORDER || layer > MAX_LAYER_ORDER)) {
        return res.status(400).json({ message: `Layer order must be a whole number between ${MIN_LAYER_ORDER} and ${MAX_LAYER_ORDER}.` });
      }
      visualFields.push("layer_order = ?");
      values.push(layer);
    }

    if (!visualFields.length) return res.status(400).json({ message: "Provide at least one visual adjustment." });

    const bouquet = await getOwnedBouquet(bouquetId, userId);
    if (!bouquet) return res.status(404).json({ message: "Bouquet draft not found." });
    if (bouquet.bouquet_status !== "draft") return res.status(409).json({ message: "Only an active draft can be adjusted." });
    if (slotNumber > Number(bouquet.max_flower_slots)) return res.status(400).json({ message: "That slot is not available for this bouquet size." });

    const [result] = await database.query(
      `UPDATE custom_bouquet_slots SET ${visualFields.join(", ")}
       WHERE custom_bouquet_id = ? AND slot_number = ?`,
      [...values, bouquetId, slotNumber]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "There is no flower in that slot." });

    return res.json({
      message: "Flower appearance saved.",
      bouquet: await buildBouquetResponse(bouquetId, userId)
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Error saving bouquet flower appearance:", error);
    return res.status(500).json({ message: "Failed to save flower appearance." });
  }
});

router.delete("/drafts/:id/slots/:slotNumber", async (req, res) => {
  const bouquetId = asPositiveInteger(req.params.id);
  const slotNumber = asPositiveInteger(req.params.slotNumber);
  const userId = req.user.user_id;
  if (!bouquetId || !slotNumber) return res.status(400).json({ message: "Invalid bouquet slot." });

  try {
    const bouquet = await getOwnedBouquet(bouquetId, userId);
    if (!bouquet) return res.status(404).json({ message: "Bouquet draft not found." });
    if (bouquet.bouquet_status !== "draft") return res.status(409).json({ message: "Only an active draft can be changed." });

    const [result] = await database.query(
      `DELETE FROM custom_bouquet_slots WHERE custom_bouquet_id = ? AND slot_number = ?`,
      [bouquetId, slotNumber]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "There is no flower in that slot." });
    await refreshBouquetPrice(bouquetId);
    return res.json({ message: "Flower removed from bouquet.", bouquet: await buildBouquetResponse(bouquetId, userId) });
  } catch (error) {
    console.error("Error removing bouquet flower:", error);
    return res.status(500).json({ message: "Failed to remove bouquet flower." });
  }
});

module.exports = router;
