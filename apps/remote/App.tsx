import React, { useEffect, useRef, useState } from "react";
import { AppState, ScrollView, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Connection } from "./connection";

export default function App() {
  const [status, setStatus] = useState("Empareja tu navegador"),
    [base, setBase] = useState("https://remote.gykstudio.tech"),
    [code, setCode] = useState(""),
    [query, setQuery] = useState(""),
    [scan, setScan] = useState(false),
    [busy, setBusy] = useState(false);
  const [state, setState] = useState<any>(null),
    [permission, requestPermission] = useCameraPermissions();
  const connection = useRef<Connection | null>(null);
  if (!connection.current)
    connection.current = new Connection((m) => {
      if (m.type === "session.snapshot") {
        setState(m.state);
        setStatus(
          m.controlActive === false ? "Conectado · otro móvil tiene el control" : "Conectado"
        );
      } else if (m.type === "connected") setStatus("Esperando autorización y estado de la web");
      else if (m.type === "approved") setStatus("Autorizado. Sincronizando…");
      else if (m.type === "control.changed")
        setStatus(
          m.controlActive
            ? "Tienes el control"
            : "Otro móvil tiene el control. Puedes recuperarlo desde la web."
        );
      else if (m.type === "offline") {
        setState(null);
        setStatus("Sin conexión. Reconectando…");
      } else if (m.type === "revoked") {
        setState(null);
        setStatus("Vínculo caducado o revocado");
      } else if (m.type === "command.result")
        setStatus(
          m.status === "completed"
            ? "Acción completada"
            : m.status === "accepted"
              ? "Orden enviada"
              : `No se pudo ejecutar: ${m.error}`
        );
      else if (m.type === "error") setStatus(`Error: ${m.error}`);
    });
  const c = connection.current;
  useEffect(() => {
    void c.restore().catch(() => setStatus("No se pudo recuperar la sesión"));
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void c.restore();
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
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
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
      {!state ? (
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
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>{c.grant?.sessionName}</Text>
            <Text style={styles.title}>
              {state.playing ? "Reproduciendo" : state.paused ? "En pausa" : "Cargando"}
            </Text>
            <Text style={styles.copy}>
              {Math.floor(state.position || 0)} / {Math.floor(state.duration || 0)} segundos
            </Text>
            <View style={styles.row}>
              {button("Reproducir", () => action("player.play"), !state.available)}
              {button("Pausar", () => action("player.pause"), !state.available)}
            </View>
            <View style={styles.row}>
              {button(
                "−10 s",
                () => action("player.seek", { positionSeconds: Math.max(0, state.position - 10) }),
                !state.available
              )}
              {button(
                "+10 s",
                () =>
                  action("player.seek", {
                    positionSeconds: Math.min(state.duration, state.position + 10)
                  }),
                !state.available
              )}
            </View>
            <View style={styles.row}>
              {button(
                "Volumen −",
                () => action("player.setVolume", { volume: Math.max(0, state.volume - 0.1) }),
                !state.available
              )}
              {button(
                "Volumen +",
                () => action("player.setVolume", { volume: Math.min(1, state.volume + 0.1) }),
                !state.available
              )}
            </View>
            {button(
              state.muted ? "Activar sonido" : "Silenciar",
              () => action("player.setMuted", { muted: !state.muted }),
              !state.available
            )}
          </View>
          <View style={styles.card}>
            <View style={styles.row}>
              {button("Inicio", () => action("navigation.home"))}
              {button("Volver", () => action("navigation.back"))}
            </View>
            <Text style={styles.label}>Buscar en la web</Text>
            <TextInput
              accessibilityLabel="Buscar título en la web"
              style={styles.input}
              value={query}
              onChangeText={setQuery}
            />
            {button("Buscar", () => action("catalog.search", { query }))}
            <Text style={styles.copy}>Elige un resultado o una fuente para abrirlo en la web.</Text>
          </View>
        </>
      )}
      {state?.content && (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>
            {state.content.title}
          </Text>
          {(state.content.items || []).map((item: any) => (
            <View key={item.key} style={{ gap: 8 }}>
              {button(item.label, () => action("catalog.activate", { key: item.key }))}
              {!!item.detail && <Text style={styles.copy}>{item.detail}</Text>}
            </View>
          ))}
          {state.content.pageCount > 1 && (
            <View style={styles.row}>
              {button(
                "Anterior",
                () => action("catalog.page", { page: state.content.page - 1 }),
                state.content.page === 0
              )}
              <Text style={styles.copy}>
                {state.content.page + 1} / {state.content.pageCount}
              </Text>
              {button(
                "Siguiente",
                () => action("catalog.page", { page: state.content.page + 1 }),
                state.content.page + 1 >= state.content.pageCount
              )}
            </View>
          )}
          {(state.content.tracks || []).map((track: any) => (
            <View key={track.key}>
              {button(
                `${track.kind === "audio" ? "Audio" : "Subtítulos"}: ${track.label}${track.selected ? " · seleccionado" : ""}`,
                () => action("player.selectTrack", { key: track.key })
              )}
            </View>
          ))}
        </View>
      )}
      {button("Olvidar vínculo local", () => {
        void c.forget();
        setState(null);
        setStatus("Vínculo eliminado del teléfono. Puedes revocarlo también en la web.");
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
