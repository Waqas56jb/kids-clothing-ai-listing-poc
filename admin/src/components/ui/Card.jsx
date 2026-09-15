export default function Card({ className = '', hover = false, as: As = 'div', children, ...props }) {
  return (
    <As
      className={`rounded-2xl border border-slate-100 bg-white shadow-soft ${
        hover ? 'transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </As>
  )
}
