/* ============================================================
   M61 Restaurant — Cart module
   - State persisted in localStorage under "m61:cart"
   - add / update / remove / clear
   - cart-count badge wired across pages
   - delegates clicks on [data-add-to-cart] (one listener for all cards)
   - renderCartList() for cart.html
   - renderSummary() for cart.html + checkout.html
   ============================================================ */
(function () {
  "use strict";

  const STORAGE_KEY = "m61:cart";

  /* ============================================================
     Pricing configuration
     ------------------------------------------------------------
     >>> FREE_DELIVERY_THRESHOLD is the single source of truth for
     >>> the free-delivery promise. Change it here and it updates
     >>> the cart, the checkout summary and the confirmation page.
     It is currently set to Rs. 3,500, which is the figure the site
     already advertises to customers. Delivery only — pickup is
     never charged.
     ============================================================ */
  const DELIVERY_FEE = 150;
  const FREE_DELIVERY_THRESHOLD = 3500;

  /* ----- State helpers ----- */
  const read = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  };
  const write = (items) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (_) {}
  };

  const findIndex = (items, id, variant) =>
    items.findIndex((i) => i.id === id && (i.variant || "") === (variant || ""));

  const fmt = (n) => "Rs. " + Number(n).toLocaleString("en-PK", { maximumFractionDigits: 0 });

  /* ----- Public API ----- */
  function getItems() { return read(); }
  function getCount() { return read().reduce((sum, i) => sum + (i.qty || 0), 0); }
  function getSubtotal() { return read().reduce((sum, i) => sum + (i.qty || 0) * (i.price || 0), 0); }

  /**
   * Single source of truth for the money. The cart page, the checkout
   * summary and the confirmation page all call this, so a customer can
   * never be shown one total at checkout and a different one on
   * confirmation.
   *
   * @param {"delivery"|"pickup"} fulfilment
   */
  function getTotals(fulfilment) {
    const items = read();
    const subtotal = getSubtotal();
    const isDelivery = fulfilment !== "pickup";
    const qualifiesFree =
      isDelivery && items.length > 0 && subtotal >= FREE_DELIVERY_THRESHOLD;
    const delivery = !isDelivery || items.length === 0 ? 0 : (qualifiesFree ? 0 : DELIVERY_FEE);
    return {
      items,
      count: getCount(),
      subtotal,
      delivery,
      total: subtotal + delivery,
      isDelivery,
      freeDelivery: qualifiesFree,
      remainingForFree: isDelivery && !qualifiesFree
        ? Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal)
        : 0,
      threshold: FREE_DELIVERY_THRESHOLD
    };
  }

  function addItem({ id, name, price, category, variant, image }) {
    if (!id || typeof price === "undefined") return;
    const items = read();
    const idx = findIndex(items, id, variant);
    if (idx >= 0) {
      items[idx].qty += 1;
    } else {
      items.push({
        id,
        name: name || "Item",
        price: Number(price) || 0,
        category: category || "",
        variant: variant || "",
        image: image || "",
        qty: 1
      });
    }
    write(items);
    refreshBadge();
  }

  function updateQty(id, variant, qty) {
    const items = read();
    const idx = findIndex(items, id, variant);
    if (idx < 0) return;
    if (qty <= 0) items.splice(idx, 1);
    else items[idx].qty = qty;
    write(items);
    refreshBadge();
  }

  function removeItem(id, variant) {
    const items = read();
    const idx = findIndex(items, id, variant);
    if (idx < 0) return;
    items.splice(idx, 1);
    write(items);
    refreshBadge();
  }

  function clearCart() { write([]); refreshBadge(); }

  function refreshBadge() {
    const count = getCount();
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      const prev = el.textContent;
      el.textContent = String(count);
      el.setAttribute("data-empty", count === 0 ? "true" : "false");
      el.setAttribute("aria-label", count === 1 ? "1 item in cart" : count + " items in cart");
      // Pulse only when the count actually changed, so first paint is quiet.
      if (prev !== String(count) && count > 0) {
        el.classList.remove("is-bumping");
        void el.offsetWidth;
        el.classList.add("is-bumping");
      }
    });
  }

  /* ----- Toast (announced to screen readers) ----- */
  let toastNode = null;
  function showToast(message) {
    if (!toastNode) {
      toastNode = document.createElement("div");
      toastNode.className = "toast";
      // role=status + aria-live=polite so the add-to-cart confirmation is
      // actually announced. Previously the toast was a silent div.
      toastNode.setAttribute("role", "status");
      toastNode.setAttribute("aria-live", "polite");
      toastNode.setAttribute("aria-atomic", "true");
      toastNode.innerHTML =
        '<span class="toast__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span class="toast__msg"></span>';
      document.body.appendChild(toastNode);
    }
    const msg = toastNode.querySelector(".toast__msg");
    if (msg) msg.textContent = message;
    toastNode.classList.add("is-shown");
    clearTimeout(toastNode._timer);
    toastNode._timer = setTimeout(() => toastNode.classList.remove("is-shown"), 2600);
  }

  /* ----- Global click delegation: add-to-cart ----- */
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target.closest("[data-add-to-cart]") : null;
    if (!target) return;
    // Let a genuinely disabled control ignore the click.
    if (target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true") return;
    e.preventDefault();
    const id = target.getAttribute("data-id");
    const name = target.getAttribute("data-name") || "Item";
    const price = parseFloat(target.getAttribute("data-price") || "0");
    const category = target.getAttribute("data-category") || "";
    const variant = target.getAttribute("data-variant") || "";
    const image = target.getAttribute("data-image") || "";
    if (!id || !price) return;
    addItem({ id, name, price, category, variant, image });
    const count = getCount();
    showToast(name + " added — " + count + (count === 1 ? " item" : " items") + " in cart");
    target.classList.add("is-added");
    setTimeout(() => target.classList.remove("is-added"), 1200);
  });

  /* ----- Cart page renderer ----- */
  function renderCartList(rootEl) {
    if (!rootEl) return;
    const items = read();
    if (!items.length) {
      rootEl.innerHTML = '<div class="cart-empty">' +
        '<div class="cart-empty__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg></div>' +
        '<h3>Your cart is empty</h3>' +
        '<p>Browse the menu and add your favorites.</p>' +
        '<a class="btn btn--primary" href="menu.html">Browse the menu</a>' +
        '</div>';
      return;
    }
    const html = items.map((it) => {
      const variant = it.variant ? '<p class="cart-item__variant">' + escapeHtml(it.variant) + '</p>' : '';
      return '<div class="cart-item" data-cart-item data-id="' + escapeAttr(it.id) + '" data-variant="' + escapeAttr(it.variant || "") + '">' +
        '<div class="cart-item__media" style="' + (it.image ? 'background-image:url(' + escapeAttr(it.image) + ');' : '') + '" aria-hidden="true"></div>' +
        '<div>' +
          '<h3 class="cart-item__name">' + escapeHtml(it.name) + '</h3>' +
          variant +
          '<p class="cart-item__price">' + fmt(it.price) + '</p>' +
          '<div class="cart-item__qty">' +
            '<button type="button" data-cart-dec aria-label="Decrease quantity of ' + escapeAttr(it.name) + '">&minus;</button>' +
            '<span aria-live="off">' + it.qty + '</span>' +
            '<button type="button" data-cart-inc aria-label="Increase quantity of ' + escapeAttr(it.name) + '">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-item__actions">' +
          '<strong>' + fmt(it.price * it.qty) + '</strong>' +
          '<button type="button" class="cart-item__remove" data-cart-remove>Remove</button>' +
        '</div>' +
      '</div>';
    }).join("");
    rootEl.innerHTML = html;
  }

  /* ----- Cart events (delegated) ----- */
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const row = t.closest("[data-cart-item]");
    if (!row) return;
    const id = row.getAttribute("data-id");
    const variant = row.getAttribute("data-variant") || "";
    const items = read();
    const it = items.find((i) => i.id === id && (i.variant || "") === variant);
    if (!it) return;
    if (t.hasAttribute("data-cart-inc")) updateQty(id, variant, it.qty + 1);
    else if (t.hasAttribute("data-cart-dec")) updateQty(id, variant, it.qty - 1);
    else if (t.hasAttribute("data-cart-remove")) removeItem(id, variant);
    else return;
    rerenderAll();
  });

  function rerenderAll() {
    const listRoot = document.querySelector("[data-cart-list]");
    if (listRoot) renderCartList(listRoot);
    const sumRoot = document.querySelector("[data-cart-summary]");
    if (sumRoot) renderSummary(sumRoot);
    if (window.refreshCheckout) window.refreshCheckout();
  }

  /* ----- Which fulfilment is selected right now? ----- */
  function currentFulfilment() {
    const checked = document.querySelector('input[name="fulfilment"]:checked');
    return checked ? checked.value : "delivery";
  }

  /* ----- Summary renderer (cart.html + checkout.html) ----- */
  function renderSummary(rootEl) {
    if (!rootEl) return;
    const mode = rootEl.getAttribute("data-summary-mode") || "cart";
    const t = getTotals(currentFulfilment());
    const isCheckout = mode === "checkout";

    const itemsList = t.items.map((it) =>
      '<li><span>' + escapeHtml(it.name) + (it.variant ? ' <small>(' + escapeHtml(it.variant) + ')</small>' : '') + ' × ' + it.qty + '</span><strong>' + fmt(it.price * it.qty) + '</strong></li>'
    ).join("");

    // Delivery messaging: state the promise honestly, including how much
    // more is needed to earn free delivery.
    let hint = "";
    if (t.items.length === 0) {
      hint = "";
    } else if (!t.isDelivery) {
      hint = '<p class="cart-summary__delivery-hint is-free"><strong>Pickup</strong> — no delivery fee.</p>';
    } else if (t.freeDelivery) {
      hint = '<p class="cart-summary__delivery-hint is-free"><strong>Free delivery</strong> applied on this order.</p>';
    } else {
      hint = '<p class="cart-summary__delivery-hint">Add <strong>' + fmt(t.remainingForFree) + '</strong> more for free delivery within Top City-1.</p>';
    }

    // The checkout page previously rendered a "Proceed to checkout" link
    // pointing at itself, which meant the order could never be submitted.
    // On checkout we now emit a real submit button.
    const cta = isCheckout
      ? '<button type="submit" class="btn btn--primary btn--block btn--lg" data-place-order>Place order</button>'
      : '<a class="btn btn--primary btn--block btn--lg" href="checkout.html"' + (t.items.length ? '' : ' aria-disabled="true"') + '>Proceed to checkout</a>';

    rootEl.innerHTML =
      (rootEl.hasAttribute("data-show-items") ? '<ul class="cart-summary__items">' + itemsList + '</ul>' : '') +
      '<div class="cart-summary__row"><span>Subtotal</span><strong>' + fmt(t.subtotal) + '</strong></div>' +
      '<div class="cart-summary__row"><span>Delivery</span><strong>' + (t.delivery === 0 ? "Free" : fmt(t.delivery)) + '</strong></div>' +
      hint +
      '<div class="cart-summary__total"><span>Total</span><strong>' + fmt(t.total) + '</strong></div>' +
      cta +
      (isCheckout ? "" : '<p class="cart-summary__note">Free delivery on orders over ' + fmt(t.threshold) + ' within Top City-1.</p>');
  }

  /* ----- Escape helpers ----- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ----- Boot ----- */
  function boot() {
    refreshBadge();
    rerenderAll();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  // Keep totals live when the delivery/pickup choice changes.
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.name === "fulfilment") {
      const sumRoot = document.querySelector("[data-cart-summary]");
      if (sumRoot) renderSummary(sumRoot);
    }
  });

  /* ----- Public exports ----- */
  window.M61Cart = {
    STORAGE_KEY, DELIVERY_FEE, FREE_DELIVERY_THRESHOLD,
    getItems, getCount, getSubtotal, getTotals,
    addItem, updateQty, removeItem, clearCart, refreshBadge,
    renderCartList, renderSummary, rerenderAll, showToast
  };
})();
