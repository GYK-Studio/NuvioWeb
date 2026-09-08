import React, { useEffect, useRef, useState } from "react";
import { AppState, ScrollView, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Connection } from "./connection";
import { emptySession, sessionEvent } from "./session";

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
  const [session, setSession] = useState(emptySession);
  const [feedback, setFeedback] = useState("");
  const state = session.snapshot || {
    available: false,
    position: 0,
    duration: 0,
    volume: 1,
    muted: false
  };
  const canControl = session.approved && session.online && session.active;
  const [permission, requestPermission] = useCameraPermissions();
  const connection = useRef<Connection | null>(null);
  if (!connection.current)
    connection.current = new Connection((m) => {
      setSession((previous) => sessionEvent(previous, m));
      if (m.type === "session.snapshot") {
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
  useEffect(() => {
    void c.restore().catch(() => setStatus("No se pudo recuperar la sesión"));
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void c.restore().catch(() => setStatus("No se pudo recuperar la sesión"));
      else c.disconnect();
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
      style={[styles.button, (disabled || (command && !canControl)) && styles.disabled]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>NUVIO REMOTE</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Tu web, a mano.
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
          <Text style={styles.label}>Código de la web</Text>
          <TextInput
            accessibilityLabel="Código de emparejamiento"
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
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
              setBusy(true);
              void c
                .claim(base, code)
                .catch((e) => setStatus(e.message))
                .finally(() => setBusy(false));
            },
            busy
          )}
          <Text style={styles.copy}>
            Abre Ajustes → About → Control desde móvil en la web. Aprueba el teléfono allí. El
            vínculo de esta versión dura hasta 15 minutos.
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
          <View style={styles.card}>
            <Text style={styles.label}>{c.grant?.sessionName}</Text>
            {!session.online && (
              <Text style={styles.copy}>
                Abre de nuevo la web. El mando se reconectará sin reenviar órdenes antiguas.
              </Text>
            )}
            {!session.snapshot && (
              <Text style={styles.copy}>
                El teléfono ya está aprobado. Esperando catálogo y reproductor; puedes usar Inicio o
                Buscar.
              </Text>
            )}
            {button("Actualizar estado", () => c.sync())}
            <Text style={styles.title}>
              {!state.available ? "Sin vídeo activo" : state.playing ? "Reproduciendo" : "En pausa"}
            </Text>
            <Text style={styles.copy}>
              {clock(state.position)} / {clock(state.duration)} · Volumen{" "}
              {Math.round((state.volume ?? 1) * 100)} %
            </Text>
            <View style={styles.row}>
              {button("Reproducir", () => action("player.play"), !state.available, true)}
              {button("Pausar", () => action("player.pause"), !state.available, true)}
            </View>
            <View style={styles.row}>
              {button(
                "−10 s",
                () => action("player.seek", { positionSeconds: Math.max(0, state.position - 10) }),
                !state.available,
                true
              )}
              {button(
                "+10 s",
                () =>
                  action("player.seek", {
                    positionSeconds: Math.min(state.duration, state.position + 10)
                  }),
                !state.available,
                true
              )}
            </View>
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
          </View>
          <View style={styles.card}>
            <View style={styles.row}>
              {button("Inicio", () => action("navigation.home"), false, true)}
              {button("Volver", () => action("navigation.back"), false, true)}
            </View>
            <Text style={styles.label}>Buscar en la web</Text>
            <TextInput
              accessibilityLabel="Buscar título en la web"
              style={styles.input}
              value={query}
              onChangeText={setQuery}
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
            <Text style={styles.copy}>Elige un resultado o una fuente para abrirlo en la web.</Text>
          </View>
        </>
      )}
      {session.approved && state?.content && (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>
            {state.content.title}
          </Text>
          {!state.content.items?.length && !state.content.tracks?.length && (
            <Text style={styles.copy}>
              No hay opciones en esta pantalla. Usa Buscar para elegir un título; si acabas de
              buscar, espera a que la web cargue los resultados.
            </Text>
          )}
          {(state.content.items || []).map((item: any) => (
            <View key={item.key} style={{ gap: 8 }}>
              {button(item.label, () => action("catalog.activate", { key: item.key }), false, true)}
              {!!item.detail && <Text style={styles.copy}>{item.detail}</Text>}
            </View>
          ))}
          {state.content.pageCount > 1 && (
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
          {(state.content.tracks || []).map((track: any) => (
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
      {session.paired &&
        button("Desvincular esta web", () => {
          void c
            .forget()
            .then(() =>
              setStatus("Vínculo eliminado. Si la web estaba desconectada, revócalo también allí.")
            )
            .catch(() => setStatus("No se pudo borrar el vínculo guardado. Inténtalo de nuevo."));
        })}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101014" },
  content: { padding: 24, paddingTop: 64, paddingBottom: 48, gap: 24 },
  eyebrow: { color: "#c4b5fd", fontSize: 13, letterSpacing: 2 },
  title: { color: "#fff", fontSize: 28, fontWeight: "600" },
  status: { color: "#ddd", fontSize: 16 },
  card: { backgroundColor: "#1c1c24", padding: 20, borderRadius: 16, gap: 16 },
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
    backgroundColor: "#343040",
    borderRadius: 8,
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
