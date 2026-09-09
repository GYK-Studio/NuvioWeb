import React, { useState } from "react";
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
  const bounded = Math.max(0, Math.min(max || 0, value || 0));
  const change = (next: number) => {
    if (!disabled && max > 0) onChange(Math.max(0, Math.min(max, next)));
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
  label: { color: "#bcc2d1", fontSize: 13 },
  target: { minHeight: 48, justifyContent: "center" },
  track: { height: 6, backgroundColor: "#34394b", borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, backgroundColor: "#c7b8ff", borderRadius: 3 }
});
