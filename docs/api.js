// Thin client for the Supabase RPC functions in db/schema.sql.
(function () {
  const cfg = window.JOKES_CONFIG || {};
  const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes("YOUR-PROJECT");

  async function rpc(name, args) {
    const headers = { "Content-Type": "application/json", apikey: cfg.supabaseKey };
    // Legacy anon keys are JWTs and also go in Authorization; new publishable keys must not.
    if (cfg.supabaseKey.startsWith("eyJ")) headers.Authorization = "Bearer " + cfg.supabaseKey;
    const res = await fetch(cfg.supabaseUrl + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers,
      body: JSON.stringify(args || {}),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && body.message) || "Request failed (" + res.status + ")");
    return body;
  }

  // Anonymous annotator id, kept in this browser only.
  function annotatorId() {
    try {
      let id = localStorage.getItem("annotator_id");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("annotator_id", id);
      }
      return id;
    } catch (e) {
      if (!window.__annotatorId) window.__annotatorId = crypto.randomUUID();
      return window.__annotatorId;
    }
  }

  window.JokesApi = {
    configured,
    annotatorId,
    nextJoke: async () => (await rpc("next_joke", { p_annotator: annotatorId() }))[0] || null,
    rate: async (jokeId, score) =>
      (await rpc("rate_joke", { p_annotator: annotatorId(), p_joke: jokeId, p_score: score }))[0],
    submit: (text) => rpc("submit_joke", { p_annotator: annotatorId(), p_text: text }),
    stats: () => rpc("joke_stats"),
    progress: async () => (await rpc("my_progress", { p_annotator: annotatorId() }))[0],
    setNickname: (name) => rpc("set_nickname", { p_annotator: annotatorId(), p_name: name }),
    myJokes: () => rpc("my_jokes", { p_annotator: annotatorId() }),
    leaderboards: () => rpc("leaderboards", { p_annotator: annotatorId() }),
  };
})();
