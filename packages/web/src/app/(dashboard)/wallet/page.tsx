import { getDb } from "@/lib/db"
import { WalletClient } from "./client"

export interface WalletCardRow {
  id: string
  assistant_id: string | null
  name: string
  card_number: string
  expiry_month: number
  expiry_year: number
  card_type: string | null
  created_at: string
}

export default function WalletPage() {
  let data: WalletCardRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, assistant_id, name, card_number, expiry_month, expiry_year, card_type, created_at FROM wallet_cards ORDER BY created_at DESC LIMIT 500"
      )
      .all() as WalletCardRow[]
  } catch {
    /* table may not exist */
  }
  return <WalletClient data={data} />
}
