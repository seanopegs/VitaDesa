(() => {
  "use strict";

  const STORAGE_KEY = "vitadesaDemoState";
  const defaultState = {
    touchpoint: "mobile",
    mobileScreen: "splash",
    kioskScreen: "welcome",
    adminScreen: "overview",
    points: 340,
    vitaminC: 78,
    vitaminD: 62,
    iron: 55,
    voucherClaimed: false,
    historyMode: "week",
    onboardingSlide: 0,
    stockAlerts: 2,
    activeOrders: 3,
    audioEnabled: false,
    kioskLargeText: false,
    kioskContrast: false
  };

  const onboardingSlides = [
    {
      label: "01 • AKSES DEKAT",
      title: "Vitamin terukur, lebih dekat dari rumah.",
      copy: "Ambil paket yang sudah dikonfigurasi petugas melalui stasiun VitaDesa di Balai Desa atau Posyandu."
    },
    {
      label: "02 • PANTAU RINGAN",
      title: "Lihat progress, bangun kebiasaan sehat.",
      copy: "Tracker sederhana membantu keluarga memahami jadwal dan konsistensi pengambilan tanpa klaim diagnosis."
    },
    {
      label: "03 • TUMBUH BERSAMA",
      title: "Sehatnya warga menguatkan UMKM lokal.",
      copy: "Poin dari aktivitas dapat ditukar dengan voucher produk herbal lokal yang telah dikurasi."
    }
  ];

  const historySeries = {
    week: { labels: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"], values: [62, 76, 68, 88, 82, 94, 86], score: "86%" },
    month: { labels: ["M1", "M2", "M3", "M4"], values: [65, 72, 80, 88], score: "88%" }
  };

  let state = loadState();
  let toastTimer = null;
  let dispenseTimer = null;
  let kioskAwardPending = false;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...defaultState, ...saved, touchpoint: "mobile" };
    } catch {
      return { ...defaultState };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Prototype remains usable if storage is unavailable.
    }
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function showTouchpoint(name) {
    state.touchpoint = name;
    $all(".touchpoint-tab").forEach((button) => {
      const active = button.dataset.touchpoint === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $all(".touchpoint-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === name);
    });
    saveState();
    window.requestAnimationFrame(() => {
      if (name === "admin") {
        drawAdminChart();
        if (state.adminScreen === "heatmap") focusMapInsight();
      }
      if (name === "mobile" && state.mobileScreen === "history") drawHistoryChart();
    });
  }

  function showMobile(screen) {
    state.mobileScreen = screen;
    $all("[data-mobile-screen]").forEach((view) => view.classList.toggle("is-active", view.dataset.mobileScreen === screen));
    const select = document.getElementById("mobile-screen-select");
    if (select) select.value = screen;
    $all(".mobile-nav button[data-mobile-go]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mobileGo === screen && screen !== "scan");
    });
    saveState();
    if (screen === "history") window.requestAnimationFrame(drawHistoryChart);
    if (screen === "home") updateStateUI();
  }

  function showKiosk(screen, announce = true) {
    state.kioskScreen = screen;
    $all("[data-kiosk-screen]").forEach((view) => view.classList.toggle("is-active", view.dataset.kioskScreen === screen));
    const select = document.getElementById("kiosk-screen-select");
    if (select) select.value = screen;
    saveState();
    if (announce && state.audioEnabled) {
      const view = document.querySelector(`[data-kiosk-screen="${screen}"]`);
      const heading = view?.querySelector("h2")?.textContent || "";
      const copy = view?.querySelector("p")?.textContent || "";
      speak(`${heading}. ${copy}`);
    }
    if (screen === "dispense") startDispensing();
  }

  function showAdmin(screen) {
    state.adminScreen = screen;
    const titles = {
      overview: "Ringkasan Layanan",
      inventory: "Inventaris & Rantai Pasok",
      orders: "Pesanan UMKM",
      heatmap: "Civic Health Map"
    };
    $all("[data-admin-screen]").forEach((view) => view.classList.toggle("is-active", view.dataset.adminScreen === screen));
    $all("[data-admin-go]").forEach((button) => button.classList.toggle("active", button.dataset.adminGo === screen));
    document.getElementById("admin-page-title").textContent = titles[screen];
    saveState();
    if (screen === "overview") window.requestAnimationFrame(drawAdminChart);
    if (screen === "heatmap") window.requestAnimationFrame(focusMapInsight);
  }

  function updateStateUI() {
    $all("[data-points-value]").forEach((node) => { node.textContent = String(state.points); });
    const c = document.getElementById("vitamin-c-value");
    const d = document.getElementById("vitamin-d-value");
    const fe = document.getElementById("iron-value");
    if (c) c.textContent = state.vitaminC;
    if (d) d.textContent = state.vitaminD;
    if (fe) fe.textContent = state.iron;
    document.querySelector(".nutrient-c .progress-ring")?.style.setProperty("--progress", state.vitaminC);
    document.querySelector(".nutrient-d .progress-ring")?.style.setProperty("--progress", state.vitaminD);
    document.querySelector(".nutrient-fe .progress-ring")?.style.setProperty("--progress", state.iron);
    const alertCount = document.getElementById("alert-count");
    const activeOrders = document.getElementById("active-orders");
    if (alertCount) alertCount.textContent = state.stockAlerts;
    if (activeOrders) activeOrders.textContent = state.activeOrders;

    document.body.classList.toggle("kiosk-large-text", state.kioskLargeText);
    document.body.classList.toggle("kiosk-high-contrast", state.kioskContrast);
    document.getElementById("kiosk-text-size")?.classList.toggle("active", state.kioskLargeText);
    document.getElementById("kiosk-contrast")?.classList.toggle("active", state.kioskContrast);
    document.getElementById("kiosk-audio")?.classList.toggle("active", state.audioEnabled);
  }

  function updateOnboarding() {
    const slide = onboardingSlides[state.onboardingSlide];
    const view = document.querySelector('[data-mobile-screen="onboarding"]');
    view.querySelector(".mini-label").textContent = slide.label;
    view.querySelector("h2").textContent = slide.title;
    view.querySelector(".onboarding-copy p").textContent = slide.copy;
    const dots = $all(".pagination-dots i", view);
    dots.forEach((dot, index) => dot.classList.toggle("active", index === state.onboardingSlide));
    view.querySelector(".pagination-dots").setAttribute("aria-label", `Slide ${state.onboardingSlide + 1} dari 3`);
    document.getElementById("onboarding-next").textContent = state.onboardingSlide === 2 ? "Mulai VitaDesa" : "Lanjut";
  }

  function showToast(message, symbol = "✓") {
    const toast = document.getElementById("toast");
    toast.querySelector("span").textContent = symbol;
    toast.querySelector("p").textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function showModal({ title, copy, icon = "✓", code = "", action = "Selesai", onAction = null }) {
    const backdrop = document.getElementById("modal-backdrop");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-copy").textContent = copy;
    document.getElementById("modal-icon").textContent = icon;
    const codeNode = document.getElementById("voucher-code");
    codeNode.textContent = code;
    codeNode.hidden = !code;
    const actionButton = document.getElementById("modal-action");
    actionButton.textContent = action;
    actionButton.onclick = () => {
      closeModal();
      if (typeof onAction === "function") onAction();
    };
    backdrop.hidden = false;
    actionButton.focus();
  }

  function closeModal() {
    document.getElementById("modal-backdrop").hidden = true;
  }

  function speak(text) {
    if (!state.audioEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function drawHistoryChart() {
    const canvas = document.getElementById("history-chart");
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const series = historySeries[state.historyMode];
    const pad = { left: 28, right: 12, top: 18, bottom: 28 };
    const graphWidth = width - pad.left - pad.right;
    const graphHeight = height - pad.top - pad.bottom;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#e4e9e4";
    ctx.lineWidth = 1;
    ctx.font = "8px Segoe UI";
    ctx.fillStyle = "#8b948f";
    ctx.textAlign = "right";
    [0, 50, 100].forEach((tick) => {
      const y = pad.top + graphHeight - (tick / 100) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillText(`${tick}`, pad.left - 7, y + 3);
    });
    const points = series.values.map((value, index) => ({
      x: pad.left + (series.values.length === 1 ? graphWidth / 2 : index * graphWidth / (series.values.length - 1)),
      y: pad.top + graphHeight - (value / 100) * graphHeight
    }));
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + graphHeight);
    gradient.addColorStop(0, "rgba(29,115,90,.28)");
    gradient.addColorStop(1, "rgba(29,115,90,0)");
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + graphHeight);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + graphHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = "#1d735a";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#1d735a";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.textAlign = "center";
    ctx.fillStyle = "#78827d";
    series.labels.forEach((label, index) => ctx.fillText(label, points[index].x, height - 8));
    document.getElementById("consistency-value").textContent = series.score;
  }

  function drawAdminChart() {
    const canvas = document.getElementById("admin-chart");
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const values = [122, 148, 139, 172, 158, 194, 184];
    const labels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    const pad = { left: 32, right: 16, top: 18, bottom: 27 };
    const graphWidth = width - pad.left - pad.right;
    const graphHeight = height - pad.top - pad.bottom;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "8px Segoe UI";
    ctx.strokeStyle = "#e7ebe7";
    ctx.fillStyle = "#89928d";
    ctx.textAlign = "right";
    [0, 50, 100, 150, 200].forEach((tick) => {
      const y = pad.top + graphHeight - tick / 200 * graphHeight;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillText(String(tick), pad.left - 7, y + 3);
    });
    const points = values.map((value, index) => ({
      x: pad.left + index * graphWidth / (values.length - 1),
      y: pad.top + graphHeight - value / 200 * graphHeight
    }));
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + graphHeight);
    gradient.addColorStop(0, "rgba(23,95,74,.25)");
    gradient.addColorStop(1, "rgba(23,95,74,0)");
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + graphHeight);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + graphHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = "#175f4a";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.textAlign = "center";
    points.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === points.length - 1 ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = index === points.length - 1 ? "#e9a63a" : "#175f4a";
      ctx.fill();
      ctx.fillStyle = "#7f8984";
      ctx.fillText(labels[index], point.x, height - 8);
    });
  }

  function focusMapInsight() {
    const zones = $all(".map-zone");
    zones.forEach((zone) => {
      zone.onclick = () => {
        const name = zone.querySelector("span").textContent;
        const score = zone.querySelector("b").textContent;
        document.querySelector(".insight-score span").textContent = name;
        document.querySelector(".insight-score strong").textContent = score;
        document.querySelector(".insight-score small").textContent = Number(score.replace("%", "")) < 60 ? "Perlu dukungan terarah" : "Perkembangan positif";
        showToast(`Insight ${name} ditampilkan`);
      };
    });
  }

  function startDispensing() {
    window.clearInterval(dispenseTimer);
    let progress = 0;
    const bar = document.getElementById("dispense-bar");
    const label = document.getElementById("dispense-percent");
    bar.style.width = "0%";
    label.textContent = "0%";
    kioskAwardPending = true;
    dispenseTimer = window.setInterval(() => {
      progress += 4;
      bar.style.width = `${progress}%`;
      label.textContent = `${progress}%`;
      if (progress >= 100) {
        window.clearInterval(dispenseTimer);
        window.setTimeout(() => {
          if (kioskAwardPending) {
            state.points += 20;
            state.vitaminC = Math.min(100, state.vitaminC + 17);
            state.vitaminD = Math.min(100, state.vitaminD + 8);
            state.iron = Math.min(100, state.iron + 7);
            kioskAwardPending = false;
            saveState();
            updateStateUI();
          }
          showKiosk("complete");
        }, 450);
      }
    }, 115);
  }

  function resetDemo() {
    window.clearInterval(dispenseTimer);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    state = { ...defaultState };
    updateStateUI();
    updateOnboarding();
    showTouchpoint("mobile");
    showMobile("splash");
    showKiosk("welcome", false);
    showAdmin("overview");
    $all(".reorder-button").forEach((button) => {
      button.disabled = false;
      button.classList.remove("done");
      button.textContent = "Pesan ulang";
    });
    showToast("Demo dikembalikan ke kondisi awal", "↺");
  }

  $all(".touchpoint-tab").forEach((button) => {
    button.addEventListener("click", () => showTouchpoint(button.dataset.touchpoint));
  });
  $all("[data-mobile-go]").forEach((button) => {
    button.addEventListener("click", () => showMobile(button.dataset.mobileGo));
  });
  $all("[data-kiosk-go]").forEach((button) => {
    button.addEventListener("click", () => showKiosk(button.dataset.kioskGo));
  });
  $all("[data-admin-go]").forEach((button) => {
    button.addEventListener("click", () => showAdmin(button.dataset.adminGo));
  });

  document.getElementById("mobile-screen-select").addEventListener("change", (event) => showMobile(event.target.value));
  document.getElementById("kiosk-screen-select").addEventListener("change", (event) => showKiosk(event.target.value));
  document.getElementById("reset-demo").addEventListener("click", resetDemo);

  document.getElementById("onboarding-next").addEventListener("click", () => {
    if (state.onboardingSlide < 2) {
      state.onboardingSlide += 1;
      updateOnboarding();
      saveState();
    } else {
      showMobile("auth");
    }
  });

  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    showMobile("home");
    showToast("Selamat datang kembali, Rani!");
  });

  document.getElementById("simulate-mobile-scan").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Membaca QR…";
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Simulasikan scan";
      showMobile("pickup");
      showToast("Kiosk Posyandu Melati terhubung");
    }, 900);
  });

  document.getElementById("claim-voucher").addEventListener("click", () => {
    if (state.voucherClaimed) {
      showModal({
        title: "Voucher sudah tersimpan",
        copy: "Gunakan kode berikut pada UMKM Sari Bumi sebelum masa berlaku berakhir.",
        icon: "◇",
        code: "VITA-SB-0726"
      });
      return;
    }
    if (state.points < 120) {
      showModal({ title: "Poin belum cukup", copy: "Kumpulkan poin dari aktivitas pengambilan di kiosk.", icon: "!" });
      return;
    }
    state.points -= 120;
    state.voucherClaimed = true;
    saveState();
    updateStateUI();
    showModal({
      title: "Voucher berhasil diklaim",
      copy: "Tunjukkan kode ini kepada UMKM Sari Bumi. Data dan kode pada prototype bersifat simulasi.",
      code: "VITA-SB-0726",
      onAction: () => showMobile("vouchers")
    });
  });

  $all("[data-history-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.historyMode = button.dataset.historyMode;
      $all("[data-history-mode]").forEach((item) => item.classList.toggle("active", item === button));
      saveState();
      drawHistoryChart();
    });
  });

  document.getElementById("mark-read").addEventListener("click", () => {
    $all(".notification-list .unread").forEach((item) => item.classList.remove("unread"));
    $all(".notification-list article > i").forEach((dot) => dot.remove());
    showToast("Semua notifikasi ditandai sudah dibaca");
  });

  document.getElementById("simulate-kiosk-scan").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Membaca profil…";
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Simulasikan profil terbaca";
      showKiosk("consent");
    }, 950);
  });

  const consentCheckbox = document.getElementById("consent-checkbox");
  const consentNext = document.getElementById("consent-next");
  consentCheckbox.addEventListener("change", () => { consentNext.disabled = !consentCheckbox.checked; });
  consentNext.addEventListener("click", () => showKiosk("sensor"));

  document.getElementById("start-sensor").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Membaca…";
    document.getElementById("sensor-status-title").textContent = "Menjaga posisi jari";
    document.getElementById("sensor-status-copy").textContent = "Pembacaan indikator dasar sedang berlangsung. Jangan menggerakkan tangan.";
    if (state.audioEnabled) speak("Pembacaan dimulai. Mohon tetap diam dan jangan menggerakkan tangan.");
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Mulai pembacaan";
      document.getElementById("sensor-status-title").textContent = "Sensor siap digunakan";
      document.getElementById("sensor-status-copy").textContent = "Tekan tombol di bawah untuk memulai simulasi pembacaan.";
      showKiosk("result");
    }, 2200);
  });

  document.getElementById("kiosk-text-size").addEventListener("click", () => {
    state.kioskLargeText = !state.kioskLargeText;
    updateStateUI();
    saveState();
    showToast(state.kioskLargeText ? "Teks besar diaktifkan" : "Ukuran teks normal");
  });
  document.getElementById("kiosk-contrast").addEventListener("click", () => {
    state.kioskContrast = !state.kioskContrast;
    updateStateUI();
    saveState();
    showToast(state.kioskContrast ? "Kontras tinggi diaktifkan" : "Kontras standar");
  });
  document.getElementById("kiosk-audio").addEventListener("click", () => {
    state.audioEnabled = !state.audioEnabled;
    updateStateUI();
    saveState();
    showToast(state.audioEnabled ? "Panduan suara diaktifkan" : "Panduan suara dimatikan");
    if (state.audioEnabled) speak("Panduan suara VitaDesa diaktifkan.");
  });
  document.getElementById("print-summary").addEventListener("click", () => showToast("Ringkasan simulasi siap dicetak", "▤"));

  $all(".reorder-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const item = button.dataset.item;
      const location = button.dataset.location;
      button.disabled = true;
      button.classList.add("done");
      button.textContent = "Dipesan";
      state.stockAlerts = Math.max(0, state.stockAlerts - 1);
      state.activeOrders += 1;
      saveState();
      updateStateUI();
      const orderList = document.getElementById("order-list");
      const article = document.createElement("article");
      article.innerHTML = `<span class="order-icon">VD</span><div><strong>#ORD-DEMO • Pesanan otomatis</strong><p>${item} • ${location}</p></div><span class="status neutral">Menunggu</span><small>Konfirmasi mitra</small><button type="button" aria-label="Opsi pesanan">⋮</button>`;
      orderList.prepend(article);
      showModal({
        title: "Pesanan ulang dibuat",
        copy: `${item} untuk ${location} telah dikirim ke mitra UMKM sebagai pesanan simulasi.`,
        icon: "▤",
        action: "Lihat pesanan",
        onAction: () => showAdmin("orders")
      });
    });
  });

  document.getElementById("new-order").addEventListener("click", () => {
    showModal({ title: "Form pesanan baru", copy: "Pada versi produksi, admin dapat memilih mitra, produk, batch, jumlah, dan lokasi tujuan.", icon: "+", action: "Mengerti" });
  });
  document.getElementById("create-program").addEventListener("click", () => {
    showModal({ title: "Rencana dukungan dibuat", copy: "Draft layanan kiosk keliling untuk RW 04 telah disimpan sebagai simulasi.", icon: "✓", action: "Selesai" });
  });

  const demoButtonSelectors = [
    ".mobile-simplebar .text-button:not(#mark-read)",
    ".scanner > .text-button",
    ".category-row button",
    ".mobile-appbar .icon-button",
    "[data-mobile-screen=\"profile\"] .icon-button",
    ".family-list button",
    ".settings-list button",
    ".kiosk-help",
    ".admin-sidebar-bottom > button",
    ".admin-actions .icon-button",
    ".admin-filter button",
    ".attention-list button:not([data-admin-go])",
    ".inventory-toolbar button",
    "[data-admin-screen=\"inventory\"] .admin-card-head .btn",
    ".table-action:not(.reorder-button)",
    "#order-list article button"
  ];

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !demoButtonSelectors.some((selector) => button.matches(selector))) return;
    if (button.closest(".category-row")) {
      $all(".category-row button").forEach((item) => item.classList.toggle("active", item === button));
    }
    const label = button.getAttribute("aria-label") || button.textContent.trim().replace(/\s+/g, " ");
    showToast(`${label || "Aksi"} dibuka dalam mode demonstrasi`);
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-backdrop").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("modal-backdrop").hidden) closeModal();
  });
  window.addEventListener("resize", () => {
    if (state.mobileScreen === "history") drawHistoryChart();
    if (state.touchpoint === "admin" && state.adminScreen === "overview") drawAdminChart();
  });

  updateStateUI();
  updateOnboarding();
  showTouchpoint(state.touchpoint);
  showMobile(state.mobileScreen);
  showKiosk(state.kioskScreen, false);
  showAdmin(state.adminScreen);
  $all("[data-history-mode]").forEach((button) => button.classList.toggle("active", button.dataset.historyMode === state.historyMode));
})();
