"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  Lock,
  LogOut,
  Mic,
  Moon,
  Palette,
  Play,
  Plug,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Unplug,
  Users,
  Video
} from "lucide-react";
import type { ConnectorStatus, MeetingNote, MeetingSource, MeetingsPayload } from "@/lib/types";

const CACHE_KEY = "echolog-lucid:last-payload";
const LEGACY_CACHE_KEYS = ["meeting-vault:last-payload"];
const APPEARANCE_KEY = "echolog-lucid:appearance";
const APP_NAME = "Echolog Lucid";
const ACCENTS = ["#2B49FF", "#36E0A0", "#7A5AE0", "#F0603A", "#E8A13A", "#18B6D8"];
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you"
]);

type AuthState = {
  passwordEnabled: boolean;
  authenticated: boolean;
};

type AppScreen = "home" | "detail" | "accounts";
type SourceFilter = "all" | MeetingSource;
type ThemeMode = "light" | "dark";
type AccentChoice = "auto" | string;

type Appearance = {
  theme: ThemeMode;
  accent: AccentChoice;
  radius: number;
};

type DetailView = "transcript" | "summary";
type SyncStatus = {
  tone: "info" | "success" | "warning" | "error";
  text: string;
};

type TranscriptLine = {
  speaker?: string;
  text: string;
};

type MeetingVaultAppProps = {
  staticPayload?: MeetingsPayload;
  staticMode?: boolean;
};

