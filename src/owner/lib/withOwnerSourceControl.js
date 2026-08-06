/**
 * Attach updateSource to an Owner subscribeOverview unsubscribe fn.
 * Lets pages change client-side source filter without tearing down listeners.
 */
export function withOwnerSourceControl(
  unsubscribe,
  { getSource, setSource, publish, setSourceKey }
) {
  const unsub = () => {
    if (typeof unsubscribe === "function") unsubscribe();
  };
  unsub.updateSource = (nextSource) => {
    const next = nextSource == null ? "All" : nextSource;
    if (getSource() === next) {
      return;
    }
    setSource(next);
    if (typeof setSourceKey === "function") {
      setSourceKey(next);
    }
    publish();
  };
  return unsub;
}
