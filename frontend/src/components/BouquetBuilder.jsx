import React, { useEffect, useMemo, useState } from "react";
import bouquetFlowerFallback from "../assets/bouquet-rose-head.png";
import bouquetGreetingCardClassic from "../assets/bouquet-greeting-card-classic.png";
import bouquetTemplate from "../assets/bouquet-template-empty.png";
import bouquetRibbonPink from "../assets/bouquet-ribbon-pink.png";
import bouquetRibbonRed from "../assets/bouquet-ribbon-red.png";
import bouquetThemeBlue from "../assets/bouquet-theme-blue-no-ribbon.png";
import bouquetThemeMixed from "../assets/bouquet-theme-mixed-no-ribbon.png";
import bouquetThemePink from "../assets/bouquet-theme-pink-no-ribbon.png";
import bouquetThemePurple from "../assets/bouquet-theme-purple-no-ribbon.png";
import bouquetThemeRed from "../assets/bouquet-theme-red-no-ribbon.png";
import bouquetThemeWhite from "../assets/bouquet-theme-white-no-ribbon.png";
import bouquetWrapGiftBox from "../assets/bouquet-wrap-gift-box.png";
import bouquetWrapKraft from "../assets/bouquet-wrap-kraft.png";
import bouquetWrapSatinWhite from "../assets/bouquet-wrap-satin-white.png";
import "./BouquetBuilder.css";

const API_URL = "http://localhost:5000/api/bouquets";

// These are true artwork variants, not CSS hue filters. A theme therefore remains
// recognisable regardless of the original colours contained in the template image.
const THEME_TEMPLATES = {
  blush: bouquetThemePink,
  pink: bouquetThemePink,
  blue: bouquetThemeBlue,
  mixed: bouquetThemeMixed,
  purple: bouquetThemePurple,
  red: bouquetThemeRed,
  white: bouquetThemeWhite
};

const WRAPPING_TEMPLATES = {
  "Gift Box": bouquetWrapGiftBox,
  "Kraft Paper": bouquetWrapKraft,
  "Satin Wrap": bouquetWrapSatinWhite
};

const RIBBON_TEMPLATES = {
  pink: bouquetRibbonPink,
  red: bouquetRibbonRed
};

const BOUQUET_STYLES = [
  { value: "theme:blush-pink", label: "Blush Pink", theme: "Pink" },
  { value: "theme:red", label: "Red", theme: "Red" },
  { value: "theme:white", label: "White", theme: "White" },
  { value: "theme:blue", label: "Blue", theme: "Blue" },
  { value: "theme:purple", label: "Purple", theme: "Purple" },
  { value: "theme:mixed", label: "Mixed", theme: "Mixed" },
  { value: "wrapping:Kraft Paper", label: "Kraft Paper — Brown", theme: "Blush", wrappingName: "Kraft Paper" },
  { value: "wrapping:Satin Wrap", label: "Satin Wrap — White", theme: "White", wrappingName: "Satin Wrap" },
  { value: "wrapping:Gift Box", label: "Gift Box — Blush", theme: "Blush", wrappingName: "Gift Box" }
];

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP"
});

