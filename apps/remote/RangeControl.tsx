import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { rangeValue } from "./controls";

export function RangeControl({
  label,
  value,
  max,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const lastSent = useRef<{ value: number; at: number }>({ value: NaN, at: 0 });
  const bounded = Math.max(0, Math.min(max || 0, value || 0));
  const change = (next: number) => {
    if (!disabled && max > 0) onChange(Math.max(0, Math.min(max, next)));
  };
  // Arrastrar el dedo mueve la barra; se limita el envío para no saturar la web.
  const drag = (locationX: number) => {
    if (disabled || max <= 0) return;
    const next = Math.max(0, Math.min(max, rangeValue(locationX, width, max)));
    const now = Date.now();
    if (Math.abs(next - lastSent.current.value) < max / 100 && now - lastSent.current.at < 400)
      return;
    lastSent.current = { value: next, at: now };
    onChange(next);
  };
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityValue={{ min: 0, max, now: bounded }}
        accessibilityActions={[
          { name: "increment", label: "Aumentar" },
          { name: "decrement", label: "Reducir" }
        ]}
        onAccessibilityAction={(e) =>
          change(bounded + ((e.nativeEvent.actionName === "increment" ? 1 : -1) * max) / 20)
        }
        disabled={disabled || max <= 0}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => change(rangeValue(e.nativeEvent.locationX, width, max))}
        onTouchMove={(e) => drag(e.nativeEvent.locationX)}
        onTouchEnd={() => {
          lastSent.current = { value: NaN, at: 0 };
        }}
        style={s.target}
      >
        <View pointerEvents="none" style={[s.track, disabled && { opacity: 0.4 }]}>
          <View style={[s.fill, { width: `${max > 0 ? (bounded / max) * 100 : 0}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { gap: 4 },
  label: { color: "#B7BAC5", fontSize: 13, fontWeight: "600" },
  target: { minHeight: 48, justifyContent: "center" },
  track: { height: 7, backgroundColor: "#30333D", borderRadius: 4, overflow: "hidden" },
  fill: { height: 7, backgroundColor: "#FF735F", borderRadius: 4 }
});
