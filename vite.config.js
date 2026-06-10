import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

// Helper to parse POST body in Connect middleware
function getRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
}

let runningProcess = null;
let outputBuffer = '';
let processRunning = false;
let exitCode = null;

const setupLocalJavaExecutorMiddleware = (middlewares) => {
  middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api-local/execute') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
      }

      try {
        const { code, fileName } = await getRequestBody(req);
        if (!code || !fileName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: true, output: 'Missing code or fileName' }));
          return;
        }

        // Kill previous process if running (cross-platform compatible kill)
        if (runningProcess) {
          try {
            runningProcess.kill();
          } catch (e) {}
          runningProcess = null;
          processRunning = false;
        }

        const tempDir = path.join(process.cwd(), 'temp_run');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, code, 'utf-8');

        // Compile file
        const javac = spawn('javac', [filePath]);
        let compileStderr = '';

        javac.stderr.on('data', (data) => {
          compileStderr += data.toString();
        });

        javac.on('close', (javacExitCode) => {
          if (javacExitCode !== 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: true, output: compileStderr || 'Compilation failed.' }));
            return;
          }

          const className = fileName.replace(/\.java$/, '');
          processRunning = true;
          exitCode = null;
          outputBuffer = '';

          // Spawn the Java runner
          runningProcess = spawn('java', ['-cp', tempDir, className]);

          runningProcess.stdout.on('data', (data) => {
            outputBuffer += data.toString();
          });

          runningProcess.stderr.on('data', (data) => {
            outputBuffer += data.toString();
          });

          runningProcess.on('close', (javaExitCode) => {
            processRunning = false;
            exitCode = javaExitCode;
            runningProcess = null;
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, running: true }));
        });

      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, output: `Local server error: ${error.message}` }));
      }
      return;
    }

    if (url.pathname === '/api-local/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        running: processRunning,
        output: outputBuffer,
        exitCode: exitCode
      }));
      return;
    }

    if (url.pathname === '/api-local/stop') {
      if (runningProcess) {
        try {
          runningProcess.kill();
        } catch (e) {}
        runningProcess = null;
        processRunning = false;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    next();
  });
};

const localJavaExecutorPlugin = () => ({
  name: 'local-java-executor',
  configureServer(server) {
    setupLocalJavaExecutorMiddleware(server.middlewares);
  },
  configurePreviewServer(server) {
    setupLocalJavaExecutorMiddleware(server.middlewares);
  }
});

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), localJavaExecutorPlugin()],
  server: {
    proxy: {
      '/api-paiza': {
        target: 'https://api.paiza.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-paiza/, '')
      }
    }
  }
})
