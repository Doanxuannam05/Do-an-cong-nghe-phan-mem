/**
 * GỢI Ý CHUYÊN KHOA TỪ MÔ TẢ TRIỆU CHỨNG (AI hỗ trợ – mức tham khảo)
 *
 * Phương pháp: mô hình từ vựng có trọng số (weighted lexicon) trên văn bản tiếng Việt đã chuẩn hóa
 *   1. Chuẩn hóa: chữ thường, bỏ dấu (NFD), "đ" → "d" → khớp được cả "đau họng" và "dau hong".
 *   2. Mỗi chuyên khoa có tập cụm từ khóa kèm trọng số w (cụm đặc hiệu w cao, cụm chung w thấp).
 *   3. Điểm(chuyên khoa) = Σ w của các cụm xuất hiện; ngữ cảnh "trẻ em/bé" tăng Nhi khoa,
 *      "mang thai/bầu" tăng Sản khoa.
 *   4. Độ tin cậy = softmax(điểm) của chuyên khoa cao nhất.
 *   5. Phát hiện dấu hiệu nguy hiểm (red flags) → khuyến cáo gọi cấp cứu 115.
 *
 * Phạm vi: CHỈ gợi ý chuyên khoa để tìm bác sĩ. KHÔNG chẩn đoán, KHÔNG kê đơn, KHÔNG điều trị.
 * Mở rộng (Phase 2): thay bằng mô hình phân loại văn bản (PhoBERT / Naive Bayes) huấn luyện trên dữ liệu được phép sử dụng.
 */
const DISCLAIMER = 'Thông tin do hệ thống cung cấp chỉ nhằm mục đích hỗ trợ tham khảo và không thay thế chẩn đoán hoặc tư vấn của bác sĩ.'

const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

const LEXICON = {
  'tai-mui-hong': { 'dau hong': 3, 'rat hong': 3, 'viem hong': 3, 'nuot dau': 3, 'khan tieng': 3, 'mat tieng': 3, 'nghet mui': 3, 'so mui': 2.5, 'chay mui': 2.5, 'hat hoi': 2, 'viem xoang': 3.5, 'xoang': 2.5, 'u tai': 3, 'dau tai': 3, 'chay mu tai': 3.5, 'nghe kem': 2.5, 'amidan': 3, 'chay mau cam': 2.5, 'ho': 1, 'sot': 0.8 },
  'tim-mach': { 'dau nguc': 3, 'tuc nguc': 3, 'hoi hop': 2.5, 'danh trong nguc': 3, 'tim dap nhanh': 3.5, 'tim dap': 2.5, 'cao huyet ap': 3.5, 'huyet ap': 2.5, 'kho tho khi gang suc': 3, 'phu chan': 2, 'loan nhip': 3.5 },
  'da-lieu': { 'noi man': 3, 'man do': 3, 'ngua': 2.5, 'mun': 3, 'tri mun': 3.5, 'phat ban': 3, 'me day': 3.5, 'di ung da': 3.5, 'nam da': 3.5, 'viem da': 3.5, 'rung toc': 2.5, 'da kho': 2.5, 'bong da': 2, 'zona': 3, 'eczema': 3.5, 'vay nen': 3.5, 'tham nam': 2.5 },
  'nhi-khoa': { 'tre so sinh': 4, 'so sinh': 3, 'tre em': 2.5, 'em be': 2.5, 'con toi': 2, 'chau be': 2.5, 'be bi': 2, 'be nha': 2, 'thang tuoi': 3, 'tiem chung': 3, 'bieng an': 2.5, 'cham lon': 3 },
  'noi-khoa': { 'sot': 1.2, 'met moi': 1.5, 'dau bung': 2.5, 'dau da day': 3.5, 'trao nguoc': 3, 'tieu chay': 2.5, 'tao bon': 2.5, 'buon non': 2, 'non': 1.2, 'ho': 1.2, 'ho dom': 2, 'cam cum': 2, 'cum': 1.5, 'tieu duong': 3.5, 'duong huyet': 3, 'sut can': 2, 'an khong tieu': 3, 'day hoi': 2.5, 'kho tho': 1.5 },
  'ngoai-khoa': { 'vet thuong': 3.5, 'bi dut tay': 3.5, 'dut tay': 3, 'chay mau': 1.5, 'bong': 2, 'gay xuong': 4, 'bong gan': 3.5, 'trat khop': 3.5, 'te nga': 3, 'chan thuong': 3.5, 'sung dau': 2, 'mun nhot': 2, 'ap xe': 3, 'khau': 2 },
  'san-khoa': { 'mang thai': 4, 'co thai': 4, 'bau': 2.5, 'thai ky': 4, 'tre kinh': 3.5, 'kinh nguyet': 3, 'dau bung kinh': 3.5, 'ra huyet': 3, 'khi hu': 3.5, 'nghen': 2.5, 'sau sinh': 3.5, 'tranh thai': 3 },
  'rang-ham-mat': { 'dau rang': 4, 'sau rang': 4, 'e buot': 3, 'buot rang': 3.5, 'chay mau chan rang': 4, 'loi': 2, 'nuou': 3, 'rang khon': 4, 'hoi mieng': 3, 'nhiet mieng': 3, 'lo mieng': 2.5, 'nieng rang': 3.5, 'ham': 1.5 },
  mat: { 'dau mat': 3.5, 'mat do': 3, 'do mat': 3, 'mo mat': 3.5, 'nhin mo': 3.5, 'cay mat': 3, 'kho mat': 3.5, 'chay nuoc mat': 3, 'can thi': 4, 'loan thi': 4, 'vien thi': 4, 'ghen mat': 3, 'le mat': 3, 'ngua mat': 2.5 },
  'than-kinh': { 'dau dau': 3, 'nhuc dau': 3, 'chong mat': 3, 'hoa mat': 2.5, 'mat ngu': 3.5, 'kho ngu': 3, 'te tay': 3, 'te chan': 3, 'te bi': 3, 'run tay': 3, 'dau nua dau': 4, 'migraine': 4, 'quen': 2, 'mat tri nho': 3.5, 'roi loan tien dinh': 4, 'tien dinh': 3 },
}

