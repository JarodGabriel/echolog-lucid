import type { ConnectorStatus, MeetingSource } from "@/lib/types";

const DISABLED_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

export function connectorEnabled(source: MeetingSource) {
  const envName = source === "granola" ? "ENABLE_GRANOLA" : "ENABLE_FATHOM";
  const value = process.env[envName]?.trim().toLowerCase();
  return !value || !DISABLED_VALUES.has(value);
}

export function disabledConnectorStatus(source: MeetingSource): ConnectorStatus {
  const envName = source === "granola" ? "ENABLE_GRANOLA" : "ENABLE_FATHOM";
  return {
    enabled: false,
    configured: false,
    connected: false,
    label: connectorLabel(source),
    error: `${connectorName(source)} is disabled for this deployment. Set ${envName}=true to enable it.`
  };
}

export function connectorLabel(source: MeetingSource) {
  return source === "granola" ? "Granola personal account" : "Fathom work account";
}

export function connectorName(source: MeetingSource) {
  return source === "granola" ? "Granola" : "Fathom";
}
