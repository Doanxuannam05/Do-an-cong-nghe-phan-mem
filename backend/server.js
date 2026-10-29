const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Tự động mount các routes từ thư mục routes/
const routesDir = path.join(__dirname, 'routes')
if (fs.existsSync(routesDir)) {
  for (const file of fs.readdirSync(routesDir)) {
    if (!file.endsWith('.js') && !file.endsWith('.ts')) continue
    const name = file.replace(/\.(js|ts)$/, '')
    try {
      const handler = require(path.join(routesDir, file))
      if (typeof handler === 'function') {
        app.use(`/api/${name}`, handler)
        console.log(`Route registered: /api/${name}`)
      }
    } catch (err) {
      console.error(`Failed to load route ${file}:`, err.message)
    }
  }
}

const port = Number(process.env.BACKEND_PORT) || 3001
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
  require('./lib/bootstrap')
    .ready()
    .then(() => {
      console.log('[bootstrap] system ready')
    })
    .catch((err) => {
      console.error('[bootstrap] init failed:', err.message)
    })
})
