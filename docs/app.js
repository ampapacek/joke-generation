(function () {
  const api = window.JokesApi;
  const $ = (id) => document.getElementById(id);
  const scaleButtons = [...document.querySelectorAll("#scale button")];
  const MILESTONES = { 10: "10 jokes! 🎉", 25: "25 jokes! You're on a roll 🔥", 50: "50 jokes! Comedy critic 🏆", 100: "100 jokes! Legend 👑" };
  const REVEAL_MS = 1600;

  let current = null;
  let busy = false;
  let advanceTimer = null;

  function storedCount() {
    try { return parseInt(localStorage.getItem("rated_count") || "0", 10); } catch (e) { return 0; }
  }
  let count = storedCount();
  $("count").textContent = count;

  function bumpCount() {
    count += 1;
    try { localStorage.setItem("rated_count", String(count)); } catch (e) {}
    $("count").textContent = count;
    $("count").parentElement.classList.remove("pop");
    void $("count").offsetWidth;
    $("count").parentElement.classList.add("pop");
    if (MILESTONES[count]) toast(MILESTONES[count]);
  }

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
    if (e.target.closest("textarea, input")) return;
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

  if (!api.configured) {
    $("setup").hidden = false;
    $("joke").textContent = "Not connected.";
    setEnabled(false);
    return;
  }
  loadNext();
})();
