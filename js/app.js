/* ==========================================================
   Habit Streak — app.js
   Pure vanilla JS, offline-first, localStorage persistence.
   AdMob calls are routed through window.AdManager, which uses
   @capacitor-community/admob when running inside Capacitor,
   and falls back to on-screen placeholders in a browser.
   ========================================================== */

const STORAGE_KEY = "habitstreak_state_v1";
const EMOJIS = ["💧","📚","🏃","🧘","🥗","😴","✍️","🎯","💪","🚭","🧹","🌱","🎨","🙏","💻","📵"];

const MOTIVATIONS = [
  "Every habit you check today builds tomorrow's streak.",
  "Small steps, repeated daily, become who you are.",
  "You don't have to be perfect — just consistent.",
  "One check-in at a time. You've got this.",
  "Discipline is choosing what you want most over what you want now.",
  "Your streak is proof you show up for yourself.",
  "Progress, not perfection.",
  "Missed a day? Today is a perfect day to start again."
];

const BADGE_DEFS = [
  { id: "b3",  days: 3,  icon: "🔥", name: "3 Days" },
  { id: "b7",  days: 7,  icon: "⭐", name: "1 Week" },
  { id: "b14", days: 14, icon: "🌟", name: "2 Weeks" },
  { id: "b30", days: 30, icon: "🏆", name: "1 Month" },
  { id: "b60", days: 60, icon: "💎", name: "60 Days" },
  { id: "b100",days: 100,icon: "👑", name: "100 Days" }
];

let state = loadState();

function defaultState() {
  return {
    onboarded: false,
    theme: "light",
    habits: [],          // {id, name, emoji, createdAt, log:{ "YYYY-MM-DD": true }}
    lastOpenDate: todayKey(),
    globalStreak: 0,
    notif: { enabled: false, time: "20:00" },
    bonusBadgeTheme: false,
    actionCount: 0        // used to throttle interstitial ads
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) {
    return defaultState();
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save state (storage unavailable):", e);
  }
}
function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/* ==========================================================
   AD MANAGER — non-intrusive banner / interstitial / rewarded
   ========================================================== */
const AdManager = {
  isNative: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
  interstitialEveryNActions: 6,   // show at most ~once per 6 check-ins
  lastInterstitialAt: 0,

  async initBanner() {
    if (this.isNative) {
      try {
        const { AdMob, BannerAdPosition, BannerAdSize } = await import("@capacitor-community/admob");
        await AdMob.showBanner({
          adId: "ca-app-pub-XXXXXXXXXXXXXXXX/BANNER_ID",
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0
        });
        document.getElementById("fixedBanner").classList.add("hidden");
        document.getElementById("inlineAd").classList.add("hidden");
      } catch (e) { console.warn("Banner init failed", e); }
    } else {
      // Web fallback: show the placeholder bar so layout/behavior can be tested
      document.getElementById("fixedBanner").classList.remove("hidden");
    }
  },

  async maybeShowInterstitial() {
    state.actionCount++;
    if (state.actionCount - this.lastInterstitialAt < this.interstitialEveryNActions) {
      saveState();
      return;
    }
    this.lastInterstitialAt = state.actionCount;
    saveState();
    if (this.isNative) {
      try {
        const { AdMob } = await import("@capacitor-community/admob");
        await AdMob.prepareInterstitial({ adId: "ca-app-pub-XXXXXXXXXXXXXXXX/INTERSTITIAL_ID" });
        await AdMob.showInterstitial();
      } catch (e) { console.warn("Interstitial failed", e); }
    } else {
      showToast("Ad shown (placeholder) — interstitials are non-intrusive & capped");
    }
  },

  async showRewarded(onReward) {
    if (this.isNative) {
      try {
        const { AdMob } = await import("@capacitor-community/admob");
        await AdMob.prepareRewardVideoAd({ adId: "ca-app-pub-XXXXXXXXXXXXXXXX/REWARDED_ID" });
        const result = await AdMob.showRewardVideoAd();
        if (result) onReward();
      } catch (e) { console.warn("Rewarded ad failed", e); }
    } else {
      showToast("Simulated rewarded ad watched ✔");
      setTimeout(onReward, 600);
    }
  }
};

/* ==========================================================
   NOTIFICATIONS
   ========================================================== */