const BOUQUET_SLOT_LAYOUTS = {
  small: {
    1: { x: 50, y: 24, scale: .84, rotation: 0, layer: 2 },
    2: { x: 38, y: 35, scale: .92, rotation: -11, layer: 3 },
    3: { x: 62, y: 35, scale: .92, rotation: 11, layer: 4 },
    4: { x: 44, y: 46, scale: 1.04, rotation: -6, layer: 6 },
    5: { x: 56, y: 46, scale: 1.08, rotation: 6, layer: 7 }
  },
  medium: {
    1: { x: 50, y: 16, scale: .74, rotation: 0, layer: 2 },
    2: { x: 38, y: 24, scale: .82, rotation: -10, layer: 3 },
    3: { x: 62, y: 24, scale: .82, rotation: 10, layer: 4 },
    4: { x: 28, y: 35, scale: .9, rotation: -15, layer: 3 },
    5: { x: 46, y: 35, scale: .94, rotation: -5, layer: 5 },
    6: { x: 64, y: 35, scale: .94, rotation: 5, layer: 5 },
    7: { x: 75, y: 35, scale: .9, rotation: 15, layer: 4 },
    8: { x: 36, y: 46, scale: 1.04, rotation: -8, layer: 6 },
    9: { x: 54, y: 46, scale: 1.1, rotation: 3, layer: 8 },
    10: { x: 70, y: 46, scale: 1.04, rotation: 10, layer: 7 }
  },
  large: {
    1: { x: 50, y: 12, scale: .68, rotation: 0, layer: 2 },
    2: { x: 38, y: 19, scale: .76, rotation: -9, layer: 3 },
    3: { x: 62, y: 19, scale: .76, rotation: 9, layer: 3 },
    4: { x: 27, y: 28, scale: .84, rotation: -16, layer: 3 },
    5: { x: 45, y: 28, scale: .88, rotation: -6, layer: 4 },
    6: { x: 63, y: 28, scale: .88, rotation: 6, layer: 4 },
    7: { x: 75, y: 28, scale: .84, rotation: 16, layer: 3 },
    8: { x: 20, y: 39, scale: .92, rotation: -18, layer: 4 },
    9: { x: 35, y: 39, scale: .98, rotation: -10, layer: 5 },
    10: { x: 50, y: 39, scale: 1.02, rotation: 0, layer: 6 },
    11: { x: 65, y: 39, scale: .98, rotation: 10, layer: 5 },
    12: { x: 80, y: 39, scale: .92, rotation: 18, layer: 4 },
    13: { x: 30, y: 50, scale: 1.05, rotation: -10, layer: 6 },
    14: { x: 50, y: 50, scale: 1.12, rotation: 0, layer: 8 },
    15: { x: 70, y: 50, scale: 1.05, rotation: 10, layer: 7 }
  }
};

