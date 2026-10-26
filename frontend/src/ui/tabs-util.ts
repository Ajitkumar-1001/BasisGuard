export function resolveTabId(tabs: readonly { id: string }[], defaultId: string): string {
  return tabs.some((t) => t.id === defaultId) ? defaultId : (tabs[0]?.id ?? defaultId);
}
