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
  Image
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Connection } from "./connection";
import { emptySession, sessionEvent } from "./session";
import { RangeControl } from "./RangeControl";

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
  UNSUPPORTED_CAPABILITY: "Esta fuente o navegador no permite esa acción."
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
  const [tab, setTab] = useState<"remote" | "browse" | "connection">("remote");
  const [advanced, setAdvanced] = useState(false);
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
  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>
            nuvio<Text style={styles.brandAccent}> remote</Text>
          </Text>
          <Text style={styles.version}>02</Text>
        </View>
        <View style={styles.tabs}>
          {(
            [
              ["remote", "Mando"],
              ["browse", "Explorar"],
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
        <Text style={styles.eyebrow}>
          {tab === "browse"
            ? "TU PRÓXIMA HISTORIA"
            : tab === "connection"
              ? "TU CONEXIÓN"
              : "EN TU PANTALLA"}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {tab === "browse"
            ? "¿Qué vemos hoy?"
            : tab === "connection"
              ? "Todo conectado."
              : "Dale al play."}
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Text>
        {!!feedback && (
          <Text accessibilityLiveRegion="polite" style={styles.copy}>
            {feedback}
          </Text>
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
                <CameraView
                  style={{ height: 260 }}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    if (/^[A-F0-9]{32}$/.test(data)) {
                      setCode(data);
                      setScan(false);
                    } else setStatus("Este QR no es un código de Nuvio Remote.");
                  }}
                />
                {button("Cerrar cámara", () => setScan(false))}
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
                <Text style={styles.copy}>Nuvio Remote · 0.3.0</Text>
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
                <View style={styles.row}>
                  {(state.content.seasons || []).map((season: number) => (
                    <View key={season}>
                      {button(
                        `Temporada ${season}${state.content.selectedSeason === season ? " ✓" : ""}`,
                        () => action("catalog.season", { season }),
                        false,
                        true
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}
            {(tab === "browse" ? state.content.items || [] : []).map((item: any, index: number) => (
              <View key={item.key} style={styles.result}>
                {!!item.thumbnail && (
                  <Image
                    source={{ uri: item.thumbnail }}
                    accessibilityIgnoresInvertColors
                    accessible={false}
                    style={{ width: 72, height: 108, borderRadius: 8 }}
                  />
                )}
                <Text style={styles.eyebrow}>
                  {String(index + 1 + state.content.page * 12).padStart(2, "0")}
                </Text>
                {button(
                  item.label,
                  () => action("catalog.activate", { key: item.key }),
                  false,
                  true
                )}
                {!!item.detail && <Text style={styles.copy}>{item.detail}</Text>}
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
  page: { flex: 1, backgroundColor: "#0c0e14" },
  header: {
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 16 : 60,
    paddingHorizontal: 20,
    gap: 20,
    paddingBottom: 8,
    backgroundColor: "#0c0e14"
  },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#ffffff", fontSize: 24, fontWeight: "800", letterSpacing: -1 },
  brandAccent: { color: "#b9a5ff", fontWeight: "400" },
  version: { color: "#8c94a8", fontSize: 13 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: {
    flexGrow: 1,
    minHeight: 48,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24
  },
  tabActive: { backgroundColor: "#c7b8ff" },
  tabText: { color: "#aeb5c5", fontSize: 15, fontWeight: "600" },
  tabTextActive: { color: "#161022" },
  content: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 56,
    gap: 20,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center"
  },
  eyebrow: { color: "#c4b5fd", fontSize: 13, letterSpacing: 2 },
  title: { color: "#fff", fontSize: 32, fontWeight: "700", letterSpacing: -1 },
  mediaTitle: { color: "#fff", fontSize: 21, fontWeight: "600", lineHeight: 29 },
  status: { color: "#ddd", fontSize: 16 },
  card: { backgroundColor: "#161a24", padding: 20, borderRadius: 24, gap: 16 },
  result: { gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#2b3040" },
  playButton: {
    alignSelf: "center",
    minWidth: 112,
    minHeight: 112,
    borderRadius: 56,
    padding: 20,
    backgroundColor: "#c7b8ff",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  playSymbol: { color: "#161022", fontSize: 32 },
  playLabel: { color: "#161022", fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600" },
  input: {
    backgroundColor: "#101014",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#73737e",
    borderRadius: 8,
    minHeight: 48,
    padding: 12,
    fontSize: 16
  },
  button: {
    backgroundColor: "#282e3e",
    borderRadius: 16,
    minHeight: 48,
    padding: 12,
    justifyContent: "center",
    alignItems: "center"
  },
  buttonText: { color: "#fff", fontSize: 16 },
  disabled: { opacity: 0.45 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  copy: { color: "#bbb", fontSize: 14, lineHeight: 22 }
});
