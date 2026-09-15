export default function Card({ className = '', hover = false, as: As = 'div', children, ...props }) {
  return (
    <As
      className={`rounded-3xl border border-white/80 bg-white/90 shadow-soft backdrop-blur-sm ${
        hover
          ? 'transition duration-300 ease-out hover:-translate-y-1 hover:border-brand-100 hover:shadow-elevated'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </As>
  )
}
