/**
 * The way back to the index, on a screen too narrow to show both panes.
 *
 * Below 60rem the two-pane surfaces hide the list once a record is open. The
 * cast had a control for getting back; geography and the timeline set the same
 * attribute, hid the same pane, and offered nothing -- on a phone the list was
 * simply gone, and the only way back to it was the browser's own button.
 *
 * It is hidden at every width where the list is still on screen, so it costs
 * the desktop layout nothing.
 */
export default function BackToList({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      className="editorial-button editorial-button--ghost editorial-back-to-cast"
      onClick={onBack}
    >
      {`← ${label}`}
    </button>
  );
}
