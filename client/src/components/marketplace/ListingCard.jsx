import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { storageUrl } from '../../api'
import { categoryLabel, conditionLabel, formatSek } from '../../lib/sv'

export default function ListingCard({ listing, index = 0, onToggleFavorite }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-elevated"
    >
      <Link to={`/marknad/${listing.id}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-sand">
          {listing.cover_image ? (
            <img
              src={storageUrl(listing.cover_image)}
              alt={listing.title}
              className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Ingen bild</div>
          )}
          {listing.status === 'sold' && (
            <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-sand">Såld</span>
          )}
        </div>
      </Link>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(listing)}
          aria-label={listing.is_favorite ? 'Ta bort favorit' : 'Spara som favorit'}
          className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full shadow-soft transition ${
            listing.is_favorite ? 'bg-rose-500 text-white' : 'bg-white/90 text-ink hover:bg-white'
          }`}
        >
          <Heart className="h-4 w-4" fill={listing.is_favorite ? 'currentColor' : 'none'} />
        </button>
      )}
      <Link to={`/marknad/${listing.id}`} className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-display text-lg font-semibold leading-tight text-ink">{listing.title}</h3>
          <p className="shrink-0 font-display text-lg font-bold text-moss">{formatSek(listing.price)}</p>
        </div>
        <p className="text-xs text-slate-500">
          {[categoryLabel(listing.category), listing.size ? `stl ${listing.size}` : null, listing.brand].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-auto pt-2 text-[11px] font-medium text-slate-400">
          {conditionLabel(listing.condition)}
          {listing.seller_name ? ` · ${listing.seller_name}` : ''}
        </p>
      </Link>
    </motion.article>
  )
}