const NotifManager = {
  async requestPermission() {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const perm = await LocalNotifications.requestPermissions();
        return perm.display === "granted";
      } catch (e) { return false; }
    }
    if ("Notification" in window) {
      const p = await Notification.requestPermission();
      return p === "granted";
    }
    return false;
  },
  async schedule(time) {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform())) return;
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const [h, m] = time.split(":").map(Number);
      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
      await LocalNotifications.schedule({
        notifications: [{
          id: 1,
          title: "Habit Streak",
          body: "Don't break the streak — check off today's habits!",
          schedule: { on: { hour: h, minute: m }, repeats: true }
        }]
      });
    } catch (e) { console.warn("Notif schedule failed", e); }
  }
};

/* ==========================================================
   RENDERING
   ========================================================== */
function habitDoneToday(h) { return !!h.log[todayKey()]; }

function computeHabitStreak(h) {
  let streak = 0;
  let d = new Date();
  if (!h.log[todayKey(d)]) d.setDate(d.getDate() - 1); // if today not done yet, count from yesterday
  while (h.log[todayKey(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function computeGlobalStreak() {
  if (state.habits.length === 0) return 0;
  let streak = 0;
  let d = new Date();
  const allDoneOn = (day) => state.habits.every(h => h.log[todayKey(day)]);
  let cursor = new Date();
  if (!allDoneOn(cursor)) cursor.setDate(cursor.getDate() - 1);
  while (allDoneOn(cursor)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderHome() {
  const list = document.getElementById("habitList");
  list.innerHTML = "";
  if (state.habits.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="big">🌱</div>No habits yet.<br>Tap + to add your first one.</div>`;
  } else {
    state.habits.forEach(h => {
      const done = habitDoneToday(h);
      const streak = computeHabitStreak(h);
      const card = document.createElement("div");
      card.className = "habit-card";
      card.innerHTML = `
        <div class="habit-emoji">${h.emoji}</div>
        <div class="habit-info">
          <div class="habit-name">${escapeHtml(h.name)}</div>
          <div class="habit-streak">${streak > 0 ? "🔥 " + streak + " day streak" : "No streak yet"}</div>
        </div>
        <button class="check-btn ${done ? "done" : ""}" data-id="${h.id}">${done ? "✓" : ""}</button>
      `;
      list.appendChild(card);
    });
  }

  const doneCount = state.habits.filter(habitDoneToday).length;
  document.getElementById("todayProgress").textContent = `${doneCount} of ${state.habits.length} done today`;
  state.globalStreak = computeGlobalStreak();
  document.getElementById("globalStreak").textContent = state.globalStreak;
  document.getElementById("motivateText").textContent = MOTIVATIONS[state.globalStreak % MOTIVATIONS.length];
  saveState();
}

function renderBadges() {
  const grid = document.getElementById("badgeGrid");
  grid.innerHTML = "";
  BADGE_DEFS.forEach(b => {
    const unlocked = state.globalStreak >= b.days;
    const el = document.createElement("div");
    el.className = "badge" + (unlocked ? " unlocked" : "");
    el.innerHTML = `<div class="bi">${b.icon}</div><div class="bn">${b.name}</div>`;
    grid.appendChild(el);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ==========================================================
   VIEW SWITCHING
   ========================================================== */
function switchView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById("view-" + name).classList.remove("hidden");
  document.querySelectorAll(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  const titles = { home: "Habit Streak", badges: "Achievements", settings: "Settings" };
  document.getElementById("pageTitle").textContent = titles[name] || "Habit Streak";
  if (name === "badges") renderBadges();
}

/* ==========================================================
   THEME
   ========================================================== */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  document.getElementById("themeToggleBtn").textContent = state.theme === "dark" ? "☀️" : "🌙";
  document.getElementById("darkModeSwitch").checked = state.theme === "dark";
}

/* ==========================================================
   INIT / EVENTS
   ========================================================== */
document.addEventListener("DOMContentLoaded", () => {
  // Onboarding is set up FIRST so Get Started always works even if
  // something later in setup throws (e.g. storage being unavailable).
  if (state.onboarded) {
    document.getElementById("onboarding").style.display = "none";
  } else {
    const slides = document.getElementById("obSlides");
    const dots = document.querySelectorAll("#obDots span");
    let obIndex = 0;
    slides.addEventListener("scroll", () => {
      const w = slides.clientWidth || 1;
      obIndex = Math.round(slides.scrollLeft / w);
      dots.forEach((d, i) => d.classList.toggle("active", i === obIndex));
    });
    document.getElementById("obNext").addEventListener("click", () => {
      const w = slides.clientWidth || 1;
      if (obIndex < 2) {
        obIndex++;
        slides.scrollTo({ left: obIndex * w, behavior: "smooth" });
      } else {
        state.onboarded = true;
        saveState();
        document.getElementById("onboarding").style.display = "none";
      }
    });
  }

  try {
    applyTheme();
    document.getElementById("notifSwitch").checked = state.notif.enabled;
    document.getElementById("notifTime").value = state.notif.time;
    renderHome();
  } catch (e) {
    console.warn("Init render error:", e);
  }

  // Bottom nav
  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Theme toggle
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme(); saveState();
  });
  document.getElementById("darkModeSwitch").addEventListener("change", (e) => {
    state.theme = e.target.checked ? "dark" : "light";
    applyTheme(); saveState();
  });

  // Habit check-in (event delegation)
  document.getElementById("habitList").addEventListener("click", async (e) => {
    const btn = e.target.closest(".check-btn");
    if (!btn) return;
    const h = state.habits.find(x => x.id === btn.dataset.id);
    if (!h) return;
    const key = todayKey();
    const wasDone = !!h.log[key];
    if (wasDone) delete h.log[key]; else h.log[key] = true;
    renderHome();
    if (!wasDone) {
      showToast("Nice! Habit checked ✔");
      AdManager.maybeShowInterstitial();
      checkNewBadges();
    }
  });

  // Add habit sheet
  const overlay = document.getElementById("addHabitOverlay");
  let selectedEmoji = EMOJIS[0];
  const emojiGrid = document.getElementById("emojiGrid");
  EMOJIS.forEach(em => {
    const b = document.createElement("button");
    b.className = "emoji-opt" + (em === selectedEmoji ? " sel" : "");
    b.textContent = em;
    b.addEventListener("click", () => {
      selectedEmoji = em;
      emojiGrid.querySelectorAll(".emoji-opt").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
    });
    emojiGrid.appendChild(b);
  });
  document.getElementById("addHabitFab").addEventListener("click", () => {
    document.getElementById("habitNameInput").value = "";
    overlay.classList.add("show");
  });
  document.getElementById("cancelHabitBtn").addEventListener("click", () => overlay.classList.remove("show"));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("show"); });
  document.getElementById("saveHabitBtn").addEventListener("click", () => {
    const name = document.getElementById("habitNameInput").value.trim();
    if (!name) { showToast("Enter a habit name"); return; }
    state.habits.push({ id: "h" + Date.now(), name, emoji: selectedEmoji, createdAt: todayKey(), log: {} });
    saveState();
    overlay.classList.remove("show");
    renderHome();
    showToast("Habit added 🌱");
  });

  // Settings: notifications
  document.getElementById("notifSwitch").addEventListener("change", async (e) => {
    if (e.target.checked) {
      const granted = await NotifManager.requestPermission();
      state.notif.enabled = granted;
      e.target.checked = granted;
      if (granted) NotifManager.schedule(state.notif.time);
      if (!granted) showToast("Notification permission denied");
    } else {
      state.notif.enabled = false;
    }
    saveState();
  });
  document.getElementById("notifTime").addEventListener("change", (e) => {
    state.notif.time = e.target.value;
    saveState();
    if (state.notif.enabled) NotifManager.schedule(state.notif.time);
  });

  // Reset data
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (confirm("This will permanently delete all habits, streaks and settings. Continue?")) {
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      state.onboarded = true;
      saveState();
      applyTheme();
      renderHome();
      showToast("All data reset");
    }
  });

  // Privacy policy view
  document.getElementById("openPrivacy").addEventListener("click", () => {
    switchView("privacy");
    fetch("privacy-policy.html").then(r => r.ok ? r.text() : Promise.reject())
      .then(html => { document.getElementById("privacyText").innerHTML = html; })
      .catch(() => {
        document.getElementById("privacyText").innerHTML =
          "<p>Habit Streak does not collect or share personal data. All habit data is stored locally on your device. See privacy-policy.html for the full policy.</p>";
      });
  });

  // Rewarded ad → unlock bonus badge theme
  document.getElementById("rewardAdBtn").addEventListener("click", () => {
    AdManager.showRewarded(() => {
      state.bonusBadgeTheme = true;
      saveState();
      showToast("Bonus badge theme unlocked! 🎉");
    });
  });

  // Init banner ad (non-intrusive, bottom, static)
  AdManager.initBanner();

  // Register service worker for offline support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});

function checkNewBadges() {
  const streak = computeGlobalStreak();
  const hit = BADGE_DEFS.find(b => b.days === streak);
  if (hit) showToast(`Achievement unlocked: ${hit.icon} ${hit.name}!`);
}
