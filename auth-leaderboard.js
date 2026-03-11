import {
  supabaseAnonKey as supabaseAnonKeyFallback,
  supabaseUrl as supabaseUrlFallback,
  allowedEmailDomain as allowedEmailDomainFallback,
} from "./supabase-config.js";

const authOverlay = document.getElementById("auth-overlay");
const signInGoogleButton = document.getElementById("btn-signin-google");
const signOutButton = document.getElementById("btn-signout");
const authControls = document.getElementById("auth-controls");

const leaderboardStatus = document.getElementById("leaderboard-status");
const leaderboardList = document.getElementById("leaderboard-list");
const leaderboardSubtitle = document.getElementById("leaderboard-subtitle");

const setStatus = (text) => {
  if (!leaderboardStatus) return;
  leaderboardStatus.textContent = text;
};

const loadRuntimeConfig = async () => {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
};

const resolveConfig = async () => {
  const runtime = await loadRuntimeConfig();
  const supabaseUrl =
    (runtime?.supabaseUrl && String(runtime.supabaseUrl)) || supabaseUrlFallback || "";
  const supabaseAnonKey =
    (runtime?.supabaseAnonKey && String(runtime.supabaseAnonKey)) || supabaseAnonKeyFallback || "";
  const allowedEmailDomain =
    (runtime?.allowedEmailDomain && String(runtime.allowedEmailDomain)) ||
    allowedEmailDomainFallback ||
    "";

  return {
    supabaseUrl,
    supabaseAnonKey,
    allowedEmailDomain,
  };
};

const isSupabaseConfigured = ({ supabaseUrl, supabaseAnonKey }) =>
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  supabaseUrl !== "REPLACE_ME" &&
  supabaseAnonKey !== "REPLACE_ME";

const usernameFromEmail = (email) => {
  if (typeof email !== "string") return "player";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
};

const emailDomainFromEmail = (email) => {
  if (typeof email !== "string") return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
};

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
};

const renderLeaderboard = (entries) => {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = "";
  for (const [index, entry] of entries.entries()) {
    const row = document.createElement("li");
    row.className = "lb-row";

    const rank = document.createElement("div");
    rank.className = "lb-rank";
    rank.textContent = String(index + 1);

    const body = document.createElement("div");

    const name = document.createElement("div");
    name.className = "lb-name";
    name.textContent = entry.username || "player";

    const stats = document.createElement("div");
    stats.className = "lb-stats";

    const attempts = document.createElement("div");
    attempts.className = "lb-pill";
    attempts.innerHTML = `Attempts <b>${entry.best_attempts ?? "—"}</b>`;

    const time = document.createElement("div");
    time.className = "lb-pill";
    time.innerHTML = `Time <b>${formatDuration(entry.best_time_ms)}</b>`;

    stats.appendChild(attempts);
    stats.appendChild(time);

    body.appendChild(name);
    body.appendChild(stats);

    row.appendChild(rank);
    row.appendChild(body);
    leaderboardList.appendChild(row);
  }
};

const waitForEventOnce = (eventName, timeoutMs = 20000) =>
  new Promise((resolve, reject) => {
    const onEvent = () => {
      window.removeEventListener(eventName, onEvent);
      resolve();
    };
    window.addEventListener(eventName, onEvent, { once: true });
    if (timeoutMs) {
      setTimeout(() => {
        window.removeEventListener(eventName, onEvent);
        reject(new Error(`Timed out waiting for ${eventName}`));
      }, timeoutMs);
    }
  });

const waitForTurbowarp = async () => {
  if (window.__turbowarp && window.__turbowarp.vm) return window.__turbowarp;
  await waitForEventOnce("turbowarp:ready");
  return window.__turbowarp;
};

const waitForProjectLoaded = async () => {
  if (window.__turbowarpProjectLoaded) return;
  await waitForEventOnce("turbowarp:projectLoaded");
};

