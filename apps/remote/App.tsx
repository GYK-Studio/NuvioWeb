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

const APP_VERSION = "0.1.2";
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
  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <Image
              source={require("./assets/icon.png")}
              style={styles.brandIcon}
              accessible={false}
            />
            <View>
              <Text style={styles.brand}>Nuvio Remote</Text>
              <Text style={styles.version}>Mando para Nuvio Web · {APP_VERSION}</Text>
            </View>
          </View>
          <View style={[styles.connectionDot, canControl && styles.connectionDotOnline]} />
        </View>
        <View style={styles.tabs}>
          {(
            [
              ["remote", "Mando"],
              ["browse", "Explorar"],
              ["keyboard", "Teclado"],
              ["connection", "Conexión"]
            ] as const
          ).map(([id, label]) => (
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
              <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView
        key={tab}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroIntro}>
          <Text style={styles.eyebrow}>
            {tab === "browse"
              ? "TU PRÓXIMA HISTORIA"
              : tab === "keyboard"
                ? "ESCRIBE EN LA WEB"
                : tab === "connection"
                  ? "TU CONEXIÓN"
                  : "EN TU PANTALLA"}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {tab === "browse"
              ? "Encuentra algo para ver"
              : tab === "keyboard"
                ? "Teclado del mando"
                : tab === "connection"
                  ? "Tus pantallas"
                  : state.content?.title || "Controla tu pantalla"}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, session.online && styles.statusDotOnline]} />
            <Text accessibilityLiveRegion="polite" style={styles.status}>
              {status}
            </Text>
          </View>
        </View>
        {!!feedback && (
          <Text accessibilityLiveRegion="polite" style={styles.copy}>
            {feedback}
          </Text>
        )}
        {!!updateInfo && (
          <View style={styles.updateBanner}>
            <Text style={styles.updateTitle}>Nueva versión disponible: {updateInfo.version}</Text>
            <Text style={styles.updateCopy}>
              Estás en {APP_VERSION}. Descarga la APK y reinstálala encima.
            </Text>
            {button("Descargar actualización", () => {
              void Linking.openURL(updateInfo.url).catch(() =>
                setStatus("No se pudo abrir la descarga.")
              );
            })}
          </View>
        )}
        {!session.paired ? (
          <View style={styles.card}>
            <Text style={styles.label}>Conecta tu pantalla</Text>
            <Text style={styles.copy}>
              Abre Control desde móvil en los ajustes de Nuvio Web. Escanea su QR o pega el código
              aquí.
            </Text>
            {button(advanced ? "Ocultar servidor" : "Cambiar servidor", () =>
              setAdvanced(!advanced)
            )}
            {advanced && (
              <>
                <Text style={styles.label}>URL del servicio de control</Text>
                <TextInput
                  accessibilityLabel="URL del servicio de control"
                  style={styles.input}
                  value={base}
                  onChangeText={setBase}
                  placeholder="https://tu-servicio-remoto"
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </>
            )}
            <Text style={styles.label}>Nombre de este móvil</Text>
            <TextInput
              accessibilityLabel="Nombre de este móvil"
              style={styles.input}
              value={deviceName}
              onChangeText={setDeviceName}
              maxLength={60}
            />
            <Text style={styles.label}>Código de la web</Text>
            <TextInput
              accessibilityLabel="Código de emparejamiento"
              style={styles.input}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={64}
              placeholder="Pega tu código de conexión"
              placeholderTextColor="#858d9f"
            />
            {button("Escanear QR", () => {
              void (async () => {
                const p = permission?.granted ? permission : await requestPermission();
                if (p.granted) setScan(true);
                else setStatus("Puedes introducir el código manualmente.");
              })();
            })}
            {scan && (
              <>
                <Text style={styles.copy}>Centra el QR de la web dentro del marco.</Text>
                <View style={styles.qrFrame}>
                  <CameraView
                    style={styles.qrCamera}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    enableTorch={torch}
                    onBarcodeScanned={({ data }) => {
                      if (/^[A-F0-9]{32}$/.test(data)) {
                        setCode(data);
                        setScan(false);
                        setTorch(false);
                        setStatus("Código leído. Pulsa Solicitar conexión.");
                      } else setStatus("Este QR no es un código de Nuvio Remote.");
                    }}
                  />
                  <View pointerEvents="none" style={styles.qrCornerTopLeft} />
                  <View pointerEvents="none" style={styles.qrCornerTopRight} />
                  <View pointerEvents="none" style={styles.qrCornerBottomLeft} />
                  <View pointerEvents="none" style={styles.qrCornerBottomRight} />
                </View>
                <View style={styles.row}>
                  {button(torch ? "Apagar linterna" : "Encender linterna", () =>
                    setTorch((value) => !value)
                  )}
                  {button("Cerrar cámara", () => {
                    setScan(false);
                    setTorch(false);
                  })}
                </View>
              </>
            )}
            {button(
              busy ? "Conectando…" : "Solicitar conexión",
              () => {
                if (!/^[A-F0-9]{32}$/i.test(code.replace(/\s/g, ""))) {
                  setStatus("Introduce el código de 32 caracteres que aparece en la web.");
                  return;
                }
                setBusy(true);
                void c
                  .claim(base.trim(), code.replace(/\s/g, ""), deviceName)
                  .catch((e) => setStatus(e.message))
                  .finally(() => setBusy(false));
              },
              busy
            )}
            <Text style={styles.copy}>
              Abre Ajustes → About → Control desde móvil en la web. Aprueba el teléfono allí. El
              vínculo dura hasta 30 días con el servicio actualizado.
            </Text>
          </View>
        ) : !session.approved ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              Confirma en tu web
            </Text>
            <Text style={styles.copy}>
              La solicitud ya se envió. En Ajustes → Control desde móvil, pulsa Aprobar junto a este
              teléfono. No necesitas introducir otro código.
            </Text>
            {button("Comprobar conexión", () => c.sync())}
          </View>
        ) : (
          <>
            {tab === "remote" && (
              <>
                <View style={styles.card}>
                  <Text style={styles.label}>{c.grant?.sessionName}</Text>
                  {!session.online && (
                    <Text style={styles.copy}>
                      Abre de nuevo la web. El mando se reconectará sin reenviar órdenes antiguas.
                    </Text>
                  )}
                  {!session.snapshot && (
                    <Text style={styles.copy}>
                      El teléfono ya está aprobado. Esperando catálogo y reproductor; puedes usar
                      Inicio o Buscar.
                    </Text>
                  )}
                  {button("Actualizar estado", () => c.sync())}
                  <Text style={styles.label}>Navegación</Text>
                  {dpad}
                  <Text style={styles.label}>Desplazar la página</Text>
                  {scrollRow}
                  <Text style={styles.title}>
                    {!state.available
                      ? "Sin vídeo activo"
                      : state.buffering
                        ? "Cargando vídeo…"
                        : state.playing
                          ? "Reproduciendo"
                          : "En pausa"}
                  </Text>
                  {!!state.content?.title && (
                    <Text style={styles.mediaTitle}>{state.content.title}</Text>
                  )}
                  <Text style={styles.copy}>
                    {clock(position)} / {clock(state.duration)} · Volumen{" "}
                    {Math.round((state.volume ?? 1) * 100)} %
                  </Text>
                  <RangeControl
                    label="Posición · toca la barra para saltar"
                    value={position}
                    max={state.duration}
                    disabled={!canControl || !state.available}
                    onChange={(positionSeconds) => action("player.seek", { positionSeconds })}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={state.playing ? "Pausar" : "Reproducir"}
                    accessibilityState={{ disabled: !canControl || !state.available }}
                    disabled={!canControl || !state.available}
                    onPress={() => action(state.playing ? "player.pause" : "player.play")}
                    style={({ pressed }) => [
                      styles.playButton,
                      pressed && styles.pressed,
                      (!canControl || !state.available) && styles.disabled
                    ]}
                  >
                    <Text style={styles.playSymbol}>{state.playing ? "Ⅱ" : "▶"}</Text>
                    <Text style={styles.playLabel}>{state.playing ? "Pausar" : "Reproducir"}</Text>
                  </Pressable>
                  <View style={styles.row}>
                    {button(
                      "−10 s",
                      () =>
                        action("player.seek", {
                          positionSeconds: Math.max(0, position - 10)
                        }),
                      !state.available || !state.duration,
                      true
                    )}
                    {button(
                      "+10 s",
                      () =>
                        action("player.seek", {
                          positionSeconds: Math.min(state.duration, position + 10)
                        }),
                      !state.available || !state.duration,
                      true
                    )}
                  </View>
                  <RangeControl
                    label="Volumen · toca para ajustar"
                    value={state.volume}
                    max={1}
                    disabled={!canControl || !state.available}
                    onChange={(volume) => action("player.setVolume", { volume })}
                  />
                  <View style={styles.row}>
                    {button(
                      "Volumen −",
                      () => action("player.setVolume", { volume: Math.max(0, state.volume - 0.1) }),
                      !state.available,
                      true
                    )}
                    {button(
                      "Volumen +",
                      () => action("player.setVolume", { volume: Math.min(1, state.volume + 0.1) }),
                      !state.available,
                      true
                    )}
                  </View>
                  {button(
                    state.muted ? "Activar sonido" : "Silenciar",
                    () => action("player.setMuted", { muted: !state.muted }),
                    !state.available,
                    true
                  )}
                  <Text style={styles.label}>Velocidad · {state.rate || 1}×</Text>
                  {button(
                    "Solicitar pantalla completa",
                    () => action("player.fullscreen"),
                    !state.available,
                    true
                  )}
                  <Text style={styles.copy}>
                    La pantalla completa requiere confirmar el aviso en el navegador.
                  </Text>
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
                </View>
                <View style={styles.row}>
                  {button("Inicio en la web", () => action("navigation.home"), false, true)}
                  {button("Volver en la web", () => action("navigation.back"), false, true)}
                </View>
              </>
            )}
            {tab === "browse" && (
              <>
                <View style={styles.card}>
                  <Text style={styles.label}>Navegación</Text>
                  {dpad}
                  <Text style={styles.label}>Desplazar la página</Text>
                  {scrollRow}
                  <View style={styles.row}>
                    {button("Inicio", () => action("navigation.home"), false, true)}
                    {button("Biblioteca", () => action("navigation.library"), false, true)}
                    {button("Descubrir", () => action("navigation.discover"), false, true)}
                    {button("Volver", () => action("navigation.back"), false, true)}
                  </View>
                  <Text style={styles.label}>Buscar en la web</Text>
                  <TextInput
                    accessibilityLabel="Buscar título en la web"
                    style={styles.input}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Película o serie"
                    placeholderTextColor="#858d9f"
                    maxLength={120}
                    returnKeyType="search"
                    onSubmitEditing={() =>
                      query.trim().length >= 2 && action("catalog.search", { query: query.trim() })
                    }
                  />
                  {button(
                    "Buscar",
                    () =>
                      query.trim().length < 2
                        ? setStatus("Escribe al menos dos caracteres para buscar.")
                        : action("catalog.search", { query: query.trim() }),
                    false,
                    true
                  )}
                  <Text style={styles.copy}>
                    Elige un resultado o una fuente para abrirlo en la web.
                  </Text>
                </View>
              </>
            )}
            {tab === "keyboard" && (
              <View style={styles.card}>
                <Text style={styles.label}>Escribir en la web</Text>
                <Text style={styles.copy}>
                  Toca un campo de texto en la web (o usa Buscar) y envía el texto desde aquí. Lo
                  escrito sustituye el contenido del campo enfocado.
                </Text>
                <TextInput
                  accessibilityLabel="Texto para enviar a la web"
                  style={styles.input}
                  value={keyboardText}
                  onChangeText={setKeyboardText}
                  placeholder="Escribe aquí…"
                  placeholderTextColor="#858d9f"
                  maxLength={200}
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    if (keyboardText.length >= 1) {
                      action("keyboard.text", { text: keyboardText.slice(0, 200) });
                      setKeyboardText("");
                    }
                  }}
                />
                <View style={styles.row}>
                  {button(
                    "Enviar texto",
                    () => {
                      if (keyboardText.length < 1) {
                        setStatus("Escribe algo primero.");
                        return;
                      }
                      action("keyboard.text", { text: keyboardText.slice(0, 200) });
                      setKeyboardText("");
                    },
                    false,
                    true
                  )}
                  {button("Borrar", () => setKeyboardText(""), !keyboardText.length)}
                </View>
                <Text style={styles.label}>Teclas especiales</Text>
                <View style={styles.row}>
                  {button("Espacio", () => action("keyboard.key", { key: " " }), false, true)}
                  {button(
                    "⌫ Borrar",
                    () => action("keyboard.key", { key: "Backspace" }),
                    false,
                    true
                  )}
                  {button("Intro", () => action("keyboard.key", { key: "Enter" }), false, true)}
                </View>
                <View style={styles.row}>
                  {button("←", () => action("keyboard.key", { key: "ArrowLeft" }), false, true)}
                  {button("↑", () => action("keyboard.key", { key: "ArrowUp" }), false, true)}
                  {button("↓", () => action("keyboard.key", { key: "ArrowDown" }), false, true)}
                  {button("→", () => action("keyboard.key", { key: "ArrowRight" }), false, true)}
                </View>
                <View style={styles.row}>
                  {button("Esc", () => action("keyboard.key", { key: "Escape" }), false, true)}
                  {button("Tab", () => action("keyboard.key", { key: "Tab" }), false, true)}
                </View>
              </View>
            )}
            {tab === "connection" && (
              <View style={styles.card}>
                <Text style={styles.label}>Pantalla vinculada</Text>
                <Text style={styles.mediaTitle}>{c.grant?.sessionName || "Nuvio Web"}</Text>
                <Text selectable style={styles.copy}>
                  {c.grant?.base}
                </Text>
                <Text style={styles.copy}>
                  {canControl
                    ? "Este teléfono tiene el control."
                    : session.online
                      ? "Pide el control desde los ajustes de la web."
                      : "Esperando a que la web vuelva a conectarse."}
                </Text>
                <Text style={styles.label}>Tiempo de vínculo restante</Text>
                <Text style={styles.mediaTitle}>
                  {Math.max(
                    0,
                    Math.ceil(
                      ((c.grant?.linkExpiresAt || c.grant?.expiresAt || now) - now) / 86400000
                    )
                  )}{" "}
                  días
                </Text>
                <Text style={styles.copy}>
                  El acceso se renueva automáticamente mientras el vínculo siga autorizado. La web
                  debe seguir abierta. El vídeo se reproduce en la web, no en este teléfono.
                </Text>
                {button("Actualizar conexión", () => c.sync())}
                <Text style={styles.copy}>Nuvio Remote · {APP_VERSION}</Text>
              </View>
            )}
          </>
        )}
        {session.approved && state?.content && tab !== "connection" && (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.label}>
              {tab === "remote" ? "Audio y subtítulos" : state.content.title}
            </Text>
            {!(tab === "remote" ? state.content.tracks : state.content.items)?.length && (
              <Text style={styles.copy}>
                {tab === "remote"
                  ? "Las pistas disponibles aparecerán aquí cuando cargue el vídeo."
                  : "Busca un título para ver sus resultados. Las opciones se actualizan al cargar la web."}
              </Text>
            )}
            {tab === "browse" && (
              <>
                {!!state.content.description && (
                  <Text style={styles.copy}>{state.content.description}</Text>
                )}
                {!!(state.content.seasons || []).length && (
                  <Text style={styles.label}>Temporadas</Text>
                )}
                <View style={styles.row}>
                  {(state.content.seasons || []).map((season: number) => (
                    <View key={season}>
                      {button(
                        `T${season}${state.content.selectedSeason === season ? " ✓" : ""}`,
                        () => action("catalog.season", { season }),
                        false,
                        true
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}
            {tab === "browse" && state.content.route === "stream" && (
              <>
                <Text style={styles.label}>
                  Fuentes ({(state.content.items || []).length}) · toca ▶ para reproducir en la web
                </Text>
              </>
            )}
            {(tab === "browse" ? state.content.items || [] : []).map((item: any, index: number) => (
              <View key={item.key} style={styles.resultRow}>
                {!!item.thumbnail && (
                  <Image
                    source={{ uri: item.thumbnail }}
                    accessibilityIgnoresInvertColors
                    accessible={false}
                    style={styles.poster}
                  />
                )}
                <View style={styles.resultBody}>
                  <View style={styles.badgeRow}>
                    <Text style={styles.eyebrow}>{String(index + 1).padStart(2, "0")}</Text>
                    {!!kindLabel[String(item.mediaType || "")] && (
                      <Text style={styles.kindBadge}>
                        {kindLabel[String(item.mediaType || "")]}
                      </Text>
                    )}
                    {!!item.year && <Text style={styles.year}>{String(item.year)}</Text>}
                  </View>
                  {button(
                    state.content.route === "stream" ? `▶ ${item.label}` : item.label,
                    () => action("catalog.activate", { key: item.key }),
                    false,
                    true
                  )}
                  {!!item.detail && <Text style={styles.copy}>{item.detail}</Text>}
                </View>
              </View>
            ))}
            {tab === "browse" && state.content.pageCount > 1 && (
              <View style={styles.row}>
                {button(
                  "Anterior",
                  () => action("catalog.page", { page: state.content.page - 1 }),
                  state.content.page === 0,
                  true
                )}
                <Text style={styles.copy}>
                  {state.content.page + 1} / {state.content.pageCount}
                </Text>
                {button(
                  "Siguiente",
                  () => action("catalog.page", { page: state.content.page + 1 }),
                  state.content.page + 1 >= state.content.pageCount,
                  true
                )}
              </View>
            )}
            {(tab === "remote" ? state.content.tracks || [] : []).map((track: any) => (
              <View key={track.key}>
                {button(
                  `${track.kind === "audio" ? "Audio" : "Subtítulos"}: ${track.label}${track.selected ? " · seleccionado" : ""}`,
                  () => action("player.selectTrack", { key: track.key }),
                  false,
                  true
                )}
              </View>
            ))}
          </View>
        )}
        {tab === "connection" && (
          <View style={styles.card}>
            <Text style={styles.label}>Mis pantallas</Text>
            {button(
              busy ? "Comprobando…" : "Consultar estado de las pantallas",
              () => {
                setBusy(true);
                void c
                  .refreshLinks()
                  .catch((e) => setStatus(e.message))
                  .finally(() => setBusy(false));
              },
              busy
            )}
            {savedSessions.map((link) => (
              <View key={link.deviceId} style={styles.result}>
                <Text style={styles.mediaTitle}>
                  {link.name}
                  {link.active ? " · seleccionada" : ""}
                </Text>
                <Text style={styles.copy}>{link.base}</Text>
                <Text style={styles.copy}>
                  {link.online === undefined
                    ? "Estado sin comprobar"
                    : link.online
                      ? "Web conectada"
                      : "Web desconectada"}
                  {link.lastSeen
                    ? ` · Última actividad: ${new Date(link.lastSeen).toLocaleString()}`
                    : ""}
                </Text>
                {button(
                  link.active ? "Pantalla actual" : "Controlar esta pantalla",
                  () => {
                    void c.selectSaved(link.deviceId).catch((e) => setStatus(e.message));
                  },
                  link.active
                )}
              </View>
            ))}
            {button(
              "Vincular otra pantalla",
              () => {
                void c.newPairing().catch((e) => setStatus(e.message));
              },
              savedSessions.length >= 5
            )}
            <Text style={styles.copy}>
              Hasta cinco pantallas guardadas. Cada una necesita aprobación en su propia pestaña
              web.
            </Text>
          </View>
        )}
        {session.paired &&
          (tab === "connection" || !session.approved) &&
          button("Desvincular esta web", () => {
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
                      .then(() =>
                        setStatus(
                          "Vínculo eliminado. Si la web estaba desconectada, revócalo también allí."
                        )
                      )
                      .catch(() =>
                        setStatus("No se pudo borrar el vínculo guardado. Inténtalo de nuevo.")
                      );
                  }
                }
              ]
            );
          })}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#090A10" },
  header: {
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 56,
    paddingHorizontal: 18,
    gap: 18,
    paddingBottom: 12,
    backgroundColor: "#090A10",
    borderBottomWidth: 1,
    borderBottomColor: "#20222B"
  },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandIcon: { width: 42, height: 42, borderRadius: 12 },
  brand: { color: "#F8F8FB", fontSize: 19, fontWeight: "800", letterSpacing: -0.5 },
  version: { color: "#858996", fontSize: 11, marginTop: 2 },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#5A5E6A",
    borderWidth: 2,
    borderColor: "#252832"
  },
  connectionDotOnline: { backgroundColor: "#4ED69C", borderColor: "#173E31" },
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: "#12141B"
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12
  },
  tabActive: { backgroundColor: "#F3F2F7" },
  tabText: { color: "#969AA7", fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#111218", fontWeight: "800" },
  content: {
    padding: 18,
    paddingTop: 30,
    paddingBottom: 64,
    gap: 18,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center"
  },
  heroIntro: { gap: 9, paddingHorizontal: 2, marginBottom: 2 },
  eyebrow: { color: "#B89AFF", fontSize: 11, fontWeight: "800", letterSpacing: 1.8 },
  title: {
    color: "#F8F8FB",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 39,
    letterSpacing: -1.5
  },
  mediaTitle: { color: "#F8F8FB", fontSize: 20, fontWeight: "700", lineHeight: 27 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#777B87" },
  statusDotOnline: { backgroundColor: "#4ED69C" },
  status: { flex: 1, color: "#B7BAC5", fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: "#12141B",
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#20232C",
    gap: 16
  },
  result: {
    gap: 9,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#252832"
  },
  resultRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#252832"
  },
  resultBody: { flex: 1, gap: 8, justifyContent: "center" },
  poster: { width: 96, height: 144, borderRadius: 10, backgroundColor: "#0D0F15" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kindBadge: {
    color: "#D9C6FF",
    backgroundColor: "#2A2138",
    borderWidth: 1,
    borderColor: "#4A3A6E",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden"
  },
  year: { color: "#858996", fontSize: 13, fontWeight: "600" },
  qrFrame: {
    position: "relative",
    height: 300,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#000"
  },
  qrCamera: { flex: 1 },
  qrCornerTopLeft: {
    position: "absolute",
    top: 24,
    left: 24,
    width: 56,
    height: 56,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#4ED69C",
    borderTopLeftRadius: 12
  },
  qrCornerTopRight: {
    position: "absolute",
    top: 24,
    right: 24,
    width: 56,
    height: 56,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: "#4ED69C",
    borderTopRightRadius: 12
  },
  qrCornerBottomLeft: {
    position: "absolute",
    bottom: 24,
    left: 24,
    width: 56,
    height: 56,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#4ED69C",
    borderBottomLeftRadius: 12
  },
  qrCornerBottomRight: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: "#4ED69C",
    borderBottomRightRadius: 12
  },
  playButton: {
    alignSelf: "center",
    minWidth: 124,
    minHeight: 124,
    borderRadius: 62,
    padding: 22,
    backgroundColor: "#FF735F",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 6,
    borderColor: "#2A191A"
  },
  playSymbol: { color: "#150E10", fontSize: 34, fontWeight: "800" },
  playLabel: { color: "#150E10", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.96 }] },
  label: { color: "#F4F4F7", fontSize: 15, fontWeight: "700" },
  input: {
    backgroundColor: "#0D0F15",
    color: "#F8F8FB",
    borderWidth: 1,
    borderColor: "#363A47",
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16
  },
  button: {
    flexGrow: 1,
    backgroundColor: "#22252F",
    borderRadius: 14,
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#303440"
  },
  buttonText: { color: "#F5F5F8", fontSize: 15, fontWeight: "600", textAlign: "center" },
  disabled: { opacity: 0.38 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  dpad: {
    position: "relative",
    alignSelf: "center",
    width: 276,
    height: 276,
    borderRadius: 138,
    backgroundColor: "#0D0F15",
    borderWidth: 1,
    borderColor: "#282B35"
  },
  dpadButton: {
    position: "absolute",
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: "#1C1F28",
    borderWidth: 1,
    borderColor: "#2D303B"
  },
  dpadUp: { top: 8, left: 96 },
  dpadDown: { bottom: 8, left: 96 },
  dpadLeft: { top: 96, left: 8 },
  dpadRight: { top: 96, right: 8 },
  dpadSelect: { top: 96, left: 96 },
  dpadSelectButton: { backgroundColor: "#F3F2F7", borderColor: "#F3F2F7" },
  dpadSymbol: { color: "#EDEDF2", fontSize: 28, fontWeight: "500" },
  dpadSelectText: { color: "#111218", fontSize: 15, fontWeight: "900", letterSpacing: 0.7 },
  copy: { color: "#AEB1BC", fontSize: 14, lineHeight: 21 },
  updateBanner: {
    backgroundColor: "#173E31",
    borderWidth: 1,
    borderColor: "#2C6B55",
    borderRadius: 18,
    padding: 16,
    gap: 10
  },
  updateTitle: { color: "#7DE8B6", fontSize: 16, fontWeight: "800" },
  updateCopy: { color: "#B7D9C9", fontSize: 14, lineHeight: 20 }
});
