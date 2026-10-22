/** Escapes text for Telegram's HTML parse_mode (only &, < and > are special). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