const getStageVariable = (vm, variableName) => {
  const stage = vm?.runtime?.getTargetForStage?.();
  const variables = stage?.variables;
  if (!variables) return null;
  for (const id of Object.keys(variables)) {
    const entry = variables[id];
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [name, value] = entry;
    if (name === variableName) return { id, name, value };
  }
  return null;
};

const startGameIfNeeded = (() => {
  let started = false;
  return (turbowarp) => {
    if (started) return;
    started = true;
    turbowarp.start();
  };
})();

const createRunTracker = ({ turbowarp, user, submitWin }) => {
  const vm = turbowarp.vm;

  let lastStatus = null;
  let inRun = false;
  let attempts = 0;
  let submittedForCurrentWin = false;

  const poll = async () => {
    const gameStatus = getStageVariable(vm, "GameStatus?")?.value;
    if (typeof gameStatus !== "string") return;

    if (gameStatus !== lastStatus) {
      lastStatus = gameStatus;
      submittedForCurrentWin = false;
    }

    if (gameStatus === "Game") {
      if (!inRun) {
        inRun = true;
        attempts += 1;
      }
      return;
    }

    if (gameStatus === "Lose") {
      inRun = false;
      return;
    }

    if (gameStatus === "Win") {
      if (!submittedForCurrentWin) {
        submittedForCurrentWin = true;
        inRun = false;

        const timeValue = getStageVariable(vm, "Time")?.value;
        const timeSeconds = Number.parseFloat(timeValue);
        const timeMs = Number.isFinite(timeSeconds) ? Math.max(0, Math.round(timeSeconds * 1000)) : null;

        const attemptsForWin = Math.max(1, attempts);
        attempts = 0;

        await submitWin({
          uid: user.id,
          username: usernameFromEmail(user.email) || "player",
          attempts: attemptsForWin,
          timeMs,
        });
      }
    }
  };

  const intervalId = window.setInterval(() => {
    poll().catch((err) => console.error("[leaderboard] tracker error:", err));
  }, 200);

  return () => window.clearInterval(intervalId);
};

