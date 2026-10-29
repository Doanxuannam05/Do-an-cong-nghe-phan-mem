/** Cache danh mục chuyên khoa (ít thay đổi) để không tốn truy vấn ở mỗi lần matching */
const { q } = require('./db')

let cache = null
let loadedAt = 0
const TTL = 60_000

async function specialties(force = false) {
  if (!force && cache && Date.now() - loadedAt < TTL) return cache
  const rows = await q(`SELECT id, name, slug, description, icon, related, status FROM specialties WHERE deleted_at IS NULL ORDER BY id`)
  cache = rows
  loadedAt = Date.now()
  return rows
}

function invalidate() {
  cache = null
}

async function relatedIds(specialtyId) {
  const list = await specialties()
  const s = list.find((x) => x.id === Number(specialtyId))
  if (!s) return []
  const slugs = Array.isArray(s.related) ? s.related : []
  return list.filter((x) => slugs.includes(x.slug)).map((x) => x.id)
}

module.exports = { specialties, relatedIds, invalidate }
