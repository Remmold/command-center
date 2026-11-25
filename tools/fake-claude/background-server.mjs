// The child a backgrounded fake Bash call runs: a local HTTP server that prints its URL. Args: port (0 = any free one), exit-after ms, exit code.
import { createServer } from 'node:http'

const [port = '0', exitAfterMs = '', exitCode = '0'] = process.argv.slice(2)
const server = createServer((_req, res) => res.end('ok'))
server.listen(Number(port), '127.0.0.1', () => {
  console.log(`Listening on http://localhost:${server.address().port}`)
  if (exitAfterMs !== '') setTimeout(() => process.exit(Number(exitCode)), Number(exitAfterMs))
})