const main = async () => {
  const config = await resolveConfig();

  if (!isSupabaseConfigured(config)) {
    if (signInGoogleButton) signInGoogleButton.disabled = true;
    if (authOverlay) authOverlay.hidden = false;
    setStatus("Supabase is not configured yet (set Vercel env vars or edit supabase-config.js).");
    if (leaderboardSubtitle) leaderboardSubtitle.textContent = "Setup required";
    return;
  }

  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm");
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

  const turbowarp = await waitForTurbowarp();
  await waitForProjectLoaded();

  let stopTracker = null;
  let stopRealtime = null;

  const cleanup = () => {
    if (typeof stopTracker === "function") stopTracker();
    if (typeof stopRealtime === "function") stopRealtime();
    stopTracker = null;
    stopRealtime = null;
    renderLeaderboard([]);
  };

  const submitWin = async ({ uid, username, attempts, timeMs }) => {
    if (!uid) return;
    if (!Number.isFinite(attempts) || attempts < 1) return;
    if (!Number.isFinite(timeMs) || timeMs === null) return;

    const emailDomain = emailDomainFromEmail((await supabase.auth.getUser()).data.user?.email);
    const next = {
      id: uid,
      username,
      best_attempts: Math.trunc(attempts),
      best_time_ms: Math.trunc(timeMs),
      email_domain: emailDomain || null,
      updated_at: new Date().toISOString(),
    };

    const current = await supabase
      .from("leaderboard")
      .select("best_attempts,best_time_ms")
      .eq("id", uid)
      .maybeSingle();

    const prevAttempts = Number.isFinite(current.data?.best_attempts)
      ? current.data.best_attempts
      : Number.POSITIVE_INFINITY;
    const prevTimeMs = Number.isFinite(current.data?.best_time_ms)
      ? current.data.best_time_ms
      : Number.POSITIVE_INFINITY;

    const isBetter =
      next.best_attempts < prevAttempts ||
      (next.best_attempts === prevAttempts && next.best_time_ms < prevTimeMs);

    const payload = isBetter
      ? next
      : {
          id: uid,
          username,
          email_domain: emailDomain || null,
          updated_at: new Date().toISOString(),
        };

    const upsert = await supabase.from("leaderboard").upsert(payload, { onConflict: "id" });
    if (upsert.error) throw upsert.error;
  };

  const refreshLeaderboard = async () => {
    const res = await supabase
      .from("leaderboard")
      .select("username,best_attempts,best_time_ms,updated_at")
      .order("best_attempts", { ascending: true })
      .order("best_time_ms", { ascending: true })
      .limit(25);

    if (res.error) {
      console.error("[leaderboard] fetch error:", res.error);
      setStatus("Couldn’t load leaderboard (check Supabase RLS/policies).");
      return;
    }

    renderLeaderboard(res.data || []);
    setStatus(res.data?.length ? "" : "No wins yet — be the first!");
  };

  const startRealtime = () => {
    const channel = supabase
      .channel("leaderboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard" },
        () => {
          refreshLeaderboard().catch((e) => console.error("[leaderboard] refresh error:", e));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // good
        }
      });

    const pollId = window.setInterval(() => {
      refreshLeaderboard().catch((e) => console.error("[leaderboard] refresh error:", e));
    }, 15000);

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  };

  const showSignedOutUI = () => {
    if (authOverlay) authOverlay.hidden = false;
    if (authControls) authControls.hidden = true;
    setStatus("Sign in to play and see the live leaderboard.");
    cleanup();
    try {
      turbowarp.stop();
    } catch (e) {
      // ignore
    }
  };

  const showSignedInUI = (user) => {
    if (authOverlay) authOverlay.hidden = true;
    if (authControls) authControls.hidden = false;
    setStatus("Loading leaderboard…");

    const username = usernameFromEmail(user.email);
    turbowarp.setUsername(username);
    startGameIfNeeded(turbowarp);

    stopRealtime = startRealtime();
    refreshLeaderboard().catch((e) => console.error("[leaderboard] refresh error:", e));
    stopTracker = createRunTracker({ turbowarp, user, submitWin });
  };

  if (signInGoogleButton) {
    signInGoogleButton.addEventListener("click", async () => {
      try {
        signInGoogleButton.disabled = true;
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
      } catch (err) {
        console.error("[auth] sign-in error:", err);
        setStatus("Sign-in failed. Try again.");
      } finally {
        signInGoogleButton.disabled = false;
      }
    });
  }

  if (signOutButton) {
    signOutButton.addEventListener("click", async () => {
      try {
        await supabase.auth.signOut();
        // TurboWarp VM state is easiest to reset via reload.
        location.reload();
      } catch (err) {
        console.error("[auth] sign-out error:", err);
      }
    });
  }

  const handleSession = async () => {
    cleanup();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const user = session?.user || null;
    if (!user) {
      showSignedOutUI();
      return;
    }

    const emailDomain = emailDomainFromEmail(user.email);
    const allowed = typeof config.allowedEmailDomain === "string" ? config.allowedEmailDomain.trim().toLowerCase() : "";
    if (allowed && emailDomain !== allowed) {
      setStatus(`Please sign in with a ${allowed} email.`);
      await supabase.auth.signOut();
      showSignedOutUI();
      return;
    }

    showSignedInUI(user);
  };

  supabase.auth.onAuthStateChange(() => {
    handleSession().catch((e) => console.error("[auth] session error:", e));
  });

  await handleSession();
};

main().catch((err) => {
  console.error("[bootstrap] error:", err);
  setStatus("Failed to initialize auth/leaderboard.");
  if (authOverlay) authOverlay.hidden = false;
});
