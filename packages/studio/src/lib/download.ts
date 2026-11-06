/**
 * Browser download side effect, isolated from the pure spec builder so the
 * export content stays unit-testable without a DOM.
 */

/** Trigger a client-side file download for a text document. */
export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
