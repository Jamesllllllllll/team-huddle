import { ToastBar as ReactHotToastBar, type ToastPosition, type Toast } from 'react-hot-toast'

export function ToastBar({ toast, position, style }: { toast: Toast; position?: ToastPosition; style?: React.CSSProperties }) {
  return (
    <ReactHotToastBar
      toast={toast}
      position={position}
      style={{
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        ...style,
      }}
    >
      {({ icon, message }) => (
        <>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {icon}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            {message}
          </div>
        </>
      )}
    </ReactHotToastBar>
  )
}

