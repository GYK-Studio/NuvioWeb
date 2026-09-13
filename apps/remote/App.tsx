import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  BackHandler,
  StatusBar,
  Platform,
  Image,
  Linking
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Connection } from "./connection";
import { emptySession, sessionEvent } from "./session";
import { RangeControl } from "./RangeControl";

const APP_VERSION = "0.1.3";
const UPDATE_CHECK_URL = "https://api.github.com/GYK-Studio/NuvioWeb/releases/latest";
const compareVersions = (latest: string, current: string) => {
  const parse = (value: string) =>
    String(value || "")
      .replace(/^v/i, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  }
  return 0;
};
const clock = (seconds: number) => {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
const commandError: Record<string, string> = {
  TIMEOUT: "La web no confirmó la orden. Comprueba el resultado antes de repetirla.",
  LOCAL_INTERACTION_REQUIRED: "Pulsa una vez el reproductor en la web para permitir esta acción.",
  NO_SOURCE: "Elige primero una fuente de vídeo.",
  STALE_STATE: "La pantalla cambió. Actualiza el estado y selecciona de nuevo.",
  UNAUTHORIZED: "No tienes el control. Autoriza este teléfono desde la web.",
  SESSION_OFFLINE: "La web está desconectada.",
  UNSUPPORTED_CAPABILITY:
    "La web no puede hacer eso aquí (sin campo de texto o vista no compatible)."
};
const kindLabel: Record<string, string> = {
  movie: "Película",
  series: "Serie",
  tv: "TV"
};

export default function App() {
  const [status, setStatus] = useState("Empareja tu navegador"),
    [base, setBase] = useState("https://remote.gykstudio.tech"),
    [code, setCode] = useState(""),
    [query, setQuery] = useState(""),
    [scan, setScan] = useState(false),
    [busy, setBusy] = useState(false);
  const [deviceName, setDeviceName] = useState("Mi teléfono");
  const [session, setSession] = useState(emptySession);
  const [savedSessions, setSavedSessions] = useState<
    Array<{
      deviceId: string;
      name: string;
      base: string;
      active: boolean;
      expiresAt: number;
      online?: boolean;
      lastSeen?: number;
    }>
  >([]);
  const [tab, setTab] = useState<"remote" | "browse" | "keyboard" | "connection">("remote");
  const [advanced, setAdvanced] = useState(false);
  const [torch, setTorch] = useState(false);
  const [keyboardText, setKeyboardText] = useState("");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(UPDATE_CHECK_URL, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok || cancelled) return;
        const release = await response.json();
        const latest = String(release?.tag_name || release?.name || "");
        const apk = Array.isArray(release?.assets)
          ? release.assets.find((asset: any) => String(asset?.name || "").endsWith(".apk"))
          : null;
        const url = String(apk?.browser_download_url || release?.html_url || "");
        if (latest && url && compareVersions(latest, APP_VERSION) > 0) {
          setUpdateInfo({ version: latest.replace(/^v/i, ""), url });
        }
      } catch {
        // Sin red o sin releases: la app sigue funcionando igual.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [now, setNow] = useState(Date.now());
  const [snapshotAt, setSnapshotAt] = useState(Date.now());
  const [feedback, setFeedback] = useState("");
  const state = session.snapshot || {
    available: false,
    position: 0,
    duration: 0,
    volume: 1,
    muted: false
  };
  const canControl = session.approved && session.online && session.active && session.synchronized;
  const position = Math.min(
    state.duration || Infinity,
    Math.max(
      0,
      (state.position || 0) +
        (session.online && state.playing && !state.buffering
          ? (Math.max(0, now - snapshotAt) / 1000) * (state.rate || 1)
          : 0)
    )
  );
  const [permission, requestPermission] = useCameraPermissions();
  const connection = useRef<Connection | null>(null);
  if (!connection.current)
    connection.current = new Connection((m) => {
      if (m.type === "links") setSavedSessions(m.sessions);
      setSession((previous) => sessionEvent(previous, m));
      if (m.type === "session.snapshot") {
        setSnapshotAt(Date.now());
        setStatus(
          m.webOnline === false
            ? "La web está desconectada"
            : m.controlActive === false
              ? "Conectado · otro móvil tiene el control"
              : m.state
                ? "Conectado"
                : "Aprobado · esperando el estado de la web"
        );
      } else if (m.type === "paired")
        setStatus("Solicitud enviada. Aprueba este teléfono en la web.");
      else if (m.type === "connected" && !m.approved) setStatus("Esperando aprobación en la web");
      else if (m.type === "approved") setStatus("Autorizado. Sincronizando…");
      else if (m.type === "suspended")
        setStatus("El perfil cambió. Confirma de nuevo este móvil en la web.");
      else if (m.type === "control.changed")
        setStatus(
          m.controlActive
            ? "Tienes el control"
            : "Otro móvil tiene el control. Puedes recuperarlo desde la web."
        );
      else if (m.type === "offline") {
        setStatus("Sin conexión. Reconectando…");
      } else if (m.type === "revoked") {
        setStatus("Vínculo caducado o revocado");
      } else if (m.type === "command.result")
        setFeedback(
          m.status === "completed"
            ? "Acción completada"
            : m.status === "accepted"
              ? "Orden enviada"
              : commandError[m.error] || `No se pudo ejecutar: ${m.error}`
        );
      else if (m.type === "error") setStatus(`Error: ${m.error}`);
    });
  const c = connection.current;
  const previousRoute = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.content?.route === "player" && previousRoute.current !== "player") setTab("remote");
    previousRoute.current = state.content?.route;
  }, [state.content?.route]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (scan) {
        setScan(false);
        return true;
      }
      if (tab !== "remote") {
        setTab("remote");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [scan, tab]);
  useEffect(() => {
    void c.restore().catch(() => setStatus("No se pudo recuperar la sesión"));
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void c.restore().catch(() => setStatus("No se pudo recuperar la sesión"));
      else {
        setScan(false);
        c.disconnect();
      }
    });
    return () => {
      sub.remove();
      c.disconnect();
    };
  }, []);
  const action = (type: string, payload: Record<string, unknown> = {}) => {
    try {
      c.command(type, payload);
      setFeedback("Orden enviada…");
    } catch (e) {
      setFeedback((e as Error).message);
    }
  };
  const button = (label: string, onPress: () => void, disabled = false, command = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || (command && !canControl) }}
      disabled={disabled || (command && !canControl)}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        (disabled || (command && !canControl)) && styles.disabled
      ]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  const repeatTimers = useRef<{
    delay?: ReturnType<typeof setTimeout>;
    tick?: ReturnType<typeof setInterval>;
  }>({});
  const stopRepeat = () => {
    if (repeatTimers.current.delay) clearTimeout(repeatTimers.current.delay);
    if (repeatTimers.current.tick) clearInterval(repeatTimers.current.tick);
    repeatTimers.current = {};
  };
  useEffect(() => stopRepeat, []);
  // Mantener pulsado repite la orden: el D-pad deja de sentirse "tosco".
  const startRepeat = (type: string, payload: Record<string, unknown> = {}) => {
    stopRepeat();
    action(type, payload);
    repeatTimers.current.delay = setTimeout(() => {
      repeatTimers.current.tick = setInterval(() => action(type, payload), 140);
    }, 420);
  };
  const dpad = (
    <View style={styles.dpad} accessibilityLabel="Controles de navegación">
      {[
        { symbol: "↑", label: "Subir", command: "navigation.up", placement: styles.dpadUp },
        {
          symbol: "←",
          label: "Ir a la izquierda",
          command: "navigation.left",
          placement: styles.dpadLeft
        },
        {
          symbol: "OK",
          label: "Seleccionar",
          command: "navigation.select",
          placement: styles.dpadSelect
        },
        {
          symbol: "→",
          label: "Ir a la derecha",
          command: "navigation.right",
          placement: styles.dpadRight
        },
        { symbol: "↓", label: "Bajar", command: "navigation.down", placement: styles.dpadDown }
      ].map(({ symbol, label, command, placement }) => (
        <Pressable
          key={String(command)}
          accessibilityRole="button"
          accessibilityLabel={`${String(label)} (mantén para repetir)`}
          accessibilityState={{ disabled: !canControl }}
          disabled={!canControl}
          onPressIn={() => canControl && startRepeat(String(command))}
          onPressOut={stopRepeat}
          style={({ pressed }) => [
            styles.dpadButton,
            placement,
            command === "navigation.select" && styles.dpadSelectButton,
            pressed && styles.pressed,
            !canControl && styles.disabled
          ]}
        >
          <Text style={command === "navigation.select" ? styles.dpadSelectText : styles.dpadSymbol}>
            {String(symbol)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const scrollRow = (
    <View style={styles.row}>
      {button("Página ↑", () => action("navigation.scrollUp"), false, true)}
      {button("Página ↓", () => action("navigation.scrollDown"), false, true)}
    </View>
  );
  const tabBar = (
    <View style={styles.tabs}>
      {(
        [
          ["remote", "Mando", "⌁"],
          ["browse", "Explorar", "⌕"],
          ["keyboard", "Teclado", "⌨"],
          ["connection", "Conexión", "◎"]
        ] as const
      ).map(([id, label, icon]) => (
        <Pressable
          key={id}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === id }}
          onPress={() => {
            setTab(id);
            setScan(false);
            setTorch(false);
          }}
          style={[styles.tab, tab === id && styles.tabActive]}
        >
          <Text style={[styles.tabIcon, tab === id && styles.tabTextActive]}>{icon}</Text>
          <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" backgroundColor="#090B10" />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <View style={styles.brandIconFrame}>
              <Image
                source={require("./assets/icon.png")}
                style={styles.brandIcon}
                accessible={false}
              />
            </View>
            <View>
              <Text style={styles.brand}>Nuvio Remote</Text>
              <View style={styles.brandStatusRow}>
                <View style={[styles.tinyDot, session.online && styles.tinyDotOnline]} />
                <Text style={styles.version}>
                  {canControl ? "Sincronizado" : session.paired ? "Vinculado" : `v${APP_VERSION}`}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.connectionPill, canControl && styles.connectionPillOnline]}>
            <View style={[styles.connectionDot, canControl && styles.connectionDotOnline]} />
            <Text style={styles.connectionPillText}>
              {canControl
                ? c.grant?.sessionName || "Online"
                : session.paired
                  ? "En espera"
                  : "Sin vincular"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        key={`${tab}:${session.paired ? "paired" : "pairing"}`}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!feedback && (
          <View style={styles.feedbackBanner}>
            <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>
              {feedback}
            </Text>
          </View>
        )}

        {!!updateInfo && (
          <View style={[styles.surface, styles.updateBanner]}>
            <View style={styles.sectionTitleRow}>
              <View>
                <Text style={styles.eyebrow}>ACTUALIZACIÓN</Text>
                <Text style={styles.sectionTitle}>Versión {updateInfo.version} disponible</Text>
              </View>
              <Text style={styles.miniBadge}>v{APP_VERSION}</Text>
            </View>
            <Text style={styles.copy}>
              Descarga la nueva APK e instálala encima de esta versión.
            </Text>
            {button("Descargar actualización", () => {
              void Linking.openURL(updateInfo.url).catch(() =>
                setStatus("No se pudo abrir la descarga.")
              );
            })}
          </View>
        )}

        {!session.paired ? (
          <>
            <View style={styles.screenHeading}>
              <Text style={styles.eyebrow}>CONEXIÓN SEGURA</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Vincular con Nuvio Web
              </Text>
              <Text style={styles.copy}>
                Abre Ajustes → Control desde móvil en Nuvio Web y escanea el código QR o introduce
                el token de sincronización.
              </Text>
            </View>

            <View style={[styles.surface, styles.pairingCard]}>
              <View style={styles.pairVisual}>
                {scan ? (
                  <CameraView
                    style={styles.qrCamera}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    enableTorch={torch}
                    onBarcodeScanned={({ data }) => {
                      if (/^[A-F0-9]{32}$/.test(data)) {
                        setCode(data);
                        setScan(false);
                        setTorch(false);
                        setStatus("Código leído. Pulsa Vincular pantalla.");
                      } else setStatus("Este QR no es un código de Nuvio Remote.");
                    }}
                  />
                ) : (
                  <View style={styles.pairVisualCenter}>
                    <Text style={styles.pairVisualIcon}>⌗</Text>
                    <Text style={styles.pairVisualText}>Escanear QR</Text>
                  </View>
                )}
                <View pointerEvents="none" style={styles.qrCornerTopLeft} />
                <View pointerEvents="none" style={styles.qrCornerTopRight} />
                <View pointerEvents="none" style={styles.qrCornerBottomLeft} />
                <View pointerEvents="none" style={styles.qrCornerBottomRight} />
              </View>

              <View style={styles.inlineActions}>
                {button(scan ? "Cerrar cámara" : "Abrir cámara", () => {
                  if (scan) {
                    setScan(false);
                    setTorch(false);
                    return;
                  }
                  void (async () => {
                    const p = permission?.granted ? permission : await requestPermission();
                    if (p.granted) setScan(true);
                    else setStatus("Puedes introducir el código manualmente.");
                  })();
                })}
                {scan &&
                  button(torch ? "Apagar linterna" : "Encender linterna", () =>
                    setTorch((value) => !value)
                  )}
              </View>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>O INTRODUCE EL CÓDIGO MANUAL</Text>
                <View style={styles.divider} />
              </View>

              <Text style={styles.fieldLabel}>Código de vinculación</Text>
              <TextInput
                accessibilityLabel="Código de emparejamiento"
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={64}
                placeholder="NV-XXXX-XXXX-XXXX"
                placeholderTextColor="#6F7482"
              />

              <Text style={styles.fieldLabel}>Nombre de este dispositivo</Text>
              <TextInput
                accessibilityLabel="Nombre de este móvil"
                style={styles.input}
                value={deviceName}
                onChangeText={setDeviceName}
                maxLength={60}
                placeholder="Mi teléfono"
                placeholderTextColor="#6F7482"
              />

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  if (!/^[A-F0-9]{32}$/i.test(code.replace(/\s/g, ""))) {
                    setStatus("Introduce el código de 32 caracteres que aparece en la web.");
                    return;
                  }
                  setBusy(true);
                  void c
                    .claim(base.trim(), code.replace(/\s/g, ""), deviceName)
                    .catch((e) => setStatus(e.message))
                    .finally(() => setBusy(false));
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  busy && styles.disabled
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {busy ? "Vinculando…" : "Vincular pantalla"}
                </Text>
                <Text style={styles.primaryButtonArrow}>→</Text>
              </Pressable>

              <Pressable onPress={() => setAdvanced(!advanced)} style={styles.textAction}>
                <Text style={styles.textActionLabel}>
                  {advanced ? "Ocultar servidor" : "Configurar servidor"}
                </Text>
              </Pressable>

              {advanced && (
                <View style={styles.advancedPanel}>
                  <Text style={styles.fieldLabel}>Servidor de sincronización</Text>
                  <TextInput
                    accessibilityLabel="URL del servicio de control"
                    style={styles.input}
                    value={base}
                    onChangeText={setBase}
                    placeholder="https://tu-servicio-remoto"
                    placeholderTextColor="#6F7482"
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
              )}
            </View>

            {!!savedSessions.length && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Mis pantallas guardadas</Text>
                  <Text style={styles.countBadge}>{savedSessions.length}</Text>
                </View>
                {savedSessions.map((link) => (
                  <View key={link.deviceId} style={[styles.surface, styles.savedScreenCard]}>
                    <View style={styles.savedScreenIcon}>
                      <Text style={styles.savedScreenIconText}>▣</Text>
                    </View>
                    <View style={styles.savedScreenBody}>
                      <Text style={styles.mediaTitle}>{link.name}</Text>
                      <Text style={styles.copySmall}>
                        {link.online === undefined
                          ? "Estado sin comprobar"
                          : link.online
                            ? "En línea"
                            : "Desconectada"}
                      </Text>
                    </View>
                    <Pressable
                      disabled={link.active}
                      onPress={() =>
                        void c.selectSaved(link.deviceId).catch((e) => setStatus(e.message))
                      }
                      style={[styles.smallAction, link.active && styles.smallActionActive]}
                    >
                      <Text style={styles.smallActionText}>
                        {link.active ? "Conectada" : "Conectar"}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : !session.approved ? (
          <View style={[styles.surface, styles.waitingCard]}>
            <Text style={styles.eyebrow}>AUTORIZACIÓN PENDIENTE</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Confirma este mando en Nuvio Web
            </Text>
            <Text style={styles.copy}>
              La solicitud ya está enviada. Aprueba este dispositivo desde Ajustes → Control desde
              móvil.
            </Text>
            {button("Comprobar conexión", () => c.sync())}
          </View>
        ) : (
          <>
            {tab === "remote" && (
              <>
                <View style={[styles.surface, styles.nowPlayingCard]}>
                  <View style={styles.nowPlayingTop}>
                    <View>
                      <Text style={styles.eyebrow}>
                        {state.available ? "REPRODUCIENDO" : "EN TU PANTALLA"}
                      </Text>
                      <Text style={styles.mediaTitleLarge}>
                        {state.content?.title || "Sin vídeo activo"}
                      </Text>
                      {!!state.content?.description && (
                        <Text style={styles.copySmall}>{state.content.description}</Text>
                      )}
                    </View>
                    <View style={[styles.statusBadge, state.available && styles.statusBadgeActive]}>
                      <Text style={styles.statusBadgeText}>
                        {state.buffering
                          ? "Cargando"
                          : state.playing
                            ? "Play"
                            : state.available
                              ? "Pausa"
                              : "Idle"}
                      </Text>
                    </View>
                  </View>

                  <RangeControl
                    label="Posición"
                    value={position}
                    max={state.duration}
                    disabled={!canControl || !state.available}
                    onChange={(positionSeconds) => action("player.seek", { positionSeconds })}
                  />
                  <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{clock(position)}</Text>
                    <Text style={styles.timeText}>
                      -{clock(Math.max(0, state.duration - position))}
                    </Text>
                  </View>

                  <View style={styles.playbackControls}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retroceder 10 segundos"
                      disabled={!canControl || !state.available}
                      onPress={() =>
                        action("player.seek", { positionSeconds: Math.max(0, position - 10) })
                      }
                      style={({ pressed }) => [
                        styles.circleControl,
                        pressed && styles.pressed,
                        (!canControl || !state.available) && styles.disabled
                      ]}
                    >
                      <Text style={styles.circleControlText}>↶</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={state.playing ? "Pausar" : "Reproducir"}
                      accessibilityState={{ disabled: !canControl || !state.available }}
                      disabled={!canControl || !state.available}
                      onPress={() => action(state.playing ? "player.pause" : "player.play")}
                      style={({ pressed }) => [
                        styles.mainPlayButton,
                        pressed && styles.pressed,
                        (!canControl || !state.available) && styles.disabled
                      ]}
                    >
                      <Text style={styles.mainPlaySymbol}>{state.playing ? "Ⅱ" : "▶"}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Avanzar 10 segundos"
                      disabled={!canControl || !state.available}
                      onPress={() =>
                        action("player.seek", {
                          positionSeconds: Math.min(state.duration, position + 10)
                        })
                      }
                      style={({ pressed }) => [
                        styles.circleControl,
                        pressed && styles.pressed,
                        (!canControl || !state.available) && styles.disabled
                      ]}
                    >
                      <Text style={styles.circleControlText}>↷</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.remoteQuickActions}>
                  {button("← Volver", () => action("navigation.back"), false, true)}
                  {button("Página", () => action("navigation.scrollDown"), false, true)}
                  {button("⌂ Inicio", () => action("navigation.home"), false, true)}
                </View>
                <View style={styles.remoteDestinationActions}>
                  {button("Biblioteca", () => action("navigation.library"), false, true)}
                  {button("Explorar", () => action("navigation.discover"), false, true)}
                </View>

                <View style={[styles.surface, styles.dpadPanel]}>{dpad}</View>

                <View style={[styles.surface, styles.audioPanel]}>
                  <View style={styles.volumeRow}>
                    <Text style={styles.volumeIcon}>◀</Text>
                    <View style={styles.volumeRangeWrap}>
                      <RangeControl
                        label="Volumen"
                        value={state.volume}
                        max={1}
                        disabled={!canControl || !state.available}
                        onChange={(volume) => action("player.setVolume", { volume })}
                      />
                    </View>
                    <Text style={styles.volumePercent}>
                      {Math.round((state.volume ?? 1) * 100)}%
                    </Text>
                    <Pressable
                      onPress={() => action("player.setMuted", { muted: !state.muted })}
                      style={styles.muteButton}
                    >
                      <Text style={styles.muteButtonText}>{state.muted ? "🔇" : "🔊"}</Text>
                    </Pressable>
                  </View>
                  {!!state.content?.tracks?.length && (
                    <View style={styles.trackList}>
                      {state.content.tracks.map((track: any) => (
                        <Pressable
                          key={track.key}
                          onPress={() => action("player.selectTrack", { key: track.key })}
                          style={[styles.trackPill, track.selected && styles.trackPillSelected]}
                        >
                          <Text
                            style={[
                              styles.trackPillText,
                              track.selected && styles.trackPillTextSelected
                            ]}
                          >
                            {track.kind === "audio" ? "Audio" : "Sub"} · {track.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                <View style={[styles.surface, styles.secondaryControls]}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Más controles</Text>
                    <Text style={styles.miniBadge}>{state.rate || 1}×</Text>
                  </View>
                  <View style={styles.row}>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <View key={rate}>
                        {button(
                          `${rate}×${state.rate === rate ? " ✓" : ""}`,
                          () => action("player.setRate", { rate }),
                          !state.available || state.capabilities?.rate === false,
                          true
                        )}
                      </View>
                    ))}
                  </View>
                  {button(
                    "Pantalla completa",
                    () => action("player.fullscreen"),
                    !state.available,
                    true
                  )}
                  {button("Actualizar estado", () => c.sync())}
                </View>
              </>
            )}

            {tab === "browse" && (
              <>
                <View style={styles.syncStrip}>
                  <Text style={styles.syncStripText}>↻ Catálogo sincronizado con Nuvio Web</Text>
                  <Text style={styles.syncStripTime}>
                    {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <View style={styles.searchRow}>
                  <TextInput
                    accessibilityLabel="Buscar título en la web"
                    style={[styles.input, styles.searchInput]}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Buscar títulos..."
                    placeholderTextColor="#6F7482"
                    maxLength={120}
                    returnKeyType="search"
                    onSubmitEditing={() =>
                      query.trim().length >= 2 && action("catalog.search", { query: query.trim() })
                    }
                  />
                  <Pressable
                    onPress={() =>
                      query.trim().length < 2
                        ? setStatus("Escribe al menos dos caracteres para buscar.")
                        : action("catalog.search", { query: query.trim() })
                    }
                    style={styles.searchButton}
                  >
                    <Text style={styles.searchButtonText}>Buscar</Text>
                  </Pressable>
                </View>

                {!!state.content?.description && (
                  <Text style={styles.copy}>{state.content.description}</Text>
                )}
                {!!(state.content?.seasons || []).length && (
                  <View style={styles.trackList}>
                    {(state.content?.seasons || []).map((season: number) => (
                      <Pressable
                        key={season}
                        onPress={() => action("catalog.season", { season })}
                        style={[
                          styles.trackPill,
                          state.content?.selectedSeason === season && styles.trackPillSelected
                        ]}
                      >
                        <Text
                          style={[
                            styles.trackPillText,
                            state.content?.selectedSeason === season && styles.trackPillTextSelected
                          ]}
                        >
                          T{season}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.resultHeader}>
                  <Text style={styles.sectionTitle}>
                    {state.content?.title || "Resultados coincidentes"}
                  </Text>
                  <Text style={styles.copySmall}>
                    {(state.content?.items || []).length} títulos
                  </Text>
                </View>
                {(state.content?.items || []).map((item: any, index: number) => (
                  <Pressable
                    key={item.key}
                    disabled={!canControl}
                    onPress={() => action("catalog.activate", { key: item.key })}
                    style={({ pressed }) => [
                      styles.resultCard,
                      pressed && styles.pressed,
                      !canControl && styles.disabled
                    ]}
                  >
                    {!!item.thumbnail ? (
                      <Image
                        source={{ uri: item.thumbnail }}
                        style={styles.poster}
                        accessible={false}
                      />
                    ) : (
                      <View style={[styles.poster, styles.posterPlaceholder]}>
                        <Text style={styles.posterPlaceholderText}>▣</Text>
                      </View>
                    )}
                    <View style={styles.resultBody}>
                      <Text style={styles.mediaTitle}>{item.label}</Text>
                      <View style={styles.badgeRow}>
                        {!!kindLabel[String(item.mediaType || "")] && (
                          <Text style={styles.kindBadge}>
                            {kindLabel[String(item.mediaType || "")]}
                          </Text>
                        )}
                        {!!item.year && <Text style={styles.year}>{String(item.year)}</Text>}
                        {!!item.detail && (
                          <Text numberOfLines={1} style={styles.resultDetail}>
                            {item.detail}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.resultAction}>
                      <Text style={styles.resultActionText}>
                        {state.content?.route === "stream" ? "▶" : "▣"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {!state.content?.items?.length && (
                  <View style={[styles.surface, styles.emptyState]}>
                    <Text style={styles.copy}>
                      Busca un título para ver resultados sincronizados desde la web.
                    </Text>
                  </View>
                )}
                {state.content?.pageCount > 1 && (
                  <View style={styles.pagination}>
                    {button(
                      "‹",
                      () => action("catalog.page", { page: state.content.page - 1 }),
                      state.content.page === 0,
                      true
                    )}
                    <Text style={styles.pageNumber}>{state.content.page + 1}</Text>
                    <Text style={styles.copySmall}>de {state.content.pageCount}</Text>
                    {button(
                      "›",
                      () => action("catalog.page", { page: state.content.page + 1 }),
                      state.content.page + 1 >= state.content.pageCount,
                      true
                    )}
                  </View>
                )}
              </>
            )}

            {tab === "keyboard" && (
              <>
                <View style={[styles.surface, styles.infoCard]}>
                  <Text style={styles.infoIcon}>ⓘ</Text>
                  <Text style={styles.copy}>
                    El texto enviado reemplazará el campo activo en Nuvio Web. Usa las teclas de
                    dirección para colocar el cursor.
                  </Text>
                </View>
                <View style={[styles.surface, styles.keyboardCard]}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.eyebrow}>ENTRADA DIRECTA</Text>
                    <Text style={styles.copySmall}>{keyboardText.length} caracteres</Text>
                  </View>
                  <TextInput
                    accessibilityLabel="Texto para enviar a la web"
                    style={[styles.input, styles.keyboardInput]}
                    value={keyboardText}
                    onChangeText={setKeyboardText}
                    placeholder="Escribe aquí para enviar al navegador..."
                    placeholderTextColor="#6F7482"
                    maxLength={200}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      if (keyboardText.length >= 1) {
                        action("keyboard.text", { text: keyboardText.slice(0, 200) });
                        setKeyboardText("");
                      }
                    }}
                  />
                  <View style={styles.inlineActions}>
                    {button("Borrar", () => setKeyboardText(""), !keyboardText.length)}
                    <Pressable
                      onPress={() => {
                        if (keyboardText.length < 1) return setStatus("Escribe algo primero.");
                        action("keyboard.text", { text: keyboardText.slice(0, 200) });
                        setKeyboardText("");
                      }}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>Enviar texto</Text>
                      <Text style={styles.primaryButtonArrow}>→</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.groupLabel}>TECLAS DE CONTROL Y NAVEGACIÓN</Text>
                <View style={styles.keyGrid}>
                  {[
                    ["Esc", "Escape"],
                    ["Tab", "Tab"],
                    ["Retroceso", "Backspace"],
                    ["Intro", "Enter"],
                    ["Espacio", " "]
                  ].map(([label, key]) => (
                    <Pressable
                      key={key}
                      onPress={() => action("keyboard.key", { key })}
                      style={styles.keyButton}
                    >
                      <Text style={styles.keyButtonText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.groupLabel}>MOVER CURSOR EN NUVIO WEB</Text>
                <View style={[styles.surface, styles.cursorPad]}>
                  {[
                    ["↑", "ArrowUp"],
                    ["←", "ArrowLeft"],
                    ["↓", "ArrowDown"],
                    ["→", "ArrowRight"]
                  ].map(([label, key]) => (
                    <Pressable
                      key={key}
                      onPress={() => action("keyboard.key", { key })}
                      style={styles.cursorButton}
                    >
                      <Text style={styles.cursorButtonText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {tab === "connection" && (
              <>
                <View style={[styles.surface, styles.currentConnectionCard]}>
                  <View style={styles.sectionTitleRow}>
                    <View>
                      <Text style={styles.eyebrow}>NUVIO WEB</Text>
                      <Text style={styles.mediaTitleLarge}>
                        {c.grant?.sessionName || "Pantalla vinculada"}
                      </Text>
                    </View>
                    <Text style={[styles.miniBadge, canControl && styles.miniBadgeOnline]}>
                      {canControl ? "LOCAL" : "EN ESPERA"}
                    </Text>
                  </View>
                  <Text selectable style={styles.copySmall}>
                    {c.grant?.base}
                  </Text>
                  <View
                    style={[
                      styles.connectionNotice,
                      !session.online && styles.connectionNoticeError
                    ]}
                  >
                    <Text style={styles.connectionNoticeText}>{status}</Text>
                  </View>
                  {button("Actualizar conexión", () => c.sync())}
                </View>

                <View style={[styles.surface, styles.parametersCard]}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Parámetros de conexión</Text>
                    <Text style={styles.copySmall}>v{APP_VERSION}</Text>
                  </View>
                  <Text style={styles.fieldLabel}>Servidor de sincronización</Text>
                  <Text selectable style={styles.readOnlyValue}>
                    {c.grant?.base || base}
                  </Text>
                  <Text style={styles.fieldLabel}>Nombre de este mando</Text>
                  <Text style={styles.readOnlyValue}>{deviceName}</Text>
                  <Text style={styles.fieldLabel}>Tiempo de vínculo restante</Text>
                  <Text style={styles.readOnlyValue}>
                    {Math.max(
                      0,
                      Math.ceil(
                        ((c.grant?.linkExpiresAt || c.grant?.expiresAt || now) - now) / 86400000
                      )
                    )}{" "}
                    días
                  </Text>
                </View>

                <View style={styles.sectionBlock}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Mis pantallas guardadas</Text>
                    <Text style={styles.countBadge}>{savedSessions.length}</Text>
                  </View>
                  {savedSessions.map((link) => (
                    <View key={link.deviceId} style={[styles.surface, styles.savedScreenCard]}>
                      <View style={styles.savedScreenIcon}>
                        <Text style={styles.savedScreenIconText}>▣</Text>
                      </View>
                      <View style={styles.savedScreenBody}>
                        <Text style={styles.mediaTitle}>{link.name}</Text>
                        <Text style={styles.copySmall}>
                          {link.online ? "Web conectada" : "Web desconectada"}
                        </Text>
                      </View>
                      <Pressable
                        disabled={link.active}
                        onPress={() =>
                          void c.selectSaved(link.deviceId).catch((e) => setStatus(e.message))
                        }
                        style={[styles.smallAction, link.active && styles.smallActionActive]}
                      >
                        <Text style={styles.smallActionText}>
                          {link.active ? "Actual" : "Controlar"}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                  {button(
                    "Vincular otra pantalla",
                    () => void c.newPairing().catch((e) => setStatus(e.message)),
                    savedSessions.length >= 5
                  )}
                </View>

                {button("Desvincular esta web", () => {
                  Alert.alert(
                    "¿Desvincular esta pantalla?",
                    "Necesitarás otro código para volver a controlarla.",
                    [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Desvincular",
                        style: "destructive",
                        onPress: () => {
                          void c
                            .revokeSelected()
                            .then(() => setStatus("Vínculo eliminado."))
                            .catch(() => setStatus("No se pudo borrar el vínculo guardado."));
                        }
                      }
                    ]
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>

      {session.paired && session.approved && <View style={styles.bottomNavigation}>{tabBar}</View>}
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#090B10" },
  header: {
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 10 : 52,
    paddingHorizontal: 16,
    paddingBottom: 11,
    backgroundColor: "rgba(9,11,16,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(194,198,214,0.12)"
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  brandIconFrame: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#11141D",
    borderWidth: 1,
    borderColor: "rgba(173,198,255,0.22)"
  },
  brandIcon: { width: 26, height: 26, borderRadius: 6 },
  brand: {
    color: "#F1F3F8",
    fontSize: 16,
    lineHeight: 19,
    fontWeight: "800",
    letterSpacing: -0.35
  },
  brandStatusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  version: { color: "#8C909F", fontSize: 9, lineHeight: 12, fontWeight: "600" },
  tinyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#616573" },
  tinyDotOnline: { backgroundColor: "#69D59A" },
  connectionPill: {
    maxWidth: 150,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.13)",
    backgroundColor: "#11141D"
  },
  connectionPillOnline: { borderColor: "rgba(105,213,154,0.18)" },
  connectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#6D7280" },
  connectionDotOnline: { backgroundColor: "#69D59A" },
  connectionPillText: { color: "#C2C6D6", fontSize: 8.5, fontWeight: "700", flexShrink: 1 },
  content: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 104, gap: 12 },

  screenHeading: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 2, gap: 5 },
  eyebrow: {
    color: "#ADC6FF",
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.05
  },
  title: { color: "#F1F3F8", fontSize: 25, lineHeight: 29, fontWeight: "800", letterSpacing: -0.8 },
  sectionTitle: {
    color: "#E2E2E9",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.2
  },
  mediaTitle: { color: "#F1F3F8", fontSize: 13, lineHeight: 17, fontWeight: "800" },
  mediaTitleLarge: {
    color: "#F1F3F8",
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: -0.35
  },
  copy: { color: "#AEB3C3", fontSize: 10.5, lineHeight: 16 },
  copySmall: { color: "#8C909F", fontSize: 9, lineHeight: 13 },
  fieldLabel: { color: "#AEB3C3", fontSize: 8.5, lineHeight: 12, fontWeight: "800", marginTop: 2 },
  groupLabel: {
    color: "#8C909F",
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginTop: 8,
    marginBottom: -2
  },
  surface: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.12)",
    backgroundColor: "#111318",
    padding: 13
  },
  sectionBlock: { gap: 9, marginTop: 4 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  miniBadge: {
    color: "#AEB3C3",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.14)",
    backgroundColor: "#1A1B21"
  },
  miniBadgeOnline: { color: "#69D59A", borderColor: "rgba(105,213,154,0.22)" },
  countBadge: {
    minWidth: 22,
    textAlign: "center",
    color: "#ADC6FF",
    fontSize: 9,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(77,142,255,0.11)"
  },

  feedbackBanner: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(173,198,255,0.15)",
    backgroundColor: "rgba(77,142,255,0.07)"
  },
  feedbackText: { color: "#C2C6D6", fontSize: 9.5, lineHeight: 13 },
  updateBanner: { gap: 9 },

  button: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.15)",
    backgroundColor: "#1A1B21",
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: { color: "#D7DAE5", fontSize: 9.5, lineHeight: 13, fontWeight: "800" },
  primaryButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 8,
    backgroundColor: "#4D8EFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4
  },
  primaryButtonText: { color: "#06152A", fontSize: 10.5, fontWeight: "900" },
  primaryButtonArrow: { color: "#06152A", fontSize: 16, fontWeight: "900" },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.36 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  inlineActions: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 },
  textAction: { alignSelf: "center", paddingHorizontal: 8, paddingVertical: 6 },
  textActionLabel: { color: "#ADC6FF", fontSize: 9.5, fontWeight: "700" },

  input: {
    minHeight: 41,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.14)",
    backgroundColor: "#0C0E13",
    color: "#E2E2E9",
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 10.5
  },
  codeInput: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    letterSpacing: 0.7,
    color: "#C8D8FF"
  },
  advancedPanel: { gap: 6, paddingTop: 5 },
  readOnlyValue: {
    minHeight: 37,
    color: "#C2C6D6",
    fontSize: 9.5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.11)",
    backgroundColor: "#0C0E13"
  },

  pairingCard: { gap: 10 },
  pairVisual: {
    position: "relative",
    height: 218,
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(173,198,255,0.18)",
    backgroundColor: "#080A0F"
  },
  pairVisualCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 7 },
  pairVisualIcon: { color: "#ADC6FF", fontSize: 40, fontWeight: "300" },
  pairVisualText: { color: "#8C909F", fontSize: 9.5, fontWeight: "700" },
  qrCamera: { ...StyleSheet.absoluteFillObject },
  qrCornerTopLeft: {
    position: "absolute",
    left: 15,
    top: 15,
    width: 38,
    height: 38,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: "#4D8EFF"
  },
  qrCornerTopRight: {
    position: "absolute",
    right: 15,
    top: 15,
    width: 38,
    height: 38,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderColor: "#4D8EFF"
  },
  qrCornerBottomLeft: {
    position: "absolute",
    left: 15,
    bottom: 15,
    width: 38,
    height: 38,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#4D8EFF"
  },
  qrCornerBottomRight: {
    position: "absolute",
    right: 15,
    bottom: 15,
    width: 38,
    height: 38,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#4D8EFF"
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 7, marginVertical: 3 },
  divider: { flex: 1, height: 1, backgroundColor: "rgba(194,198,214,0.09)" },
  dividerText: { color: "#6F7482", fontSize: 6.8, fontWeight: "900", letterSpacing: 0.6 },
  waitingCard: { minHeight: 260, justifyContent: "center", gap: 10 },

  savedScreenCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  savedScreenIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#172239",
    borderWidth: 1,
    borderColor: "rgba(173,198,255,0.18)"
  },
  savedScreenIconText: { color: "#ADC6FF", fontSize: 17 },
  savedScreenBody: { flex: 1, minWidth: 0 },
  smallAction: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.14)",
    backgroundColor: "#1A1B21"
  },
  smallActionActive: {
    borderColor: "rgba(77,142,255,0.36)",
    backgroundColor: "rgba(77,142,255,0.12)"
  },
  smallActionText: { color: "#C8D8FF", fontSize: 8, fontWeight: "800" },

  nowPlayingCard: { gap: 9, padding: 12 },
  nowPlayingTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#1A1B21",
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.12)"
  },
  statusBadgeActive: {
    backgroundColor: "rgba(77,142,255,0.12)",
    borderColor: "rgba(77,142,255,0.22)"
  },
  statusBadgeText: { color: "#ADC6FF", fontSize: 7.5, fontWeight: "900" },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -6 },
  timeText: { color: "#7D8290", fontSize: 8, fontVariant: ["tabular-nums"] },
  playbackControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginTop: 3
  },
  circleControl: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1B21",
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.12)"
  },
  circleControlText: { color: "#DDE3F3", fontSize: 18, fontWeight: "700" },
  mainPlayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4D8EFF",
    shadowColor: "#4D8EFF",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4
  },
  mainPlaySymbol: { color: "#07162B", fontSize: 18, fontWeight: "900" },
  remoteQuickActions: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  remoteDestinationActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    marginTop: -2
  },

  dpadPanel: { paddingVertical: 17, paddingHorizontal: 12, alignItems: "center" },
  dpad: {
    width: 238,
    height: 238,
    borderRadius: 119,
    position: "relative",
    backgroundColor: "#0C0E13",
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 24,
    elevation: 5
  },
  dpadButton: {
    position: "absolute",
    width: 66,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18
  },
  dpadUp: { left: 86, top: 14 },
  dpadDown: { left: 86, bottom: 14 },
  dpadLeft: { left: 14, top: 91 },
  dpadRight: { right: 14, top: 91 },
  dpadSelect: { left: 75, top: 75 },
  dpadSelectButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#111722",
    borderWidth: 1,
    borderColor: "rgba(173,198,255,0.35)"
  },
  dpadSymbol: { color: "#C2C6D6", fontSize: 23, fontWeight: "400" },
  dpadSelectText: { color: "#EAF0FF", fontSize: 12, fontWeight: "900" },

  audioPanel: { gap: 8 },
  volumeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  volumeIcon: { color: "#8C909F", fontSize: 12 },
  volumeRangeWrap: { flex: 1 },
  volumePercent: {
    width: 30,
    color: "#C2C6D6",
    textAlign: "right",
    fontSize: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  muteButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#1A1B21"
  },
  muteButtonText: { fontSize: 14 },
  trackList: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  trackPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.12)",
    backgroundColor: "#1A1B21"
  },
  trackPillSelected: {
    borderColor: "rgba(77,142,255,0.38)",
    backgroundColor: "rgba(77,142,255,0.14)"
  },
  trackPillText: { color: "#AEB3C3", fontSize: 8.5, fontWeight: "700" },
  trackPillTextSelected: { color: "#C8D8FF" },
  secondaryControls: { gap: 8 },

  syncStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#111318",
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.09)"
  },
  syncStripText: { color: "#AEB3C3", fontSize: 8.5, fontWeight: "700" },
  syncStripTime: { color: "#6F7482", fontSize: 8, fontVariant: ["tabular-nums"] },
  searchRow: { flexDirection: "row", gap: 7 },
  searchInput: { flex: 1, minWidth: 0 },
  searchButton: {
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#4D8EFF",
    paddingHorizontal: 11
  },
  searchButtonText: { color: "#06152A", fontSize: 9.5, fontWeight: "900" },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5,
    marginBottom: 1
  },
  resultCard: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#111318",
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.11)"
  },
  poster: { width: 46, height: 66, borderRadius: 6, backgroundColor: "#1A1B21" },
  posterPlaceholder: { alignItems: "center", justifyContent: "center" },
  posterPlaceholderText: { color: "#6F7482", fontSize: 18 },
  resultBody: { flex: 1, minWidth: 0, gap: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  kindBadge: {
    color: "#ADC6FF",
    fontSize: 7,
    fontWeight: "900",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(77,142,255,0.1)"
  },
  year: { color: "#8C909F", fontSize: 8 },
  resultDetail: { flex: 1, color: "#7D8290", fontSize: 7.5 },
  resultAction: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#172239",
    borderWidth: 1,
    borderColor: "rgba(173,198,255,0.16)"
  },
  resultActionText: { color: "#ADC6FF", fontSize: 12, fontWeight: "900" },
  emptyState: { minHeight: 120, alignItems: "center", justifyContent: "center" },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4
  },
  pageNumber: {
    minWidth: 30,
    textAlign: "center",
    color: "#ADC6FF",
    fontSize: 10,
    fontWeight: "900",
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: "rgba(77,142,255,0.13)"
  },

  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#111318" },
  infoIcon: { color: "#ADC6FF", fontSize: 16 },
  keyboardCard: { gap: 9 },
  keyboardInput: { minHeight: 112, textAlignVertical: "top", paddingTop: 11 },
  keyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  keyButton: {
    minWidth: 74,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: "#171920",
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.1)"
  },
  keyButtonText: { color: "#B9BECC", fontSize: 9, fontWeight: "700" },
  cursorPad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    padding: 16
  },
  cursorButton: {
    width: 64,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#1A1B21",
    borderWidth: 1,
    borderColor: "rgba(194,198,214,0.11)"
  },
  cursorButtonText: { color: "#DDE3F3", fontSize: 18 },

  currentConnectionCard: { gap: 9 },
  connectionNotice: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: "rgba(77,142,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(77,142,255,0.15)"
  },
  connectionNoticeError: {
    backgroundColor: "rgba(255,180,171,0.06)",
    borderColor: "rgba(255,180,171,0.14)"
  },
  connectionNoticeText: { color: "#B9C9EB", fontSize: 9, lineHeight: 13 },
  parametersCard: { gap: 7 },

  tabs: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-around",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  tab: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent"
  },
  tabActive: { backgroundColor: "rgba(77,142,255,0.12)", borderColor: "rgba(77,142,255,0.16)" },
  tabIcon: { color: "#7D8290", fontSize: 15, lineHeight: 17 },
  tabText: { color: "#8C909F", fontSize: 7.5, fontWeight: "700" },
  tabTextActive: { color: "#ADC6FF" },
  bottomNavigation: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(12,14,19,0.98)",
    borderTopWidth: 1,
    borderTopColor: "rgba(194,198,214,0.12)",
    paddingBottom: Platform.OS === "ios" ? 18 : 5
  }
});
