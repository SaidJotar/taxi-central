import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function AppBadge({ label, variant = "neutral", style, textStyle }) {
  return (
    <View
      style={[
        styles.badge,
        variant === "primary" && styles.primary,
        variant === "success" && styles.success,
        variant === "warning" && styles.warning,
        variant === "danger" && styles.danger,
        variant === "neutral" && styles.neutral,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === "primary" && styles.primaryText,
          variant === "success" && styles.successText,
          variant === "warning" && styles.warningText,
          variant === "danger" && styles.dangerText,
          variant === "neutral" && styles.neutralText,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 13,
    fontWeight: "800",
  },
  primary: {
    backgroundColor: "#dbeafe",
  },
  primaryText: {
    color: "#1d4ed8",
  },
  success: {
    backgroundColor: "#dcfce7",
  },
  successText: {
    color: "#166534",
  },
  warning: {
    backgroundColor: "#ffedd5",
  },
  warningText: {
    color: "#9a3412",
  },
  danger: {
    backgroundColor: "#fee2e2",
  },
  dangerText: {
    color: "#991b1b",
  },
  neutral: {
    backgroundColor: "#e2e8f0",
  },
  neutralText: {
    color: "#334155",
  },
});