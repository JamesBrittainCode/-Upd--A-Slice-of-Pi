import {
  supabaseAnonKey as supabaseAnonKeyFallback,
  supabaseUrl as supabaseUrlFallback,
  allowedEmailDomain as allowedEmailDomainFallback,
} from "./supabase-config.js";

const authOverlay = document.getElementById("auth-overlay");
const signInGoogleButton = document.getElementById("btn-signin-google");
const signOutButton = document.getElementById("btn-signout");
const authControls = document.getElementById("auth-controls");
const yourScoreCard = document.getElementById("your-score-card");
const yourBestAttempts = document.getElementById("your-best-attempts");
const yourBestTime = document.getElementById("your-best-time");
const downloadScoreButton = document.getElementById("btn-download-score");

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

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const canvasToPngBlob = (canvas) =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });

const drawPieSliceWatermark = (ctx, { x, y, radius }) => {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";

  const start = -Math.PI / 4;
  const end = (Math.PI * 5) / 4;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, radius, start, end, false);
  ctx.closePath();
  ctx.fill();

  // Cut out a small triangle "missing slice"
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + radius * 0.9, y);
  ctx.lineTo(x + radius * 0.55, y - radius * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
};

const renderScorePng = async ({ title, username, attempts, timeMs }) => {
  const width = 1200;
  const height = 675;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.textBaseline = "alphabetic";

  // Background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0b0b0f");
  gradient.addColorStop(1, "#141423");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Accent border
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, width - 48, height - 48);

  // Header
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "700 52px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(title, 70, 120);

  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.font = "500 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Score snapshot", 70, 160);

  // Main card
  const cardW = 900;
  const cardH = 340;
  const cardX = Math.round((width - cardW) / 2);
  const cardY = 205;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.stroke();

  // Username
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "700 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(username, cardX + 34, cardY + 72);

  // Stats labels
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Attempts", cardX + 34, cardY + 135);
  ctx.fillText("Time", cardX + 34, cardY + 220);

  // Stats values
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "800 56px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(String(attempts ?? "—"), cardX + 34, cardY + 190);
  ctx.fillText(formatDuration(timeMs), cardX + 34, cardY + 290);

  // Timestamp (outside the card to avoid overlapping stats)
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const now = new Date();
  ctx.fillText(now.toLocaleString(), 70, height - 60);

  // Watermark
  drawPieSliceWatermark(ctx, { x: width - 160, y: height - 125, radius: 72 });
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "700 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("A Slice of Pi by James Brittain", width - 560, height - 55);

  return canvas;
};

