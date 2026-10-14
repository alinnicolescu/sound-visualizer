import { useNotices } from '../state/notices'

/** Brief messages over the bottom of the 3D view. Click one to dismiss it. */
export function Notices() {
  const items = useNotices((s) => s.items)
  const dismiss = useNotices((s) => s.dismiss)
  if (!items.length) return null
  return (
    <div className="notices">
      {items.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} onClick={() => dismiss(n.id)}>
          {n.text}
        </div>
      ))}
    </div>
  )
}