const CONTEXT = [
  { re: /\b(be|con toi|con em|chau|tre|thang tuoi|tuoi be|so sinh)\b/, slug: 'nhi-khoa', boost: 2.5 },
  { re: /\b(mang thai|co thai|bau|thai ky)\b/, slug: 'san-khoa', boost: 2 },
]

const RED_FLAGS = ['dau nguc du doi', 'kho tho du doi', 'kho tho nang', 'ngat', 'bat tinh', 'co giat', 'liet', 'meo mieng', 'noi ngong', 'non ra mau', 'di ngoai ra mau', 'chay mau nhieu', 'sot cao co giat', 'tu tu', 'ngo doc', 'tai nan']

function suggest(text) {
  const t = ` ${normalize(text)} `
  if (t.trim().length < 3) return null
  const scores = {}
  const matched = {}
  for (const [slug, words] of Object.entries(LEXICON)) {
    for (const [kw, w] of Object.entries(words)) {
      if (t.includes(` ${kw} `)) {
        scores[slug] = (scores[slug] || 0) + w
        ;(matched[slug] = matched[slug] || []).push(kw)
      }
    }
  }
  const hasAny = Object.keys(scores).length > 0
  for (const c of CONTEXT) if (c.re.test(t) && hasAny) scores[c.slug] = (scores[c.slug] || 0) + c.boost

  const redFlags = RED_FLAGS.filter((f) => t.includes(` ${f} `) || t.includes(f))
  if (!hasAny) {
    return { slug: 'noi-khoa', confidence: 0.3, alternatives: [], matched: [], redFlags, fallback: true }
  }
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1])
  // softmax với nhiệt độ T = 1.5 → độ tin cậy trong (0, 1)
  const exps = entries.map(([, s]) => Math.exp(s / 1.5))
  const sum = exps.reduce((a, b) => a + b, 0)
  const ranked = entries.map(([slug, s], i) => ({ slug, score: Math.round(s * 10) / 10, confidence: Math.round((exps[i] / sum) * 100) / 100, matched: matched[slug] || [] }))
  return { slug: ranked[0].slug, confidence: ranked[0].confidence, alternatives: ranked.slice(1, 3), matched: ranked[0].matched, redFlags, fallback: false }
}

module.exports = { suggest, normalize, DISCLAIMER }
