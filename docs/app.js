(function () {
  const api = window.JokesApi;
  const $ = (id) => document.getElementById(id);
  const scaleButtons = [...document.querySelectorAll("#scale button")];
  const LEVELS = [
    { min: 0, name: "Giggle Rookie" },
    { min: 10, name: "Pun Inspector" },
    { min: 25, name: "Joke Taster" },
    { min: 50, name: "Comedy Critic" },
    { min: 100, name: "Laugh Legend" },
  ];
  const PING_EVERY = 3; // notify once your jokes got this many new ratings
  const REVEAL_MS = 1600;

  let current = null;
  let busy = false;
  let advanceTimer = null;

  // localStorage can be unavailable (private mode); everything still works without it.
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  // ---- count, levels, fire ----

  const levelOf = (n) => LEVELS.reduce((lvl, l, i) => (n >= l.min ? i : lvl), 0);
  let count = parseInt(load("rated_count") || "0", 10) || 0;

  function renderLevel() {
    const i = levelOf(count);
    const next = LEVELS[i + 1];
    $("count").textContent = count;
    $("fire").className = "fire lvl-" + i;
    $("level-name").textContent = LEVELS[i].name;
    $("level-next").textContent = next ? `${next.min - count} more to ${next.name}` : "Top level 👑";
    const pct = next ? ((count - LEVELS[i].min) / (next.min - LEVELS[i].min)) * 100 : 100;
    $("level-fill").style.width = pct + "%";
  }

  function setCount(n, celebrate) {
    const before = levelOf(count);
    count = n;
    save("rated_count", String(count));
    renderLevel();
    if (celebrate && levelOf(count) > before) {
      confetti();
      toast(`Level up: ${LEVELS[levelOf(count)].name}! 🎉`);
    }
  }

  function bumpCount() {
    setCount(count + 1, true);
    const c = $("count").parentElement;
    c.classList.remove("pop");
    void c.offsetWidth;
    c.classList.add("pop");
  }

  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div");
    box.className = "confetti";
    const colors = ["#e8590c", "#f59f00", "#37b24d", "#1c7ed6", "#ae3ec9", "#f03e3e"];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.4 + "s";
      p.style.setProperty("--drift", (Math.random() - 0.5) * 160 + "px");
      p.style.setProperty("--spin", (Math.random() - 0.5) * 1080 + "deg");
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }

  // ---- server progress and "your jokes got new ratings" notices ----

  const muted = () => load("mute_pings") === "1";

  async function refreshProgress() {
    let p;
    try { p = await api.progress(); } catch (e) { return; }
    if (!p) return;
    showName(p.name);
    maybeWelcome();
    setCount(Number(p.n_rated), false);
    const total = Number(p.my_joke_ratings);
    const seen = load("seen_my_joke_ratings");
    if (seen === null || total < Number(seen)) {
      save("seen_my_joke_ratings", String(total));
    } else if (total - Number(seen) >= PING_EVERY) {
      save("seen_my_joke_ratings", String(total));
      if (!muted()) showPing(total - Number(seen), p.my_joke_avg);
    }
  }

  // ---- nickname ----

  let myName = "";
  function showName(name) {
    myName = name;
    $("me-name").textContent = "· " + name + " ✏️";
    $("me-name").hidden = !$("name-form").hidden;
  }
  function editName(on) {
    $("name-form").hidden = !on;
    $("me-name").hidden = on;
    if (on) { $("name-input").value = myName; $("name-input").focus(); $("name-input").select(); }
  }
  $("me-name").addEventListener("click", () => editName(true));
  $("name-cancel").addEventListener("click", () => editName(false));
  $("name-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("name-form").querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const name = await api.setNickname($("name-input").value);
      editName(false);
      showName(name);
      toast(`You're now ${name} on the leaderboard`);
    } catch (err) {
      toast(err.message);
    }
    btn.disabled = false;
  });
  $("name-input").addEventListener("keydown", (e) => { if (e.key === "Escape") editName(false); });

  // First visit: offer a nickname once.
  function maybeWelcome() {
    if (load("name_prompted") || !$("welcome").hidden) return;
    $("welcome-name").textContent = myName;
    $("welcome").hidden = false;
  }
  function closeWelcome() { save("name_prompted", "1"); $("welcome").hidden = true; }
  $("welcome-pick").addEventListener("click", () => { closeWelcome(); editName(true); });
  $("welcome-keep").addEventListener("click", closeWelcome);
  $("welcome-close").addEventListener("click", closeWelcome);

  function showPing(n, avg) {
    $("ping-text").textContent = `🔔 ${n} new ratings on your jokes` +
      (avg != null ? ` · avg ${Number(avg).toFixed(1)}` : "");
    $("ping").hidden = false;
    clearTimeout(showPing.timer);
    showPing.timer = setTimeout(() => ($("ping").hidden = true), 8000);
  }

  function setMuted(on) {
    save("mute_pings", on ? "1" : "0");
    $("mute-box").checked = on;
    if (on) $("ping").hidden = true;
  }

  $("ping-view").addEventListener("click", () => { $("ping").hidden = true; showTab("mine"); });
  $("ping-mute").addEventListener("click", () => { setMuted(true); toast("Muted. You can unmute in My jokes."); });
  $("ping-close").addEventListener("click", () => ($("ping").hidden = true));
  $("mute-box").addEventListener("change", (e) => setMuted(e.target.checked));
  $("mute-box").checked = muted();

  // ---- tabs ----

  function showTab(name) {
    const mine = name === "mine";
    $("view-rate").hidden = mine;
    $("view-mine").hidden = !mine;
    $("tab-rate").classList.toggle("active", !mine);
    $("tab-mine").classList.toggle("active", mine);
    $("tab-rate").setAttribute("aria-selected", String(!mine));
    $("tab-mine").setAttribute("aria-selected", String(mine));
    if (mine) loadMine();
  }
  $("tab-rate").addEventListener("click", () => showTab("rate"));
  $("tab-mine").addEventListener("click", () => showTab("mine"));

  async function loadMine() {
    const list = $("mine-list");
    const summary = $("mine-summary");
    summary.textContent = "Loading…";
    list.innerHTML = "";
    let rows;
    try { rows = await api.myJokes(); }
    catch (e) { summary.textContent = "Could not load your jokes: " + e.message; return; }
    if (!rows.length) {
      summary.textContent = "You haven't added any jokes yet.";
      const add = document.createElement("button");
      add.className = "pill";
      add.textContent = "➕ Add your first joke";
      add.addEventListener("click", () => { showTab("rate"); $("add").open = true; $("add-text").focus(); });
      summary.append(" ", add);
      return;
    }
    const total = rows.reduce((s, r) => s + Number(r.n_ratings), 0);
    summary.textContent = `${rows.length} ${rows.length === 1 ? "joke" : "jokes"}, ${total} ratings so far.`;
    for (const r of rows) {
      const li = document.createElement("li");
      const text = document.createElement("p");
      text.textContent = r.text;
      const meta = document.createElement("div");
      meta.className = "hint";
      const n = Number(r.n_ratings);
      meta.textContent = n ? `${Number(r.avg_score).toFixed(1)} avg · ${n} ${n === 1 ? "rating" : "ratings"}` : "No ratings yet";
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.style.width = n ? (Number(r.avg_score) / 5) * 100 + "%" : "0";
      bar.appendChild(fill);
      li.append(text, bar, meta);
      list.appendChild(li);
    }
  }

  // ---- rating ----

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2500);
  }

  function setEnabled(on) {
    scaleButtons.forEach((b) => (b.disabled = !on));
    $("skip").disabled = !on;
  }

  async function loadNext() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
    $("reveal").hidden = true;
    $("card").classList.remove("done");
    scaleButtons.forEach((b) => b.classList.remove("chosen"));
    setEnabled(false);
    $("joke").textContent = "Loading…";
    try {
      current = await api.nextJoke();
    } catch (e) {
      $("joke").textContent = "Could not load a joke: " + e.message;
      return;
    }
    if (!current) {
      $("joke").textContent = "You've rated every joke we have! 🎉 Add your own below, or come back later.";
      $("add").open = true;
      return;
    }
    $("joke").textContent = current.text;
    $("card").classList.remove("enter");
    void $("card").offsetWidth;
    $("card").classList.add("enter");
    setEnabled(true);
  }

  async function answer(score) {
    if (!current || busy) return;
    busy = true;
    setEnabled(false);
    try {
      const stats = await api.rate(current.id, score);
      if (score === null) {
        busy = false;
        return loadNext();
      }
      bumpCount();
      scaleButtons[score - 1].classList.add("chosen");
      showReveal(stats);
      refreshProgress();
    } catch (e) {
      toast("Could not save: " + e.message);
      setEnabled(true);
    }
    busy = false;
  }

  function showReveal(stats) {
    const n = Number(stats.n_ratings);
    const avg = Number(stats.avg_score);
    const r = $("reveal");
    r.innerHTML = "";
    const text = document.createElement("div");
    text.textContent = n <= 1
      ? "You're the first to rate this one!"
      : `Average so far: ${avg.toFixed(1)} from ${n} ratings`;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.style.width = (avg / 5) * 100 + "%";
    bar.appendChild(fill);
    const next = document.createElement("div");
    next.className = "hint";
    next.textContent = "Click or press any key for the next joke";
    r.append(text, bar, next);
    r.hidden = false;
    $("card").classList.add("done");
    advanceTimer = setTimeout(loadNext, REVEAL_MS);
  }

  scaleButtons.forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.score))));
  $("skip").addEventListener("click", () => answer(null));
  $("card").addEventListener("click", () => { if (advanceTimer) loadNext(); });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("textarea, input") || $("view-rate").hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (advanceTimer) { e.preventDefault(); loadNext(); return; }
    if (e.key >= "1" && e.key <= "5") answer(Number(e.key));
    else if (e.key === "s" || e.key === "S") answer(null);
  });

  $("add-text").addEventListener("input", () => {
    $("add-len").textContent = $("add-text").value.length + " / 500";
  });

  $("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("add-text").value.trim();
    if (text.length < 5) return toast("A bit too short for a joke.");
    const btn = e.submitter || $("add-form").querySelector("button");
    btn.disabled = true;
    try {
      await api.submit(text);
      $("add-text").value = "";
      $("add-len").textContent = "0 / 500";
      $("add").open = false;
      toast("Thanks! Your joke is now in the pool 🙌");
      if (!current) loadNext();
    } catch (err) {
      toast(err.message);
    }
    btn.disabled = false;
  });

  renderLevel();
  if (!api.configured) {
    $("setup").hidden = false;
    $("joke").textContent = "Not connected.";
    setEnabled(false);
    return;
  }
  loadNext();
  refreshProgress();
})();