const renderLeaderboard = (entries) => {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = "";
  for (const [index, entry] of entries.entries()) {
    const row = document.createElement("li");
    row.className = "lb-row";

    const rank = document.createElement("div");
    rank.className = "lb-rank";
    const place = index + 1;
    if (place <= 3) {
      const colors = ["#F9C74F", "#BFC7D5", "#D08C60"];
      const labels = ["1st place", "2nd place", "3rd place"];
      rank.innerHTML = `<span class="rank-badge" title="${labels[index]}" style="color:${colors[index]}">
        <svg class="icon small" aria-hidden="true"><use href="#icon-medal"></use></svg>
      </span>`;
    } else {
      rank.textContent = String(place);
    }

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
    if (Array.isArray(entry)) {
      if (entry.length < 2) continue;
      const [name, value] = entry;
      if (name === variableName) return { id, name, value };
      continue;
    }

    if (entry && typeof entry === "object") {
      const name = entry.name;
      const value = entry.value;
      if (name === variableName) return { id, name, value };
    }
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

const createRunTracker = ({ turbowarp, user, submitWin, onWin }) => {
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

        if (typeof onWin === "function") {
          onWin({
            username: usernameFromEmail(user.email) || "player",
            attempts: attemptsForWin,
            timeMs,
          });
        }

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
  let currentUserBest = null;
  let lastWinSnapshot = null;

  const cleanup = () => {
    if (typeof stopTracker === "function") stopTracker();
    if (typeof stopRealtime === "function") stopRealtime();
    stopTracker = null;
    stopRealtime = null;
    renderLeaderboard([]);
    currentUserBest = null;
    lastWinSnapshot = null;
    if (yourScoreCard) yourScoreCard.hidden = true;
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
      const message = typeof res.error.message === "string" ? res.error.message : "Unknown error";
      setStatus(`Couldn’t load leaderboard: ${message}`);
      return;
    }

    renderLeaderboard(res.data || []);
    setStatus(res.data?.length ? "" : "No wins yet — be the first!");
  };

  const refreshCurrentUserBest = async (userId) => {
    if (!userId) return;
    const res = await supabase
      .from("leaderboard")
      .select("username,best_attempts,best_time_ms,updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (res.error) {
      console.error("[leaderboard] user fetch error:", res.error);
      return;
    }

    currentUserBest = res.data || null;
    if (!yourScoreCard) return;
    if (!currentUserBest) {
      // Keep the card visible while signed in; it will show last win (if any) or placeholders.
      yourScoreCard.hidden = false;
      if (yourBestAttempts) yourBestAttempts.textContent = "—";
      if (yourBestTime) yourBestTime.textContent = "—";
      return;
    }

    yourScoreCard.hidden = false;
    if (yourBestAttempts) yourBestAttempts.textContent = String(currentUserBest.best_attempts ?? "—");
    if (yourBestTime) yourBestTime.textContent = formatDuration(currentUserBest.best_time_ms);
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
    if (yourScoreCard) yourScoreCard.hidden = true;
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
    refreshCurrentUserBest(user.id).catch((e) => console.error("[leaderboard] user refresh error:", e));
    if (yourScoreCard) yourScoreCard.hidden = false;
    stopTracker = createRunTracker({
      turbowarp,
      user,
      submitWin: async (payload) => {
        try {
          await submitWin(payload);
          await refreshLeaderboard();
          await refreshCurrentUserBest(payload.uid);
        } catch (e) {
          console.error("[leaderboard] submit error:", e);
          const message = typeof e?.message === "string" ? e.message : "Unknown error";
          setStatus(`Couldn’t save score: ${message}`);
        }
      },
      onWin: (snapshot) => {
        lastWinSnapshot = snapshot;
        if (yourScoreCard) yourScoreCard.hidden = false;
        if (yourBestAttempts) yourBestAttempts.textContent = String(snapshot.attempts ?? "—");
        if (yourBestTime) yourBestTime.textContent = formatDuration(snapshot.timeMs);
      },
    });
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

  if (downloadScoreButton) {
    downloadScoreButton.addEventListener("click", async () => {
      try {
        downloadScoreButton.disabled = true;
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) {
          setStatus("Sign in to download your score.");
          return;
        }

        await refreshCurrentUserBest(user.id);
        const best = currentUserBest || null;
        const snapshot = best
          ? {
              username: best.username || usernameFromEmail(user.email) || "player",
              attempts: best.best_attempts,
              timeMs: best.best_time_ms,
            }
          : lastWinSnapshot;

        if (!snapshot) {
          setStatus("No saved win yet — win once to download.");
          return;
        }

        const canvas = await renderScorePng({
          title: "A Slice of Pi",
          username: snapshot.username || usernameFromEmail(user.email) || "player",
          attempts: snapshot.attempts,
          timeMs: snapshot.timeMs,
        });
        const blob = await canvasToPngBlob(canvas);
        if (!blob) throw new Error("Failed to generate PNG");

        const safeUser = (snapshot.username || "player").replace(/[^a-z0-9_-]+/gi, "-");
        const filename = `slice-of-pi-score-${safeUser}.png`;
        downloadBlob(blob, filename);
      } catch (e) {
        console.error("[download] error:", e);
        setStatus("Couldn’t generate PNG.");
      } finally {
        downloadScoreButton.disabled = false;
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