function BouquetBuilder({ onBack, onGoToCart }) {
  const [configuration, setConfiguration] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [bouquet, setBouquet] = useState(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [aiPreferences, setAiPreferences] = useState({
    occasion: "",
    budget: "",
    preferred_color: "",
    preferred_flowers: ""
  });

  const request = async (path, options = {}) => {
    const token = sessionStorage.getItem("token");
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok) {
      throw new Error(
        data?.message ||
        `The server returned ${response.status} instead of the expected API response. Restart the backend and try again.`
      );
    }
    if (!data) {
      throw new Error("The backend returned an unexpected response. Restart the backend and try again.");
    }
    return data;
  };

  const cartRequest = async (path, options = {}) => {
    const token = sessionStorage.getItem("token");
    const response = await fetch(`http://localhost:5000/api/cart${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(data?.message || `The server returned ${response.status}.`);
    return data;
  };

  useEffect(() => {
    const loadBuilder = async () => {
      try {
        const [config, flowers] = await Promise.all([
          request("/configuration"),
          request("/catalog")
        ]);
        setConfiguration(config);
        setCatalog(flowers);
        setSelectedSize(config.sizes[0]?.size_code || "");

        const savedDraftId = sessionStorage.getItem("bouquetDraftId");
        if (savedDraftId) {
          try {
            const savedDraft = await request(`/drafts/${savedDraftId}`);
            if (savedDraft.bouquet.bouquet_status === "draft") {
              setBouquet(savedDraft.bouquet);
              setSelectedSize(savedDraft.bouquet.bouquet_size.code);
              setNotice("Your saved bouquet draft is ready to continue.");
            }
          } catch {
            sessionStorage.removeItem("bouquetDraftId");
          }
        }
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };

    loadBuilder();
  }, []);

  const slotMap = useMemo(
    () => new Map((bouquet?.slots || []).map((slot) => [Number(slot.slot_number), slot])),
    [bouquet]
  );

  const selectedFlowerCounts = useMemo(() => {
    const counts = new Map();
    (bouquet?.slots || []).forEach((slot) => {
      counts.set(slot.product_id, (counts.get(slot.product_id) || 0) + 1);
    });
    return counts;
  }, [bouquet]);

  const runAction = async (action) => {
    setSaving(true);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const createDraft = () => runAction(async () => {
    const data = await request("/drafts", {
      method: "POST",
      body: JSON.stringify({ bouquet_size_code: selectedSize })
    });
    setBouquet(data.bouquet);
    sessionStorage.setItem("bouquetDraftId", data.bouquet.custom_bouquet_id);
    setNotice("Your bouquet canvas is ready. Choose a flower to fill the first available slot.");
  });

  const updateDraft = (changes, message = "Bouquet details updated.") => runAction(async () => {
    const data = await request(`/drafts/${bouquet.custom_bouquet_id}`, {
      method: "PATCH",
      body: JSON.stringify(changes)
    });
    setBouquet(data.bouquet);
    setSelectedSize(data.bouquet.bouquet_size.code);
    setNotice(message);
    setSelectedSlot(null);
  });

  const addFlower = (productId) => runAction(async () => {
    const data = await request(`/drafts/${bouquet.custom_bouquet_id}/flowers`, {
      method: "POST",
      body: JSON.stringify({ product_id: productId })
    });
    setBouquet(data.bouquet);
    setNotice(data.message);
  });

  const selectSlot = (slotNumber) => {
    const flower = slotMap.get(slotNumber);

    if (selectedSlot === null) {
      if (!flower) {
        setNotice("Choose a flower in the bouquet first, then choose where to move it.");
        return;
      }
      setSelectedSlot(slotNumber);
      setNotice(`Slot ${slotNumber} selected. Choose another slot to move or swap it.`);
      return;
    }

    if (selectedSlot === slotNumber) {
      setSelectedSlot(null);
      setNotice("Flower selection cancelled.");
      return;
    }

    runAction(async () => {
      const data = await request(`/drafts/${bouquet.custom_bouquet_id}/slots/${selectedSlot}/move`, {
        method: "PUT",
        body: JSON.stringify({ destination_slot: slotNumber })
      });
      setBouquet(data.bouquet);
      setSelectedSlot(null);
      setNotice(data.message);
    });
  };

  const removeSelectedFlower = () => {
    if (selectedSlot === null) return;
    runAction(async () => {
      const data = await request(`/drafts/${bouquet.custom_bouquet_id}/slots/${selectedSlot}`, {
        method: "DELETE"
      });
      setBouquet(data.bouquet);
      setNotice(data.message);
      setSelectedSlot(null);
    });
  };

  const addToCart = () => runAction(async () => {
    if (bouquet.flower_count === 0) {
      throw new Error("Add at least one flower before adding your bouquet to the bag.");
    }
    const data = await cartRequest("/custom-bouquets", {
      method: "POST",
      body: JSON.stringify({ custom_bouquet_id: bouquet.custom_bouquet_id })
    });
    sessionStorage.removeItem("bouquetDraftId");
    setNotice(data.message);
    onGoToCart();
  });

  const getRecommendation = async () => {
    if (!aiPreferences.occasion.trim() || !aiPreferences.budget) {
      setError("Tell us the occasion and budget before requesting an AI recommendation.");
      return;
    }
    setAiLoading(true);
    setError("");
    try {
      const data = await request("/recommendations", {
        method: "POST",
        body: JSON.stringify({
          occasion: aiPreferences.occasion,
          budget: Number(aiPreferences.budget),
          preferred_color: aiPreferences.preferred_color,
          preferred_flowers: aiPreferences.preferred_flowers,
          bouquet_size: bouquet.bouquet_size.code
        })
      });
      setRecommendation(data);
      setNotice(data.source === "gemini" ? "Your Gemini recommendation is ready." : data.notice);
    } catch (recommendationError) {
      setError(recommendationError.message);
    } finally {
      setAiLoading(false);
    }
  };

  const applyRecommendation = () => runAction(async () => {
    if (!recommendation?.recommendation) return;
    const data = await request(`/drafts/${bouquet.custom_bouquet_id}/apply-recommendation`, {
      method: "POST",
      body: JSON.stringify({
        flowers: recommendation.recommendation.flowers.map((flower) => ({
          product_id: flower.product_id,
          quantity: flower.quantity
        }))
      })
    });
    setBouquet(data.bouquet);
    setRecommendation(null);
    setSelectedSlot(null);
    setNotice(data.message);
  });

  if (loading) {
    return <main className="builder-state"><p className="eyebrow">BLOOMBOX</p><h1>Preparing your bouquet studio…</h1></main>;
  }

  if (error && !configuration) {
    return <main className="builder-state"><p className="eyebrow">BOUQUET BUILDER</p><h1>We could not open the studio.</h1><p>{error}</p><button className="builder-secondary" onClick={onBack}>Back to home</button></main>;
  }

  if (!bouquet) {
    return (
      <main className="builder-start">
        <button className="builder-back" onClick={onBack}>← Back to home</button>
        <p className="eyebrow">CREATE YOUR BOUQUET</p>
        <h1>Start with the<br /><em>right size.</em></h1>
        <p className="builder-lede">Choose a bouquet size to open your personal flower-arranging studio.</p>
        <div className="builder-size-picker">
          {configuration?.sizes.map((size) => (
            <button
              key={size.size_code}
              className={`size-choice ${selectedSize === size.size_code ? "is-selected" : ""}`}
              onClick={() => setSelectedSize(size.size_code)}
            >
              <span>{size.display_name}</span>
              <strong>{size.max_flower_slots} flower slots</strong>
              <small>{size.base_price > 0 ? `Base ${peso.format(size.base_price)}` : "No base charge"}</small>
            </button>
          ))}
        </div>
        {error && <p className="builder-feedback is-error">{error}</p>}
        <button className="builder-primary" disabled={!selectedSize || saving} onClick={createDraft}>
          {saving ? "Opening studio…" : "Start designing →"}
        </button>
      </main>
    );
  }

  const capacity = Number(bouquet.bouquet_size.max_flower_slots);
  const full = bouquet.flower_count >= capacity;
  const slots = Array.from({ length: capacity }, (_, index) => index + 1);
  const bouquetSizeCode = bouquet.bouquet_size.code;
  const slotLayout = BOUQUET_SLOT_LAYOUTS[bouquetSizeCode] || BOUQUET_SLOT_LAYOUTS.large;
  const themeKey = (bouquet.theme_color || "blush").toLowerCase();
  const themeTemplate = THEME_TEMPLATES[themeKey] || bouquetTemplate;
  const wrappingName = bouquet.customization?.wrapping?.option_name || "";
  const previewTemplate = WRAPPING_TEMPLATES[wrappingName] || themeTemplate;
  const ribbonColor = (bouquet.customization?.ribbon?.option_color || "").toLowerCase();
  const ribbonTemplate = RIBBON_TEMPLATES[ribbonColor];
  const greetingCardTemplate = bouquet.customization?.greeting_card ? bouquetGreetingCardClassic : null;
  const selectedFlower = selectedSlot === null ? null : slotMap.get(selectedSlot);

  const updateSelectedFlowerAppearance = (changes, message) => {
    if (!selectedFlower) return;
    runAction(async () => {
      const data = await request(`/drafts/${bouquet.custom_bouquet_id}/slots/${selectedSlot}/visual`, {
        method: "PUT",
        body: JSON.stringify(changes)
      });
      setBouquet(data.bouquet);
      setNotice(message || data.message);
    });
  };

  const nudgeSelectedFlower = (axis, amount) => {
    if (!selectedFlower) return;
    const key = axis === "x" ? "position_x" : "position_y";
    const current = Number(selectedFlower[key] || 0);
    const next = Math.max(-14, Math.min(14, current + amount));
    updateSelectedFlowerAppearance({ [key]: next }, "Flower position saved.");
  };

  const resizeSelectedFlower = (amount) => {
    if (!selectedFlower) return;
    const current = Number(selectedFlower.visual_scale || 1);
    const next = Math.max(.7, Math.min(1.4, Number((current + amount).toFixed(2))));
    updateSelectedFlowerAppearance({ visual_scale: next }, "Flower size saved.");
  };

  const changeSelectedFlowerLayer = (amount) => {
    if (!selectedFlower) return;
    const defaultLayer = slotLayout[selectedSlot].layer;
    const current = Number(selectedFlower.layer_order || defaultLayer);
    const next = Math.max(1, Math.min(12, current + amount));
    updateSelectedFlowerAppearance({ layer_order: next }, "Flower layer saved.");
  };
  const optionGroups = {
    wrapping: configuration.options.filter((option) => option.option_type === "wrapping"),
    ribbon: configuration.options.filter((option) => option.option_type === "ribbon"),
    greeting_card: configuration.options.filter((option) => option.option_type === "greeting_card")
  };
  const selectedWrappingName = bouquet.customization?.wrapping?.option_name || "";
  const selectedStyle = selectedWrappingName
    ? BOUQUET_STYLES.find((style) => style.wrappingName === selectedWrappingName)
    : BOUQUET_STYLES.find((style) => style.theme.toLowerCase() === themeKey || (style.value === "theme:blush-pink" && themeKey === "blush"));

  const updateBouquetStyle = (styleValue) => {
    const style = BOUQUET_STYLES.find((entry) => entry.value === styleValue);
    if (!style) return;

    const wrapping = style.wrappingName
      ? optionGroups.wrapping.find((option) => option.option_name === style.wrappingName)
      : null;

    updateDraft({
      theme_color: style.theme,
      wrapping_option_id: wrapping?.option_id || null
    }, `${style.label} style updated.`);
  };

  return (
    <main className="bouquet-builder">
      <header className="builder-header">
        <button className="builder-back" onClick={onBack}>← Back to home</button>
        <div><p className="eyebrow">BLOOMBOX CUSTOM STUDIO</p><h1>Arrange something <em>personal.</em></h1></div>
        <div className="builder-progress"><strong>{bouquet.flower_count} / {capacity}</strong><span>flower slots filled</span></div>
      </header>

      {(notice || error) && <div className={`builder-feedback ${error ? "is-error" : ""}`}>{error || notice}</div>}

      <div className="builder-layout">
        <div className="builder-catalog-stack">
        <aside className="builder-catalog panel-card">
          <div className="panel-heading"><p className="eyebrow">01 — PICK FLOWERS</p><h2>Flower catalog</h2><span>One click adds one stem.</span></div>
          <div className="catalog-flower-list">
            {catalog.map((flower) => {
              const count = selectedFlowerCounts.get(flower.product_id) || 0;
              const unavailable = flower.stock_quantity <= count || full;
              return (
                <article className="builder-flower" key={flower.product_id}>
                  <div className="flower-thumb">
                    <img src={flower.product_image || bouquetFlowerFallback} alt="" />
                  </div>
                  <div><h3>{flower.product_name}</h3><p>{peso.format(flower.price)} · {flower.stock_quantity} in stock</p>{count > 0 && <small>{count} in your bouquet</small>}</div>
                  <button disabled={unavailable || saving} onClick={() => addFlower(flower.product_id)} aria-label={`Add ${flower.product_name}`}>
                    {flower.stock_quantity <= count ? "—" : "+"}
                  </button>
                </article>
              );
            })}
          </div>
        </aside>

        <section className="ai-guide panel-card">
          <p className="eyebrow">AI BOUQUET GUIDE</p>
          <h3>Need a little inspiration?</h3>
          <p>Gemini suggests; BloomBox checks stock, size, and price.</p>
          <input
            value={aiPreferences.occasion}
            disabled={aiLoading || saving}
            maxLength="80"
            placeholder="Occasion — e.g. anniversary"
            onChange={(event) => setAiPreferences({ ...aiPreferences, occasion: event.target.value })}
          />
          <input
            value={aiPreferences.budget}
            disabled={aiLoading || saving}
            type="number"
            min="1"
            placeholder="Budget in PHP — e.g. 500"
            onChange={(event) => setAiPreferences({ ...aiPreferences, budget: event.target.value })}
          />
          <input
            value={aiPreferences.preferred_color}
            disabled={aiLoading || saving}
            maxLength="50"
            placeholder="Preferred color — optional"
            onChange={(event) => setAiPreferences({ ...aiPreferences, preferred_color: event.target.value })}
          />
          <input
            value={aiPreferences.preferred_flowers}
            disabled={aiLoading || saving}
            placeholder="Preferred flowers — optional"
            onChange={(event) => setAiPreferences({ ...aiPreferences, preferred_flowers: event.target.value })}
          />
          <button className="builder-secondary ai-request-button" disabled={aiLoading || saving} onClick={getRecommendation}>
            {aiLoading ? "Asking Gemini…" : "Get AI suggestion"}
          </button>
          {recommendation?.recommendation && <div className="ai-recommendation">
            <span className={`ai-source ${recommendation.source === "gemini" ? "is-gemini" : ""}`}>{recommendation.source === "gemini" ? "Gemini suggestion" : "Local fallback"}</span>
            <h4>{recommendation.recommendation.bouquet_name}</h4>
            <p>{recommendation.recommendation.reason}</p>
            <ul>{recommendation.recommendation.flowers.map((flower) => <li key={flower.product_id}>{flower.quantity} × {flower.product_name}</li>)}</ul>
            <strong>{peso.format(recommendation.recommendation.price_breakdown.estimated_total)}</strong>
            <button className="builder-primary" disabled={saving || aiLoading} onClick={applyRecommendation}>Apply to bouquet</button>
          </div>}
        </section>
        </div>

        <section className="builder-canvas panel-card">
          <div className="panel-heading canvas-heading"><p className="eyebrow">02 — ARRANGE</p><h2>Your {bouquet.bouquet_size.name.toLowerCase()} bouquet</h2><span>Tap a flower, then an empty slot to move it or another flower to swap it.</span></div>
          <div className={`bouquet-preview bouquet-size-${bouquetSizeCode} theme-${themeKey}`}>
            <img className="bouquet-template" src={previewTemplate} alt="" aria-hidden="true" />
            <img className="bouquet-template bouquet-template-front" src={previewTemplate} alt="" aria-hidden="true" />
            {greetingCardTemplate && <img className="bouquet-greeting-card" src={greetingCardTemplate} alt="" aria-hidden="true" />}
            {ribbonTemplate && <img className="bouquet-ribbon" src={ribbonTemplate} alt="" aria-hidden="true" />}
            {slots.map((slotNumber) => {
              const flower = slotMap.get(slotNumber);
              const slotPresentation = slotLayout[slotNumber];
              const visualOffsetX = Number(flower?.position_x || 0);
              const visualOffsetY = Number(flower?.position_y || 0);
              const visualScale = Number(flower?.visual_scale || 1);
              const visualLayer = Number(flower?.layer_order || slotPresentation.layer);
              const destinationType = selectedSlot !== null && selectedSlot !== slotNumber
                ? (flower ? "is-swap-target" : "is-move-target")
                : "";
              return <button
                key={slotNumber}
                type="button"
                className={`bouquet-slot slot-${slotNumber} ${flower ? "is-filled" : ""} ${!flower && selectedSlot === null ? "is-hidden-empty" : ""} ${selectedSlot === slotNumber ? "is-selected" : ""} ${destinationType}`}
                style={{
                  "--slot-x": `${slotPresentation.x + visualOffsetX}%`,
                  "--slot-y": `${slotPresentation.y + visualOffsetY}%`,
                  "--flower-scale": slotPresentation.scale * visualScale,
                  "--flower-rotation": `${slotPresentation.rotation}deg`,
                  "--bloom-size": flower?.product_image ? "100%" : "145%",
                  "--slot-layer": flower ? visualLayer : 9
                }}
                onClick={() => selectSlot(slotNumber)}
                disabled={saving}
                title={flower ? `${flower.product_name}, slot ${slotNumber}` : `Empty slot ${slotNumber}`}
                aria-label={selectedSlot === slotNumber
                  ? `${flower.product_name} in slot ${slotNumber}, selected. Click again to cancel.`
                  : selectedSlot !== null
                    ? `${flower ? `Swap with ${flower.product_name}` : "Move selected flower to empty"} slot ${slotNumber}`
                    : flower ? `${flower.product_name} in slot ${slotNumber}` : `Empty slot ${slotNumber}`}
                aria-pressed={selectedSlot === slotNumber}
              >
                {flower ? (
                  <span className="flower-visual">
                    <span className="flower-hover-ring" aria-hidden="true" />
                    <img className={flower.product_image ? "slot-product-image" : "slot-illustration"} src={flower.product_image || bouquetFlowerFallback} alt={flower.product_name} />
                  </span>
                ) : <span className="empty-dot" />}
                <i>{slotNumber}</i>
              </button>;
            })}
          </div>
          <p className={`arrangement-status ${selectedFlower ? "is-active" : ""}`} role="status">
            {selectedFlower
              ? `${selectedFlower.product_name} in slot ${selectedSlot} is selected. Adjust its appearance below, or choose a dotted empty slot to move it or another flower to swap positions.`
              : "Select a flower in the bouquet to start rearranging it."}
          </p>
          {selectedFlower && <section className="flower-adjustments" aria-label="Selected flower appearance controls">
            <div className="flower-adjustments-heading"><p className="eyebrow">SELECTED FLOWER</p><strong>{selectedFlower.product_name}</strong></div>
            <div className="flower-adjustment-grid">
              <div className="adjustment-group"><span>SIZE</span><div><button type="button" className="adjustment-button" disabled={saving || Number(selectedFlower.visual_scale || 1) <= .7} onClick={() => resizeSelectedFlower(-.1)} aria-label="Make selected flower smaller">−</button><output>{Math.round(Number(selectedFlower.visual_scale || 1) * 100)}%</output><button type="button" className="adjustment-button" disabled={saving || Number(selectedFlower.visual_scale || 1) >= 1.4} onClick={() => resizeSelectedFlower(.1)} aria-label="Make selected flower larger">+</button></div></div>
              <div className="adjustment-group"><span>POSITION</span><div className="nudge-controls"><button type="button" className="adjustment-button" disabled={saving} onClick={() => nudgeSelectedFlower("y", -2)} aria-label="Move selected flower up">↑</button><button type="button" className="adjustment-button" disabled={saving} onClick={() => nudgeSelectedFlower("x", -2)} aria-label="Move selected flower left">←</button><button type="button" className="adjustment-button" disabled={saving} onClick={() => nudgeSelectedFlower("y", 2)} aria-label="Move selected flower down">↓</button><button type="button" className="adjustment-button" disabled={saving} onClick={() => nudgeSelectedFlower("x", 2)} aria-label="Move selected flower right">→</button></div></div>
              <div className="adjustment-group"><span>LAYER</span><div><button type="button" className="adjustment-button adjustment-text" disabled={saving || Number(selectedFlower.layer_order || slotLayout[selectedSlot].layer) <= 1} onClick={() => changeSelectedFlowerLayer(-1)}>Back</button><button type="button" className="adjustment-button adjustment-text" disabled={saving || Number(selectedFlower.layer_order || slotLayout[selectedSlot].layer) >= 12} onClick={() => changeSelectedFlowerLayer(1)}>Front</button></div></div>
            </div>
            <button type="button" className="builder-text-button reset-flower-appearance" disabled={saving} onClick={() => updateSelectedFlowerAppearance({ position_x: null, position_y: null, visual_scale: null, layer_order: null }, "Flower appearance reset.")}>Reset selected flower appearance</button>
          </section>}
          <div className="canvas-actions"><button className="builder-secondary" disabled={selectedSlot === null || saving} onClick={removeSelectedFlower}>Remove selected flower</button><button className="builder-text-button" onClick={() => { setSelectedSlot(null); setNotice("Flower selection cancelled."); }}>Cancel selection</button></div>
        </section>

        <aside className="builder-summary panel-card">
          <div className="panel-heading"><p className="eyebrow">03 — MAKE IT YOURS</p><h2>Finishing touches</h2></div>
          <label>BOUQUET SIZE<select value={bouquet.bouquet_size.code} disabled={saving} onChange={(event) => updateDraft({ bouquet_size_code: event.target.value }, "Bouquet size updated.")}>
            {configuration.sizes.map((size) => <option key={size.size_code} value={size.size_code}>{size.display_name} — {size.max_flower_slots} slots</option>)}
          </select></label>
          <label>BOUQUET STYLE<select value={selectedStyle?.value || "theme:blush-pink"} disabled={saving} onChange={(event) => updateBouquetStyle(event.target.value)}>
            <optgroup label="Color themes">{BOUQUET_STYLES.filter((style) => !style.wrappingName).map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}</optgroup>
            <optgroup label="Wrapping styles">{BOUQUET_STYLES.filter((style) => style.wrappingName).map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}</optgroup>
          </select></label>
          {Object.entries(optionGroups).filter(([type]) => type !== "wrapping").map(([type, options]) => {
            const selected = bouquet.customization[type];
            const key = `${type}_option_id`;
            return <label key={type}>{type.replace("_", " ").toUpperCase()}<select value={selected?.option_id || ""} disabled={saving} onChange={(event) => updateDraft({ [key]: event.target.value || null }, `${type.replace("_", " ")} updated.`)}>
              <option value="">No {type.replace("_", " ")}</option>{options.map((option) => <option key={option.option_id} value={option.option_id}>{option.option_name}{option.option_color ? ` — ${option.option_color}` : ""} {option.additional_price > 0 ? `(+${peso.format(option.additional_price)})` : ""}</option>)}
            </select></label>;
          })}
          <label>PERSONAL MESSAGE <small>optional · 250 characters max</small><textarea maxLength="250" value={bouquet.personalized_message || ""} disabled={saving} placeholder="Write a thoughtful note…" onBlur={(event) => updateDraft({ personalized_message: event.target.value }, "Personal message saved.")} onChange={(event) => setBouquet({ ...bouquet, personalized_message: event.target.value })} /></label>
          <div className="price-card"><p className="eyebrow">YOUR ESTIMATE</p><div><span>Flowers</span><strong>{peso.format(bouquet.price_breakdown.flower_subtotal)}</strong></div><div><span>Bouquet base</span><strong>{peso.format(bouquet.price_breakdown.bouquet_base_cost)}</strong></div><div><span>Finishing touches</span><strong>{peso.format(bouquet.price_breakdown.wrapping_cost + bouquet.price_breakdown.add_on_cost)}</strong></div><div className="price-total"><span>Total</span><strong>{peso.format(bouquet.price_breakdown.total_price)}</strong></div></div>
          <button className="builder-primary builder-future" disabled={saving || bouquet.flower_count === 0} onClick={addToCart}>
            {saving ? "Adding…" : "Review & add to bag →"}
          </button>
        </aside>
      </div>
    </main>
  );
}

export default BouquetBuilder;
