import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** QR code for the join link, generated locally (no external service). */
export function JoinQr({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then((data) => !cancelled && setSrc(data))
      .catch(() => !cancelled && setSrc(null))
    return () => {
      cancelled = true
    }
  }, [url])
  if (!src) return null
  return <img src={src} alt="QR კოდი თამაშში შესასვლელად" className="mx-auto size-40 rounded-xl sm:size-48" />
}
