import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const project = fileURLToPath(new URL('../', import.meta.url));
const url = 'http://127.0.0.1:4173/';
const open = () => {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  const child = spawn(command, [url], { stdio: 'ignore' });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
};
try {
  const response = await fetch(url, {signal:AbortSignal.timeout(1000)});
  const html = await response.text();
  if (response.ok && html.includes('Mandate')) { console.log(`Mandate is already running at ${url}`); open(); process.exit(0); }
  console.error('Port 4173 is being used by another application. Close that application or run npm run dev with another port.'); process.exit(1);
} catch {}
const server = spawn(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {cwd:project,stdio:['inherit','pipe','inherit']});
let opened = false;
server.stdout.on('data', data => { process.stdout.write(data); if(!opened && data.toString().includes('Local:')) {opened=true;open();} });
server.on('exit', code => process.exit(code ?? 0));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
