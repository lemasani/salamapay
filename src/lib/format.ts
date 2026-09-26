export function tzs(n: number): string {
  return `TZS ${n.toLocaleString("en-US")}`;
}

export function when(d: Date | string): string {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const LEVEL_STYLE = {
  low: { text: "text-salama", bg: "bg-salama-tint", label: "Low risk" },
  medium: { text: "text-amber", bg: "bg-amber-tint", label: "Medium risk" },
  high: { text: "text-crimson", bg: "bg-crimson-tint", label: "High risk" },
} as const;
