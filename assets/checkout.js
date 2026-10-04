/* ============================================================
   M61 Restaurant — Checkout
   - Inline field validation (replaces the previous alert() dialogs)
   - Submitting state + double-submit guard
   - Totals read from M61Cart.getTotals() so the figure shown here
     always matches the confirmation page
   ============================================================ */
(function () {
  "use strict";

  const form = document.getElementById("checkout-form");
  if (!form) return;

  const nameEl = document.getElementById("co-name");
  const phoneEl = document.getElementById("co-phone");
  const addressEl = document.getElementById("co-address");
  const addressField = document.getElementById("delivery-address");
  const statusEl = document.querySelector("[data-checkout-status]");
  const notice = document.getElementById("payment-notice");

  const NOTICES = {
    jazzcash: 'Send the order total to <strong>0308 555 6161</strong> via JazzCash and share the transaction ID on WhatsApp after placing the order.',
    easypaisa: 'Send the order total to <strong>0308 555 6161</strong> via EasyPaisa and share the transaction ID on WhatsApp after placing the order.',
    bank: 'Account details will be shown on the order confirmation page. Please transfer the total and share the receipt on WhatsApp (<a href="tel:+923085556161">0308 555 6161</a>).'
  };

  const current = (name) => {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  };

  /* ----- Field errors ----- */
  function setError(el, errorId, message) {
    const field = el.closest(".field");
    const err = document.getElementById(errorId);
    if (!field) return;
    if (message) {
      field.classList.add("is-invalid");
      el.setAttribute("aria-invalid", "true");
      if (err) err.textContent = message;
    } else {
      field.classList.remove("is-invalid");
      el.removeAttribute("aria-invalid");
      if (err) err.textContent = "";
    }
  }

  function clearAll() {
    setError(nameEl, "err-co-name", "");
    setError(phoneEl, "err-co-phone", "");
    setError(addressEl, "err-co-address", "");
  }

  /* Accepts 0300… / +92300… / 92300… and spaces or dashes. */
  function phoneError(value) {
    const digits = value.replace(/[^\d+]/g, "");
    if (!digits) return "Please enter your phone number.";
    const local = digits.replace(/^\+?92/, "").replace(/^0/, "");
    if (local.length < 10 || local.length > 11) {
      return "Enter a valid 11-digit number, e.g. 0300 0000000.";
    }
    if (!/^3\d{9}$/.test(local)) {
      return "Pakistani mobile numbers start with 03.";
    }
    return "";
  }

  function validate() {
    clearAll();
    const errors = [];
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    const fulfilment = current("fulfilment");
    const address = addressEl.value.trim();

    if (!name) {
      errors.push([nameEl, "err-co-name", "Please enter your name."]);
    } else if (name.length < 2) {
      errors.push([nameEl, "err-co-name", "Please enter your full name."]);
    }

    const perr = phoneError(phone);
    if (perr) errors.push([phoneEl, "err-co-phone", perr]);

    if (fulfilment === "delivery" && !address) {
      errors.push([addressEl, "err-co-address", "Please add a delivery address, or switch to pickup."]);
    }

    errors.forEach(([el, id, msg]) => setError(el, id, msg));
    return errors;
  }

  // Clear a field's error as soon as the guest starts fixing it.
  [nameEl, phoneEl, addressEl].forEach((el) => {
    el.addEventListener("input", () => {
      if (el.closest(".field").classList.contains("is-invalid")) {
        const err = el.getAttribute("aria-describedby");
        setError(el, err, "");
      }
    });
  });

  /* ----- Payment notice ----- */
  document.querySelectorAll('input[name="payment"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (!notice) return;
      if (NOTICES[r.value]) {
        notice.innerHTML = NOTICES[r.value];
        notice.hidden = false;
      } else {
        notice.hidden = true;
      }
    });
  });

  /* ----- Delivery vs pickup ----- */
  document.querySelectorAll('input[name="fulfilment"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (!addressField) return;
      const isDelivery = r.checked && r.value === "delivery";
      addressField.hidden = !isDelivery;
      if (!isDelivery) setError(addressEl, "err-co-address", "");
    });
  });
  // Initial state
  if (addressField) addressField.hidden = current("fulfilment") !== "delivery";

  /* ----- Keep the summary honest if the cart is emptied underneath us ----- */
  window.refreshCheckout = function () {
    if (window.M61Cart) window.M61Cart.rerenderAll();
  };

  /* ----- Submit ----- */
  let isSubmitting = false;

  function setSubmitting(on) {
    isSubmitting = on;
    const btn = form.querySelector("[data-place-order]");
    if (btn) {
      btn.classList.toggle("is-loading", on);
      btn.disabled = on;
      btn.setAttribute("aria-busy", String(on));
      if (!on) btn.textContent = "Place order";
    }
    form.setAttribute("aria-busy", String(on));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (isSubmitting) return; // double-submit guard

    const items = (window.M61Cart && window.M61Cart.getItems()) || [];
    if (!items.length) {
      if (statusEl) statusEl.textContent = "Your cart is empty. Redirecting you to the menu.";
      window.location.href = "menu.html";
      return;
    }

    const errors = validate();
    if (errors.length) {
      if (statusEl) {
        statusEl.textContent = errors.length === 1
          ? "There is 1 problem with your order."
          : "There are " + errors.length + " problems with your order.";
      }
      const [el] = errors[0];
      el.focus();
      return;
    }

    const fulfilment = current("fulfilment");
    const payment = current("payment");
    // Read the authoritative totals, not a local recomputation.
    const totals = window.M61Cart.getTotals(fulfilment);

    const order = {
      id: "M61-" + Date.now().toString(36).toUpperCase(),
      createdAt: new Date().toISOString(),
      name: nameEl.value.trim(),
      phone: phoneEl.value.trim(),
      address: fulfilment === "delivery" ? addressEl.value.trim() : "Pickup from M61",
      notes: document.getElementById("co-notes").value.trim(),
      fulfilment,
      payment,
      items,
      totals: {
        subtotal: totals.subtotal,
        delivery: totals.delivery,
        total: totals.total,
        freeDelivery: totals.freeDelivery
      }
    };

    setSubmitting(true);
    if (statusEl) statusEl.textContent = "Placing your order…";

    // Brief handoff delay so the submitting state is perceptible rather
    // than a flicker between click and navigation.
    window.setTimeout(() => {
      try { localStorage.setItem("m61:order", JSON.stringify(order)); } catch (_) {}
      window.M61Cart.clearCart();
      window.location.href = "order-confirmed.html";
    }, 650);
  });

  /* Send customers to the menu if they land here with an empty cart. */
  if ((window.M61Cart && !window.M61Cart.getCount()) && !document.referrer.match(/cart\.html/)) {
    // Left in place deliberately: checkout.html stays reachable by direct link
    // for support purposes, but the Place order button is disabled instead.
  }
})();
