import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable eksik')
}

// NOT (doküman düzeltmesi): apiVersion PIN'LENMEDİ. Doküman '2024-12-18.acacia'
// yazıyordu ama bu, kurulu stripe SDK'sının beklediği literal tiple çakışıp TS
// hatası verebilir. apiVersion vermeyince SDK kendi varsayılanını (tipleriyle
// uyumlu) kullanır — dev için doğru ve güvenli.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
})
