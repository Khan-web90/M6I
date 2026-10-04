/* ============================================================
   M61 Restaurant — Main JS
   - Theme (manual toggle, persisted; defaults to light)
   - Topbar scrolled state
   - Mobile drawer (focus trap + dialog semantics)
   - Active nav highlighting
   - Scroll-based parallax (transform-only, GPU-friendly)
   - Reduced motion & performance-aware
   - Foodpanda-style menu nav (search + tab counts + Popular)
   ============================================================ */
(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============================================================
     Theme
     ------------------------------------------------------------
     Manual toggle only — deliberately does NOT follow
     prefers-color-scheme. Defaults to light on first visit.
     The <head> inline snippet sets data-theme before first paint
     to avoid a flash; this module wires the controls and syncs
     the browser chrome colour.
     ============================================================ */
  const THEME_KEY = "m61:theme";
  const THEME_COLORS = { light: "#7A0F1B", dark: "#120F0E" };

  const getStoredTheme = () => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (_) { return null; }
  };

  function applyTheme(theme) {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[t]);
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(t === "dark"));
      btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
      const label = btn.querySelector("[data-theme-label]");
      if (label) label.textContent = t === "dark" ? "Light mode" : "Dark mode";
    });
    return t;
  }

  function setTheme(theme) {
    const t = applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, t); } catch (_) {}
    return t;
  }

  const initTheme = () => {
    applyTheme(getStoredTheme() || "light");
    document.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("[data-theme-toggle]") : null;
      if (!btn) return;
      const next = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
      setTheme(next);
      btn.classList.add("is-spinning");
      setTimeout(() => btn.classList.remove("is-spinning"), 320);
    });
  };

  /* ----- Footer year ----- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ----- Active nav highlighting (per data-page on body) ----- */
  const page = document.body.getAttribute("data-page");
  if (page) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.getAttribute("data-nav") === page) a.classList.add("is-active");
    });
  }

  /* ----- Topbar scrolled state ----- */
  const topbar = document.querySelector(".topbar");
  const onScroll = () => {
    if (!topbar) return;
    topbar.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ----- Mobile drawer: focus trap + dialog semantics ----- */
  const menuBtn = document.querySelector("[data-menu-toggle]");
  const drawer = document.getElementById("drawer");
  const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
  let lastFocused = null;

  if (menuBtn && drawer) {
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Site menu");
    menuBtn.setAttribute("aria-controls", "drawer");

    // Inject a close control so the overlay is escapable by mouse/touch,
    // not only by keyboard.
    if (!drawer.querySelector(".drawer__close")) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "drawer__close";
      close.setAttribute("aria-label", "Close menu");
      close.innerHTML = "&times;";
      drawer.insertBefore(close, drawer.firstChild);
    }

    const focusables = () => Array.from(drawer.querySelectorAll(FOCUSABLE));

    const setOpen = (open) => {
      menuBtn.setAttribute("aria-expanded", String(open));
      if (open) {
        lastFocused = document.activeElement;
        drawer.hidden = false;
        document.body.style.overflow = "hidden";
        const first = focusables()[0];
        if (first) first.focus();
      } else {
        drawer.hidden = true;
        document.body.style.overflow = "";
        if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
        lastFocused = null;
      }
    };

    menuBtn.addEventListener("click", () => {
      setOpen(menuBtn.getAttribute("aria-expanded") !== "true");
    });
    drawer.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest(".drawer__close")) { setOpen(false); return; }
      if (e.target instanceof HTMLAnchorElement) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (menuBtn.getAttribute("aria-expanded") !== "true") return;
      if (e.key === "Escape") { setOpen(false); return; }
      // Keep Tab inside the open overlay.
      if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    // Leaving the mobile breakpoint while open should not leave the page locked.
    window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => {
      if (e.matches) setOpen(false);
    });
  }

  /* ----- Smooth in-page anchors ----- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
      // Move keyboard focus with the viewport.
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  });

  /* ============================================================
     Foodpanda-style menu nav
     - Inject item counts into each tab
     - Build the Popular section by cloning popular cards
     - Filter cards as the user types in the search box
     ============================================================ */
  const initMenuNav = () => {
    const tabsContainer = document.querySelector(".menu-tabs");
    if (!tabsContainer) return;
    const tabs = Array.from(tabsContainer.querySelectorAll("a[href^='#']"));
    if (!tabs.length) return;

    const sectionsById = {};
    tabs.forEach((tab) => {
      const id = tab.getAttribute("href").slice(1);
      if (id === "popular") return;
      const section = document.getElementById(id);
      if (!section) return;
      const cards = Array.from(section.querySelectorAll(".menu-card"));
      const count = tab.querySelector("[data-tab-count]");
      if (count) count.textContent = " (" + cards.length + ")";
      sectionsById[id] = { tab, section, cards, total: cards.length };
    });

    const popularSection = document.getElementById("popular");
    const popularList = popularSection ? popularSection.querySelector("[data-popular-list]") : null;
    const popularTabCount = document.querySelector('.menu-tabs a[href="#popular"] [data-tab-count]');
    if (popularSection && popularList) {
      const popularCards = Array.from(document.querySelectorAll(".menu-card[data-popular='true']"));
      popularCards.forEach((card) => {
        const clone = card.cloneNode(true);
        clone.removeAttribute("data-popular");
        clone.dataset.popularClone = "true";
        popularList.appendChild(clone);
      });
      if (popularTabCount) popularTabCount.textContent = " (" + popularCards.length + ")";
      if (popularCards.length === 0) popularSection.hidden = true;
    }

    const searchInput = document.getElementById("menu-search");
    const searchWrap = document.querySelector(".menu-nav__search");
    const clearBtn = searchWrap ? searchWrap.querySelector(".menu-nav__search-clear") : null;
    const noResults = document.querySelector(".menu-no-results");
    const noResultsTerm = noResults ? noResults.querySelector("[data-search-term]") : null;
    if (!searchInput) return;

    let timer = null;
    const applySearch = () => {
      const q = searchInput.value.trim().toLowerCase();
      if (searchWrap) searchWrap.classList.toggle("is-filled", q.length > 0);
      if (clearBtn) clearBtn.hidden = q.length === 0;

      let totalVisible = 0;
      Object.values(sectionsById).forEach(({ section, cards }) => {
        let visible = 0;
        cards.forEach((card) => {
          const text = (card.textContent || "").toLowerCase();
          const match = !q || text.indexOf(q) !== -1;
          card.classList.toggle("is-hidden", !match);
          if (match) visible++;
        });
        section.style.display = (!q || visible > 0) ? "" : "none";
        totalVisible += visible;
      });

      if (noResults) {
        if (q && totalVisible === 0) {
          if (noResultsTerm) noResultsTerm.textContent = "\u201C" + q + "\u201D";
          noResults.classList.add("is-shown");
        } else {
          noResults.classList.remove("is-shown");
        }
      }
      if (searchInput.setAttribute) searchInput.setAttribute("aria-expanded", "false");
    };

    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(applySearch, 80);
    });
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        applySearch();
        searchInput.focus();
      });
    }
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && searchInput.value) {
        searchInput.value = "";
        applySearch();
      }
    });
  };

  /* ----- Scrollspy: highlight active menu tab as user scrolls ----- */
  const initScrollspy = () => {
    const tabsContainer = document.querySelector(".menu-tabs");
    if (!tabsContainer) return;
    const tabs = Array.from(tabsContainer.querySelectorAll("a[href^='#']"));
    if (!tabs.length) return;
    const ids = tabs.map((t) => t.getAttribute("href").slice(1));
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;

    const setActive = (id) => {
      tabs.forEach((t) => {
        const on = t.getAttribute("href") === "#" + id;
        t.classList.toggle("is-active", on);
        if (on) t.setAttribute("aria-current", "true");
        else t.removeAttribute("aria-current");
      });
    };

    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (best) setActive(best.target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((s) => observer.observe(s));
  };

  initTheme();
  initMenuNav();
  initScrollspy();

  /* ----- Hero video: report load state, don't trap reduced-motion users ----- */
  const heroVideo = document.querySelector(".hero__video");
  if (heroVideo) {
    const hero = heroVideo.closest(".hero");
    if (hero) hero.setAttribute("aria-busy", "true");
    const markReady = () => {
      if (hero) hero.setAttribute("aria-busy", "false");
      heroVideo.classList.add("is-ready");
    };
    if (heroVideo.readyState >= 3) markReady();
    else heroVideo.addEventListener("canplay", markReady, { once: true });
    heroVideo.addEventListener("error", markReady, { once: true });

    if (!prefersReducedMotion) {
      const tryPlay = () => {
        const p = heroVideo.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      };
      tryPlay();
      document.addEventListener("touchstart", tryPlay, { once: true, passive: true });
      document.addEventListener("click", tryPlay, { once: true });
    } else {
      heroVideo.removeAttribute("autoplay");
      heroVideo.pause();
    }
  }

  /* ----- Parallax (only on the home page hero) ----- */
  if (prefersReducedMotion) return;

  const layers = Array.from(document.querySelectorAll("[data-parallax-layer]"));
  if (!layers.length) return;

  const items = layers.map((el) => ({
    el,
    k: parseFloat(el.getAttribute("data-parallax-layer")) || 0.1
  }));

  let scrollY = window.scrollY;
  let ticking = false;

  const update = () => {
    ticking = false;
    for (let i = 0; i < items.length; i++) {
      const { el, k } = items[i];
      const y = Math.round(scrollY * k);
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    }
  };

  const onScrollParallax = () => {
    scrollY = window.scrollY;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", onScrollParallax, { passive: true });
  window.addEventListener("resize", onScrollParallax, { passive: true });
  update();
})();