export function MeetingVaultApp({ staticPayload, staticMode = false }: MeetingVaultAppProps = {}) {
  const [auth, setAuth] = useState<AuthState | null>(staticMode ? { passwordEnabled: false, authenticated: true } : null);
  const [payload, setPayload] = useState<MeetingsPayload | null>(staticPayload || null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(!staticMode);
  const [message, setMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [transcriptLoadingId, setTranscriptLoadingId] = useState<string | null>(null);
  const [transcriptErrors, setTranscriptErrors] = useState<Record<string, string>>({});
  const [granolaContentLoadingId, setGranolaContentLoadingId] = useState<string | null>(null);
  const [granolaContentErrors, setGranolaContentErrors] = useState<Record<string, string>>({});
  const [granolaContentAttempts, setGranolaContentAttempts] = useState<Record<string, boolean>>({});
  const [appearance, setAppearance] = useState<Appearance>(() =>
    staticMode
      ? {
          theme: "dark",
          accent: "auto",
          radius: 16
        }
      : readInitialAppearance()
  );
  const [deepSearch, setDeepSearch] = useState<{
    query: string;
    loading: boolean;
    count: number;
    error?: string;
  }>({
    query: "",
    loading: false,
    count: 0
  });

  useEffect(() => {
    if (staticMode) {
      return;
    }

    registerServiceWorker();
    const promptHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", promptHandler);
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");
    const error = url.searchParams.get("error");
    if (connected === "granola") {
      setMessage("Granola connected. Pulling recent notes now.");
      window.history.replaceState({}, "", "/");
    }

    if (error) {
      setMessage(error);
      window.history.replaceState({}, "", "/");
    }

    return () => window.removeEventListener("beforeinstallprompt", promptHandler);
  }, [staticMode]);

  useEffect(() => {
    const nextAccent = appearance.accent === "auto" ? (appearance.theme === "dark" ? "#36E0A0" : "#2B49FF") : appearance.accent;
    if (!staticMode) {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    }
    document.documentElement.dataset.theme = appearance.theme;
    document.body.dataset.theme = appearance.theme;
    document.documentElement.style.setProperty("--accent", nextAccent);
    document.documentElement.style.setProperty("--on-accent", onAccentFor(nextAccent));
    document.documentElement.style.setProperty("--radius", `${appearance.radius}px`);
  }, [appearance, staticMode]);

  useEffect(() => {
    if (staticMode) {
      setAuth({ passwordEnabled: false, authenticated: true });
      setPayload(staticPayload || null);
      setSyncStatus(null);
      setLoading(false);
      return;
    }

    void bootstrap();
  }, [staticMode, staticPayload]);

  useEffect(() => {
    if (!selectedId && payload?.meetings.length) {
      setSelectedId(payload.meetings[0].id);
    }
  }, [payload, selectedId]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim();
    return (payload?.meetings || []).filter((meeting) => {
      const sourceMatch = source === "all" || meeting.source === source;

      return sourceMatch && (!normalizedQuery || meetingMatchesQuery(meeting, normalizedQuery));
    });
  }, [payload, query, source]);

  const selected = filtered.find((meeting) => meeting.id === selectedId) || filtered[0] || null;
  const selectedIndex = selected ? filtered.findIndex((meeting) => meeting.id === selected.id) : -1;
  const connectorCounts = useMemo(() => countSources(payload?.meetings || []), [payload]);
  const effectiveAccent = appearance.accent === "auto" ? (appearance.theme === "dark" ? "#36E0A0" : "#2B49FF") : appearance.accent;
  const themeVars = {
    "--accent": effectiveAccent,
    "--on-accent": onAccentFor(effectiveAccent),
    "--radius": `${appearance.radius}px`
  } as CSSProperties;

  useEffect(() => {
    if (screen === "detail" && filtered.length === 0) {
      setScreen("home");
    }
  }, [filtered.length, screen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (staticMode || !auth?.authenticated || source === "granola" || trimmed.length < 4) {
      setDeepSearch({
        query: trimmed,
        loading: false,
        count: 0
      });
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setDeepSearch({
        query: trimmed,
        loading: true,
        count: 0
      });

      async function runDeepSearch() {
        try {
          const params = new URLSearchParams({
            query: trimmed
          });
          if (source !== "all") {
            params.set("source", source);
          }

          const response = await fetch(`/api/meetings/search?${params}`, {
            cache: "no-store",
            signal: controller.signal
          });
          const data = (await response.json()) as {
            meetings?: MeetingNote[];
            error?: string;
          };

          if (response.status === 401) {
            setAuth((current) => current && { ...current, authenticated: false });
            return;
          }

          if (!response.ok) {
            throw new Error(data.error || "Transcript search failed.");
          }

          const matches = data.meetings || [];
          if (matches.length) {
            setPayload((current) => {
              const nextPayload = upsertMeetingPayload(current, matches);
              if (nextPayload) {
                localStorage.setItem(CACHE_KEY, JSON.stringify(nextPayload));
              }
              return nextPayload;
            });
          }

          setDeepSearch({
            query: trimmed,
            loading: false,
            count: matches.length
          });
        } catch (error) {
          if (!controller.signal.aborted) {
            setDeepSearch({
              query: trimmed,
              loading: false,
              count: 0,
              error: error instanceof Error ? error.message : "Transcript search failed."
            });
          }
        }
      }

      void runDeepSearch();
    }, 650);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [auth?.authenticated, staticMode, query, source]);

  useEffect(() => {
    if (staticMode || screen !== "detail" || !selected || selected.source !== "fathom" || selected.transcript || !selected.recordingId) {
      return;
    }

    const controller = new AbortController();
    setTranscriptLoadingId(selected.id);
    setTranscriptErrors((current) => {
      const next = { ...current };
      delete next[selected.id];
      return next;
    });

    async function loadTranscript() {
      try {
        const response = await fetch(`/api/meetings/fathom/${encodeURIComponent(selected.recordingId!)}/transcript`, {
          cache: "no-store",
          signal: controller.signal
        });

        const data = (await response.json()) as {
          transcript?: string;
          transcriptPreview?: string[];
          error?: string;
        };

        if (!response.ok || !data.transcript) {
          throw new Error(data.error || "Transcript was not available for this meeting.");
        }

        setPayload((current) => {
          if (!current) {
            return current;
          }

          const nextPayload = {
            ...current,
            meetings: current.meetings.map((meeting) =>
              meeting.id === selected.id
                ? {
                    ...meeting,
                    transcript: data.transcript,
                    transcriptPreview: data.transcriptPreview || []
                  }
                : meeting
            )
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(nextPayload));
          return nextPayload;
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setTranscriptErrors((current) => ({
            ...current,
            [selected.id]: error instanceof Error ? error.message : "Transcript failed to load."
          }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setTranscriptLoadingId((current) => (current === selected.id ? null : current));
        }
      }
    }

    void loadTranscript();
    return () => controller.abort();
  }, [staticMode, screen, selected?.id, selected?.recordingId, selected?.source, selected?.transcript]);

  useEffect(() => {
    if (
      staticMode ||
      screen !== "detail" ||
      !selected ||
      selected.source !== "granola" ||
      meetingHasReadableContent(selected) ||
      selected.contentStatus ||
      granolaContentAttempts[selected.id]
    ) {
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setGranolaContentErrors((current) => ({
        ...current,
        [selected.id]: "Granola took too long to return this note. Tap Retry Granola to try again."
      }));
      setGranolaContentLoadingId((current) => (current === selected.id ? null : current));
    }, 34000);
    const selectedMeeting = selected;
    setGranolaContentAttempts((current) => ({
      ...current,
      [selectedMeeting.id]: true
    }));
    setGranolaContentLoadingId(selectedMeeting.id);
    setGranolaContentErrors((current) => {
      const next = { ...current };
      delete next[selectedMeeting.id];
      return next;
    });

    async function loadGranolaContent() {
      try {
        const params = new URLSearchParams({
          title: selectedMeeting.title,
          attendees: JSON.stringify(selectedMeeting.attendees)
        });
        if (selectedMeeting.occurredAt) {
          params.set("occurredAt", selectedMeeting.occurredAt);
        }

        const meetingId = selectedMeeting.id.replace(/^granola-/, "");
        const response = await fetch(`/api/meetings/granola/${encodeURIComponent(meetingId)}/content?${params}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = (await response.json()) as {
          meeting?: MeetingNote;
          error?: string;
        };

        if (!response.ok || !data.meeting) {
          throw new Error(data.error || "Granola notes were not available for this meeting.");
        }

        setPayload((current) => {
          if (!current) {
            return current;
          }

          const nextPayload = {
            ...current,
            meetings: current.meetings.map((meeting) => (meeting.id === selectedMeeting.id ? mergeMeeting(meeting, data.meeting!) : meeting))
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(nextPayload));
          return nextPayload;
        });
      } catch (error) {
        if (!controller.signal.aborted || timedOut) {
          setGranolaContentErrors((current) => ({
            ...current,
            [selectedMeeting.id]: timedOut ? "Granola took too long to return this note. Try opening it again in a moment." : error instanceof Error ? error.message : "Granola notes failed to load."
          }));
        }
      } finally {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) {
          setGranolaContentLoadingId((current) => (current === selectedMeeting.id ? null : current));
        }
      }
    }

    void loadGranolaContent();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    staticMode,
    screen,
    selected?.id,
    selected?.source,
    selected?.summary,
    selected?.notes,
    selected?.transcript,
    selected?.actionItems.length,
    selected?.transcriptPreview.length,
    granolaContentAttempts
  ]);

  async function bootstrap() {
    setLoading(true);
    const hydrated = hydrateFromCache();
    try {
      const authResponse = await fetch("/api/auth/status", { cache: "no-store" });
      const authData = (await authResponse.json()) as AuthState;
      setAuth(authData);

      if (authData.authenticated) {
        await loadMeetings();
      } else {
        setLoading(false);
      }
    } catch {
      if (!hydrated) {
        hydrateFromCache();
      }
      setLoading(false);
    }
  }

  async function loadMeetings() {
    if (staticMode) {
      setLoading(true);
      setSyncStatus(null);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      setPayload(staticPayload || null);
      setSyncStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSyncStatus({
      tone: "info",
      text: "Refreshing meeting notes..."
    });
    try {
      const response = await fetch("/api/meetings", { cache: "no-store" });
      if (response.status === 401) {
        setAuth((current) => current && { ...current, authenticated: false });
        setSyncStatus({
          tone: "warning",
          text: "Your app session expired. Sign in again to refresh notes."
        });
        setLoading(false);
        return;
      }

      const data = (await response.json()) as MeetingsPayload;
      setGranolaContentAttempts({});
      setGranolaContentErrors({});
      setPayload((current) => {
        const merged = mergeMeetingPayload(data, current);
        localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        return merged;
      });
      setSyncStatus(syncStatusFromPayload(data));
    } catch {
      const hydrated = hydrateFromCache();
      setSyncStatus({
        tone: "error",
        text: hydrated ? "Live refresh failed. Showing the last notes cached on this device." : "Live refresh failed. No cached notes were available on this device."
      });
    } finally {
      setLoading(false);
    }
  }

  function hydrateFromCache() {
    for (const key of [CACHE_KEY, ...LEGACY_CACHE_KEYS]) {
      const cached = localStorage.getItem(key);
      if (!cached) {
        continue;
      }

      try {
        setPayload(JSON.parse(cached) as MeetingsPayload);
        if (key !== CACHE_KEY) {
          localStorage.setItem(CACHE_KEY, cached);
        }
        return true;
      } catch {
        localStorage.removeItem(key);
      }
    }

    return false;
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (staticMode) {
      setAuth({ passwordEnabled: false, authenticated: true });
      return;
    }

    setMessage(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      setMessage("That password did not work.");
      return;
    }

    setPassword("");
    setAuth({ passwordEnabled: true, authenticated: true });
    setScreen("home");
    await loadMeetings();
  }

  async function logout() {
    if (staticMode) {
      setScreen("home");
      return;
    }

    await fetch("/api/auth/logout", { method: "POST" });
    setAuth((current) => current && { ...current, authenticated: false });
    setPayload(null);
    setSelectedId(null);
    setScreen("home");
    localStorage.removeItem(CACHE_KEY);
    LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  async function disconnectGranola() {
    if (staticMode) {
      setScreen("home");
      return;
    }

    await fetch("/api/granola/disconnect", { method: "POST" });
    await loadMeetings();
  }

  async function installApp() {
    if (!installPrompt) {
      return;
    }

    const prompt = installPrompt as Event & { prompt?: () => Promise<void> };
    await prompt.prompt?.();
    setInstallPrompt(null);
  }

  function selectMeeting(id: string) {
    setSelectedId(id);
    setScreen("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function moveMeeting(direction: "previous" | "next") {
    const currentIndex = filtered.findIndex((meeting) => meeting.id === selected?.id);
    const nextIndex = direction === "previous" ? currentIndex - 1 : currentIndex + 1;
    const nextMeeting = filtered[nextIndex];

    if (!nextMeeting) {
      return;
    }

    selectMeeting(nextMeeting.id);
  }

  function retryGranolaContent(id: string) {
    setGranolaContentLoadingId(null);
    setGranolaContentErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setGranolaContentAttempts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updateAppearance(next: Partial<Appearance>) {
    setAppearance((current) => ({
      ...current,
      ...next
    }));
  }

  if (auth && !auth.authenticated) {
    return (
      <main className="app-shell center-screen" data-theme={appearance.theme} style={themeVars}>
        <section className="login-panel" aria-label="Sign in">
          <div className="login-card">
            <div className="app-mark">
              <ShieldCheck size={28} aria-hidden />
            </div>
            <h1>{APP_NAME}</h1>
            <p>Recent meeting notes from your personal Granola and work Fathom accounts.</p>
            <form onSubmit={login} className="login-form">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <Lock size={17} aria-hidden />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter app password"
                />
              </div>
              <button type="submit">
                <Lock size={17} aria-hidden />
                Sign in
              </button>
            </form>
            {message && <p className="form-error">{message}</p>}
          </div>
          <div className="source-strip" aria-hidden>
            <span className="source-word granola">● Granola</span>
            <span>·</span>
            <span className="source-word fathom">● Fathom</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-theme={appearance.theme} style={themeVars}>
      {screen === "home" && (
        <HomeScreen
          appearance={appearance}
          connectorCounts={connectorCounts}
          deepSearch={deepSearch}
          filtered={filtered}
          installPrompt={installPrompt}
          loading={loading}
          message={message}
          payload={payload}
          query={query}
          selectedId={selected?.id}
          source={source}
          syncStatus={syncStatus}
          installApp={installApp}
          loadMeetings={loadMeetings}
          logout={logout}
          openAccounts={() => setScreen("accounts")}
          selectMeeting={selectMeeting}
          setQuery={setQuery}
          setSource={setSource}
          toggleTheme={() => updateAppearance({ theme: appearance.theme === "dark" ? "light" : "dark" })}
        />
      )}

      {screen === "detail" && (
        <MeetingDetail
          meeting={selected}
          searchQuery={query}
          onBack={() => setScreen("home")}
          onPrevious={() => moveMeeting("previous")}
          onNext={() => moveMeeting("next")}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < filtered.length - 1}
          positionLabel={selectedIndex >= 0 ? `${selectedIndex + 1} of ${filtered.length}` : undefined}
          transcriptLoading={selected ? transcriptLoadingId === selected.id : false}
          transcriptError={selected ? transcriptErrors[selected.id] : undefined}
          granolaContentLoading={selected ? granolaContentLoadingId === selected.id : false}
          granolaContentError={selected ? granolaContentErrors[selected.id] : undefined}
          onRetryGranolaContent={selected ? () => retryGranolaContent(selected.id) : undefined}
        />
      )}

      {screen === "accounts" && (
        <AccountsScreen
          appearance={appearance}
          connectors={payload?.connectors}
          effectiveAccent={effectiveAccent}
          disconnectGranola={disconnectGranola}
          onBack={() => setScreen("home")}
          updateAppearance={updateAppearance}
        />
      )}
    </main>
  );
}

function HomeScreen({
  appearance,
  connectorCounts,
  deepSearch,
  filtered,
  installPrompt,
  loading,
  message,
  payload,
  query,
  selectedId,
  source,
  syncStatus,
  installApp,
  loadMeetings,
  logout,
  openAccounts,
  selectMeeting,
  setQuery,
  setSource,
  toggleTheme
}: {
  appearance: Appearance;
  connectorCounts: { granola: number; fathom: number };
  deepSearch: { query: string; loading: boolean; count: number; error?: string };
  filtered: MeetingNote[];
  installPrompt: Event | null;
  loading: boolean;
  message: string | null;
  payload: MeetingsPayload | null;
  query: string;
  selectedId?: string;
  source: SourceFilter;
  syncStatus: SyncStatus | null;
  installApp: () => Promise<void>;
  loadMeetings: () => Promise<void>;
  logout: () => Promise<void>;
  openAccounts: () => void;
  selectMeeting: (id: string) => void;
  setQuery: (value: string) => void;
  setSource: (value: SourceFilter) => void;
  toggleTheme: () => void;
}) {
  const totalSynced = connectorCounts.granola + connectorCounts.fathom;

  return (
    <section className="screen home-screen" aria-label="Meeting feed">
      <header className="home-header">
        <div className="brand-lockup">
          {appearance.theme === "dark" && (
            <div className="brand-shield">
              <ShieldCheck size={19} aria-hidden />
            </div>
          )}
          <div>
            <h1>{APP_NAME}</h1>
          </div>
        </div>
        <div className="header-actions">
          {installPrompt && (
            <button className="icon-button optional-install" onClick={() => void installApp()} title="Install app" aria-label="Install app">
              <Download size={18} />
            </button>
          )}
          <button className="icon-button" onClick={() => void loadMeetings()} title="Refresh" aria-label="Refresh">
            <RefreshCcw size={18} className={loading ? "spin" : ""} />
          </button>
          <button
            className="icon-button theme-quick-toggle"
            onClick={toggleTheme}
            title={appearance.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={appearance.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            type="button"
          >
            {appearance.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-button account-button" onClick={openAccounts} title="Accounts" aria-label="Accounts">
            <Settings2 size={18} />
          </button>
          <button className="icon-button" onClick={() => void logout()} title="Sign out" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {message && (
        <div className="notice" role="status">
          <CircleAlert size={18} aria-hidden />
          <span>{message}</span>
        </div>
      )}

      {syncStatus && (
        <div className={`sync-status ${syncStatus.tone}`} role="status">
          {syncStatus.tone === "success" ? <CheckCircle2 size={17} aria-hidden /> : <CircleAlert size={17} aria-hidden />}
          <span>{syncStatus.text}</span>
        </div>
      )}

      <button className="week-card" onClick={openAccounts} type="button">
        <span className="week-label">This week</span>
        <span className="week-count">
          <strong>{totalSynced}</strong>
          <span>meetings synced</span>
        </span>
        <span className="week-breakdown">
          <span>
            <i className="source-dot granola" />
            <b>{connectorCounts.granola}</b> Granola
          </span>
          <span>
            <i className="source-dot fathom" />
            <b>{connectorCounts.fathom}</b> Fathom
          </span>
        </span>
      </button>

      <section className="connector-strip" aria-label="Connections">
        <ConnectorCard status={payload?.connectors.granola} source="granola" onClick={openAccounts} />
        <ConnectorCard status={payload?.connectors.fathom} source="fathom" onClick={openAccounts} />
      </section>

      <div className="search-box">
        <Search size={18} aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes, people, topics"
          aria-label="Search meetings"
        />
      </div>
      {deepSearch.loading && <p className="search-status">Searching transcripts...</p>}
      {!deepSearch.loading && deepSearch.count > 0 && deepSearch.query === query.trim() && (
        <p className="search-status">{deepSearch.count} transcript match{deepSearch.count === 1 ? "" : "es"} found.</p>
      )}
      {!deepSearch.loading && deepSearch.error && <p className="search-status error">{deepSearch.error}</p>}

      <div className="segment" aria-label="Source filter">
        <button className={source === "all" ? "active" : ""} onClick={() => setSource("all")} type="button">
          All
        </button>
        <button className={source === "granola" ? "active" : ""} onClick={() => setSource("granola")} type="button">
          Granola
        </button>
        <button className={source === "fathom" ? "active" : ""} onClick={() => setSource("fathom")} type="button">
          Fathom
        </button>
      </div>

      <div className="meeting-list">
        {loading && !payload && <LoadingRows />}
        {!loading && filtered.length === 0 && (deepSearch.loading ? <SearchLoadingState /> : <EmptyState />)}
        {filtered.map((meeting) => (
          <MeetingListItem
            key={meeting.id}
            meeting={meeting}
            selected={selectedId === meeting.id}
            onClick={() => selectMeeting(meeting.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ConnectorCard({
  status,
  source,
  onClick
}: {
  status?: ConnectorStatus;
  source: MeetingSource;
  onClick: () => void;
}) {
  const connected = Boolean(status?.connected);
  const label = source === "granola" ? "Granola" : "Fathom";
  const detail = connected ? status?.email || (source === "granola" ? "granola · personal" : "Connected") : "Tap to connect";

  return (
    <button className={`connector-card ${connected ? "connected" : "needs-work"}`} onClick={onClick} type="button">
      <span className="connector-icon">{connected ? <Check size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}</span>
      <span>
        <strong>{label}</strong>
        <small>{status?.error || detail}</small>
      </span>
    </button>
  );
}

function MeetingListItem({ meeting, selected, onClick }: { meeting: MeetingNote; selected: boolean; onClick: () => void }) {
  const snippet = meetingSnippet(meeting);

  return (
    <button className={`meeting-card ${selected ? "selected" : ""}`} onClick={onClick} type="button">
      <span className={`source-tile ${meeting.source}`} aria-hidden>
        {meeting.source === "granola" ? <Mic size={18} /> : <Video size={18} />}
      </span>
      <span className="meeting-main">
        <span className="meeting-topline">
          <SourceTag source={meeting.source} />
          <span className="meeting-date">{formatShortDate(meeting.occurredAt)}</span>
        </span>
        <strong>{meeting.title}</strong>
        <span className="meeting-snippet">{snippet}</span>
        <span className="meeting-footer">
          <AvatarStack people={meeting.attendees} />
          <span>
            {meeting.attendees.length || 1} {meeting.attendees.length === 1 ? "person" : "people"}
          </span>
        </span>
      </span>
      <ChevronRight className="row-chevron" size={17} aria-hidden />
    </button>
  );
}

function MeetingDetail({
  meeting,
  searchQuery,
  onBack,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  positionLabel,
  transcriptLoading,
  transcriptError,
  granolaContentLoading,
  granolaContentError,
  onRetryGranolaContent
}: {
  meeting: MeetingNote | null;
  searchQuery: string;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  positionLabel?: string;
  transcriptLoading?: boolean;
  transcriptError?: string;
  granolaContentLoading?: boolean;
  granolaContentError?: string;
  onRetryGranolaContent?: () => void;
}) {
  const [detailView, setDetailView] = useState<DetailView>("transcript");

  useEffect(() => {
    setDetailView("transcript");
  }, [meeting?.id]);

  if (!meeting) {
    return (
      <section className="screen detail-screen">
        <DetailTopBar onBack={onBack} />
        <NoSelection />
      </section>
    );
  }

  const hasNotes = Boolean(meeting.summary || meeting.notes);
  const splitSummary = meeting.source === "fathom";
  const recordingUrl = meeting.videoUrl || meeting.sourceUrl;
  const granolaPendingWithoutContent =
    meeting.source === "granola" && !meetingHasReadableContent(meeting) && Boolean(granolaContentLoading || granolaContentError);

  return (
    <section className="screen detail-screen" aria-label="Meeting details">
      <DetailTopBar onBack={onBack} source={meeting.source} />
      <div className="detail-navigation" aria-label="Meeting navigation">
        <button className="nav-icon-button" onClick={onPrevious} type="button" disabled={!hasPrevious} title="Previous meeting" aria-label="Previous meeting">
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span>{positionLabel}</span>
        <button className="nav-icon-button" onClick={onNext} type="button" disabled={!hasNext} title="Next meeting" aria-label="Next meeting">
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      <article className="detail">
        <header className="detail-title-block">
          <h2>{meeting.title}</h2>
          <p className="detail-meta">
            <CalendarDays size={16} aria-hidden />
            {formatFullDate(meeting.occurredAt)}
          </p>
        </header>

        {recordingUrl && (
          <a href={recordingUrl} target="_blank" rel="noreferrer" className="recording-card">
            <span className="play-mark">
              <Play size={19} aria-hidden />
            </span>
            <span>
              <strong>Open recording</strong>
              <small>{meeting.source === "fathom" ? "Watch in Fathom" : "Open source note"}</small>
            </span>
            <ArrowUpRight size={18} aria-hidden />
          </a>
        )}

        {splitSummary && (
          <div className="detail-view-switch" aria-label="Detail view">
            <button className={detailView === "transcript" ? "active" : ""} onClick={() => setDetailView("transcript")} type="button">
              Transcript
            </button>
            <button className={detailView === "summary" ? "active" : ""} onClick={() => setDetailView("summary")} type="button">
              Summary
            </button>
          </div>
        )}

        {(!splitSummary || detailView === "transcript") && (
          <>
            {meeting.attendees.length > 0 && (
              <section className="detail-section">
                <h3>People</h3>
                <div className="people-list">
                  {meeting.attendees.slice(0, 14).map((attendee) => (
                    <span key={attendee}>
                      <Avatar name={attendee} />
                      {attendee}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {meeting.transcript ? (
              <section className="detail-section">
                <h3>Transcript</h3>
                <TranscriptText meeting={meeting} searchQuery={searchQuery} />
              </section>
            ) : transcriptLoading ? (
              <section className="detail-section">
                <h3>Transcript</h3>
                <p className="status-text">Loading transcript...</p>
              </section>
            ) : transcriptError ? (
              <section className="detail-section subtle-section">
                <h3>Transcript</h3>
                <p className="status-text">{transcriptError}</p>
              </section>
            ) : meeting.transcriptPreview.length > 0 ? (
              <section className="detail-section">
                <h3>Transcript Preview</h3>
                <div className="transcript-list preview">
                  {meeting.transcriptPreview.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </section>
            ) : null}

            {meeting.source === "granola" && granolaContentLoading && !hasNotes && !meeting.transcript && meeting.transcriptPreview.length === 0 && (
              <section className="detail-section subtle-section">
                <h3>Notes</h3>
                <p className="status-text">Loading Granola notes...</p>
                {onRetryGranolaContent && (
                  <button className="secondary-action retry-action" onClick={onRetryGranolaContent} type="button">
                    <RefreshCcw size={16} aria-hidden />
                    Retry Granola
                  </button>
                )}
              </section>
            )}

            {meeting.source === "granola" && granolaContentError && !granolaContentLoading && !hasNotes && !meeting.transcript && meeting.transcriptPreview.length === 0 && (
              <section className="detail-section subtle-section">
                <h3>Notes</h3>
                <p className="status-text">{granolaContentError}</p>
                {onRetryGranolaContent && (
                  <button className="secondary-action retry-action" onClick={onRetryGranolaContent} type="button">
                    <RefreshCcw size={16} aria-hidden />
                    Retry Granola
                  </button>
                )}
              </section>
            )}
          </>
        )}

        {(!splitSummary || detailView === "summary") && !granolaPendingWithoutContent && <MeetingSummarySections meeting={meeting} />}
      </article>
    </section>
  );
}

function DetailTopBar({ onBack, source }: { onBack: () => void; source?: MeetingSource }) {
  return (
    <nav className="detail-topbar" aria-label="Detail navigation">
      <button className="icon-button" onClick={onBack} type="button" aria-label="Back to meetings">
        <ChevronLeft size={19} aria-hidden />
      </button>
      {source && <SourceTag source={source} />}
    </nav>
  );
}

function MeetingSummarySections({ meeting }: { meeting: MeetingNote }) {
  const hasSummaryContent = Boolean(
    meeting.actionItems.length ||
      meeting.summary ||
      (meeting.notes && meeting.notes !== meeting.summary) ||
      (!meeting.summary && !meeting.notes && meeting.contentStatus)
  );

  if (!hasSummaryContent) {
    return (
      <section className="detail-section subtle-section">
        <h3>Summary</h3>
        <p className="status-text">No summary content was returned for this meeting yet.</p>
      </section>
    );
  }

  return (
    <>
      {meeting.actionItems.length > 0 && (
        <section className="detail-section">
          <h3>Action Items</h3>
          <ul className="action-list">
            {dedupe(meeting.actionItems).map((item) => (
              <li key={item}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>
        </section>
      )}

      {meeting.summary && (
        <section className="detail-section">
          <h3>Summary</h3>
          <MarkdownText text={meeting.summary} />
        </section>
      )}

      {meeting.notes && meeting.notes !== meeting.summary && (
        <section className="detail-section">
          <h3>Notes</h3>
          <MarkdownText text={meeting.notes} />
        </section>
      )}

      {!meeting.summary && !meeting.notes && meeting.contentStatus && (
        <section className="detail-section">
          <h3>Notes</h3>
          <p className="status-text">{formatContentStatus(meeting.contentStatus)}</p>
        </section>
      )}
    </>
  );
}

function AccountsScreen({
  appearance,
  connectors,
  effectiveAccent,
  disconnectGranola,
  onBack,
  updateAppearance
}: {
  appearance: Appearance;
  connectors?: MeetingsPayload["connectors"];
  effectiveAccent: string;
  disconnectGranola: () => Promise<void>;
  onBack: () => void;
  updateAppearance: (next: Partial<Appearance>) => void;
}) {
  const granolaConnected = Boolean(connectors?.granola.connected);
  const fathomConnected = Boolean(connectors?.fathom.connected);

  return (
    <section className="screen accounts-screen" aria-label="Accounts">
      <header className="accounts-header">
        <button className="icon-button" onClick={onBack} type="button" aria-label="Back to meetings">
          <ChevronLeft size={19} aria-hidden />
        </button>
        <div>
          <h1>Accounts</h1>
        </div>
      </header>

      <div className={`account-card ${granolaConnected ? "connected" : "needs-work"}`}>
        <div className="account-row">
          <span className="account-icon">{granolaConnected ? <Check size={20} /> : <CircleAlert size={20} />}</span>
          <span>
            <strong>Granola personal</strong>
            <small>{granolaConnected ? connectors?.granola.email || "granola · personal" : "Not connected"}</small>
          </span>
        </div>
        {granolaConnected ? (
          <button className="secondary-action" onClick={() => void disconnectGranola()} type="button">
            <Unplug size={16} aria-hidden />
            Disconnect Granola
          </button>
        ) : (
          <a className="primary-action" href="/api/granola/connect">
            <ShieldCheck size={16} aria-hidden />
            Connect Granola personal
          </a>
        )}
      </div>

      <div className={`account-card ${fathomConnected ? "connected" : "needs-work"}`}>
        <div className="account-row">
          <span className="account-icon">{fathomConnected ? <Check size={20} /> : <CircleAlert size={20} />}</span>
          <span>
            <strong>Fathom work</strong>
            <small>{connectors?.fathom.error || connectors?.fathom.email || (fathomConnected ? "Connected" : "Add FATHOM_API_KEY")}</small>
          </span>
        </div>
      </div>

      <section className="appearance-card" aria-label="Appearance">
        <div className="appearance-heading">
          <SlidersHorizontal size={18} aria-hidden />
          <span>Tweaks</span>
        </div>

        <div className="appearance-row">
          <span>
            <b>Appearance</b>
            <small>{appearance.theme === "dark" ? "Meridian dark" : "Beacon light"}</small>
          </span>
          <button
            className="theme-toggle"
            onClick={() => updateAppearance({ theme: appearance.theme === "dark" ? "light" : "dark" })}
            type="button"
            aria-label="Toggle dark mode"
          >
            {appearance.theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
            {appearance.theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>

        <div className="appearance-control">
          <label>
            <Palette size={16} aria-hidden />
            Accent
          </label>
          <div className="accent-grid">
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                className={effectiveAccent.toLowerCase() === accent.toLowerCase() && appearance.accent !== "auto" ? "selected" : ""}
                style={{ backgroundColor: accent }}
                onClick={() => updateAppearance({ accent })}
                type="button"
                aria-label={`Use accent ${accent}`}
              >
                {effectiveAccent.toLowerCase() === accent.toLowerCase() && appearance.accent !== "auto" && <Check size={16} />}
              </button>
            ))}
          </div>
          <button className="auto-accent" onClick={() => updateAppearance({ accent: "auto" })} type="button">
            Match mode automatically
          </button>
        </div>

        <div className="appearance-control">
          <label htmlFor="corner-radius">
            <SlidersHorizontal size={16} aria-hidden />
            Corner roundness <span>{appearance.radius}px</span>
          </label>
          <input
            id="corner-radius"
            type="range"
            min={2}
            max={28}
            value={appearance.radius}
            onChange={(event) => updateAppearance({ radius: Number(event.target.value) })}
          />
        </div>
      </section>

      <div className="account-empty-panel">
        <span>{granolaConnected ? <CheckCircle2 size={25} aria-hidden /> : <Plug size={25} aria-hidden />}</span>
        <strong>{granolaConnected ? "All set — notes are syncing" : "Connect Granola to fill this in"}</strong>
        <p>{granolaConnected ? "Personal notes now appear alongside Fathom in your feed." : "Your personal notes will appear here alongside Fathom once linked."}</p>
      </div>
    </section>
  );
}

function SourceTag({ source }: { source: MeetingSource }) {
  return (
    <span className={`source-tag ${source}`}>
      <i className={`source-dot ${source}`} aria-hidden />
      {source}
    </span>
  );
}

function AvatarStack({ people }: { people: string[] }) {
  const visiblePeople = people.slice(0, 3);
  if (!visiblePeople.length) {
    return (
      <span className="avatar-stack">
        <Avatar name="Meeting" />
      </span>
    );
  }

  return (
    <span className="avatar-stack">
      {visiblePeople.map((person) => (
        <Avatar key={person} name={person} />
      ))}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return <span className="avatar">{initials(name)}</span>;
}

function TranscriptText({ meeting, searchQuery }: { meeting: MeetingNote; searchQuery: string }) {
  const lines = parseTranscriptLines(meeting.transcript || "");

  return (
    <div className="transcript-list">
      {lines.map((line, index) => (
        <div key={`${line.speaker || "line"}-${index}`} className="transcript-line">
          <span className={`speaker-rail ${meeting.source}`} aria-hidden />
          <div>
            {line.speaker && <strong>{line.speaker}</strong>}
            <p>{renderHighlightedTranscriptText(line.text, searchQuery)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

type MarkdownBlock =
  | {
      type: "heading";
      depth: number;
      text: string;
    }
  | {
      type: "list";
      items: string[];
    }
  | {
      type: "paragraph";
      text: string;
    };

function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="markdown-text">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h4 key={`${block.type}-${index}`} className={`md-heading depth-${Math.min(block.depth, 4)}`}>
              {renderInlineMarkdown(block.text)}
            </h4>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={`${block.type}-${index}`} className="md-list">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return <p key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

function parseMarkdownBlocks(text: string) {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({
        type: "paragraph",
        text: paragraph.join(" ")
      });
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length) {
      blocks.push({
        type: "list",
        items: list
      });
      list = [];
    }
  }

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        depth: heading[1].length,
        text: heading[2]
      });
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInlineMarkdown(text: string) {
  const pieces = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);

  return pieces.map((piece, index) => {
    const link = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={`${piece}-${index}`} href={link[2]} target="_blank" rel="noreferrer">
          {renderInlineMarkdown(link[1])}
        </a>
      );
    }

    const bold = piece.match(/^\*\*([^*]+)\*\*$/);
    return bold ? <strong key={`${piece}-${index}`}>{bold[1]}</strong> : piece;
  });
}

function renderHighlightedTranscriptText(text: string, query: string) {
  const tokens = highlightTokens(query);
  if (!tokens.length) {
    return text;
  }

  const matcher = new RegExp(`\\b(${tokens.map(escapeRegExp).join("|")})\\b`, "gi");
  const parts = text.split(matcher);

  return parts.map((part, index) =>
    tokens.some((token) => token.toLowerCase() === part.toLowerCase()) ? (
      <mark key={`${part}-${index}`} className="transcript-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <FileText size={28} aria-hidden />
      <h2>No meetings found</h2>
      <p>Connect Granola, add your Fathom API key, or loosen the current search/filter.</p>
    </div>
  );
}

function NoSelection() {
  return (
    <div className="empty-state detail-empty">
      <FileText size={32} aria-hidden />
      <h2>Select a meeting</h2>
      <p>Recent notes and video links will appear here.</p>
    </div>
  );
}

function SearchLoadingState() {
  return (
    <div className="empty-state">
      <Search size={28} aria-hidden />
      <h2>Searching transcripts</h2>
      <p>Checking spoken words from recent Fathom recordings.</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </>
  );
}

function mergeMeetingPayload(fresh: MeetingsPayload, current: MeetingsPayload | null) {
  if (!current) {
    return fresh;
  }

  const currentById = new Map(current.meetings.map((meeting) => [meeting.id, meeting]));
  return {
    ...fresh,
    meetings: fresh.meetings.map((meeting) => {
      const cached = currentById.get(meeting.id);
      if (cached && meetingHasReadableContent(cached) && !meetingHasReadableContent(meeting)) {
        return mergeMeeting(meeting, cached);
      }

      if (!cached?.transcript || meeting.transcript) {
        return meeting;
      }

      return {
        ...meeting,
        transcript: cached.transcript,
        transcriptPreview: cached.transcriptPreview
      };
    })
  };
}

function upsertMeetingPayload(current: MeetingsPayload | null, matches: MeetingNote[]) {
  if (!current) {
    return current;
  }

  const matchesById = new Map(matches.map((meeting) => [meeting.id, meeting]));
  const seen = new Set<string>();
  const mergedMeetings = current.meetings.map((meeting) => {
    const match = matchesById.get(meeting.id);
    seen.add(meeting.id);
    return match ? mergeMeeting(meeting, match) : meeting;
  });

  for (const match of matches) {
    if (!seen.has(match.id)) {
      mergedMeetings.push(match);
    }
  }

  return {
    ...current,
    meetings: mergedMeetings.sort((left, right) => {
      return new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime();
    })
  };
}

function mergeMeeting(current: MeetingNote, incoming: MeetingNote): MeetingNote {
  const incomingHasReadableContent = meetingHasReadableContent(incoming);

  return {
    ...current,
    ...incoming,
    summary: incoming.summary || current.summary,
    notes: incoming.notes || current.notes,
    contentStatus: incomingHasReadableContent ? undefined : incoming.contentStatus || current.contentStatus,
    actionItems: incoming.actionItems.length ? incoming.actionItems : current.actionItems,
    transcript: incoming.transcript || current.transcript,
    transcriptPreview: incoming.transcriptPreview.length ? incoming.transcriptPreview : current.transcriptPreview,
    videoUrl: incoming.videoUrl || current.videoUrl,
    sourceUrl: incoming.sourceUrl || current.sourceUrl
  };
}

function syncStatusFromPayload(payload: MeetingsPayload): SyncStatus {
  const granolaError = payload.connectors.granola.error;
  const fathomError = payload.connectors.fathom.error;
  const granolaCount = payload.meetings.filter((meeting) => meeting.source === "granola").length;
  const fathomCount = payload.meetings.filter((meeting) => meeting.source === "fathom").length;
  const timestamp = formatRefreshTime(new Date());

  if (granolaError || fathomError) {
    return {
      tone: "warning",
      text: [
        `Refreshed ${timestamp}.`,
        `Granola: ${granolaError || `${granolaCount} meetings`}.`,
        `Fathom: ${fathomError || `${fathomCount} meetings`}.`
      ].join(" ")
    };
  }

  return {
    tone: "success",
    text: `Refreshed ${timestamp}. Granola: ${granolaCount} meetings. Fathom: ${fathomCount} meetings.`
  };
}

function meetingMatchesQuery(meeting: MeetingNote, query: string) {
  const normalizedMeeting = normalizeSearchText(meetingSearchText(meeting));
  const normalizedQuery = normalizeSearchText(query);
  const collapsedMeeting = collapseSearchText(normalizedMeeting);
  const collapsedQuery = collapseSearchText(normalizedQuery);
  const queryTokens = searchTokens(normalizedQuery);

  return (
    normalizedMeeting.includes(normalizedQuery) ||
    collapsedMeeting.includes(collapsedQuery) ||
    (queryTokens.length > 0 &&
      queryTokens.every((token) => normalizedMeeting.includes(token) || collapsedMeeting.includes(collapseSearchText(token))))
  );
}

function meetingSearchText(meeting: MeetingNote) {
  return [
    meeting.title,
    meeting.summary,
    meeting.notes,
    meeting.contentStatus,
    meeting.transcript,
    meeting.attendees.join(" "),
    meeting.actionItems.join(" "),
    meeting.transcriptPreview.join(" ")
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseSearchText(value: string) {
  return value.replace(/\s/g, "");
}

function searchTokens(value: string) {
  return value.split(" ").filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

function highlightTokens(query: string) {
  const rawTokens = uniqueTokens(normalizeSearchText(query).split(" ").filter((token) => token.length > 1));
  if (!rawTokens.length) {
    return [];
  }

  const meaningfulTokens = rawTokens.filter((token) => !SEARCH_STOP_WORDS.has(token));
  return (meaningfulTokens.length ? meaningfulTokens : rawTokens).sort((left, right) => right.length - left.length);
}

function uniqueTokens(tokens: string[]) {
  return Array.from(new Set(tokens));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function meetingSnippet(meeting: MeetingNote) {
  const source = meeting.summary || meeting.notes || meeting.transcriptPreview.join(" ") || meeting.actionItems.join(" ") || meeting.contentStatus;
  return stripMarkdown(source || "No preview available yet.");
}

function meetingHasReadableContent(meeting: MeetingNote) {
  return Boolean(meeting.summary || meeting.notes || meeting.actionItems.length || meeting.transcript || meeting.transcriptPreview.length);
}

function stripMarkdown(value: string) {
  return value
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTranscriptLines(transcript: string): TranscriptLine[] {
  return transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]{1,80}):\s*(.+)$/);
      if (!match) {
        return { text: line };
      }

      return {
        speaker: match[1],
        text: match[2]
      };
    });
}

function countSources(meetings: MeetingNote[]) {
  return meetings.reduce(
    (counts, meeting) => ({
      ...counts,
      [meeting.source]: counts[meeting.source] + 1
    }),
    { granola: 0, fathom: 0 } satisfies Record<MeetingSource, number>
  );
}

function initials(name: string) {
  const trimmed = name.replace(/<[^>]+>/g, "").trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return (parts.length ? parts : ["M"])
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatShortDate(value?: string) {
  if (!value) {
    return "Recent";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.split(",")[0] || value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatFullDate(value?: string) {
  if (!value) {
    return "Recent";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatRefreshTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatContentStatus(value: string) {
  if (/MCP error|Input validation error|meeting_ids|meeting_id/i.test(value)) {
    return "Granola returned the meeting metadata, but the note/transcript content fetch did not return usable content. Refresh once to retry with the corrected connector.";
  }

  return value;
}

function onAccentFor(hex: string) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  return luminance > 0.55 ? "#08160F" : "#FFFFFF";
}

function readInitialAppearance(): Appearance {
  if (typeof window === "undefined") {
    return {
      theme: "light",
      accent: "auto",
      radius: 16
    };
  }

  const cached = localStorage.getItem(APPEARANCE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Partial<Appearance>;
      return {
        theme: parsed.theme === "dark" ? "dark" : "light",
        accent: typeof parsed.accent === "string" ? parsed.accent : "auto",
        radius: typeof parsed.radius === "number" ? Math.min(28, Math.max(2, parsed.radius)) : 16
      };
    } catch {
      localStorage.removeItem(APPEARANCE_KEY);
    }
  }

  return {
    theme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    accent: "auto",
    radius: 16
  };
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js");
    });
  }
}
