import { StyleSheet } from "react-native";
import { UI } from "./ui";

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.bg,
  },
  content: {
    padding: UI.spacing.md,
  },
  card: {
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.lg,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.md,
    ...UI.shadowCard,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: UI.colors.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: UI.colors.textSoft,
  },
  input: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: UI.radius.md,
    borderWidth: 1,
    borderColor: "#dbe1ea",
    backgroundColor: "#fff",
    fontSize: 16,
    color: UI.colors.text,
  },
  button: {
    borderRadius: UI.radius.md,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: UI.colors.primary,
  },
  buttonDark: {
    backgroundColor: "#1f2937",
  },
  buttonSuccess: {
    backgroundColor: UI.colors.success,
  },
  buttonDanger: {
    backgroundColor: UI.colors.danger,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionHeader: {
    marginBottom: 14,
  },
  emptyText: {
    color: UI.colors.textSoft,
    fontSize: 15,
  },
  errorText: {
    color: UI.colors.danger,
    fontSize: 15,
    fontWeight: "600",
  },
});