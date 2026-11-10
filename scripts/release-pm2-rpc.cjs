/* eslint-disable @typescript-eslint/no-require-imports -- Uses the pinned installed PM2 runtime. */
const fs = require('node:fs');
const path = require('node:path');

function restartPacket(app) {
  if (app.name !== 'midnight-ink' || !path.isAbsolute(app.pm_cwd) || app.pm_exec_path !== path.join(app.pm_cwd, 'scripts', 'server.mjs')) throw new Error('Invalid scoped restart configuration.');
  return { id: 30, env: { ...app.env, current_conf: { ...app } } };
}
module.exports = { restartPacket };

async function main() {
  const [root, action, approval] = process.argv.slice(2);
  if (!['inspect','deploy','rollback'].includes(action)) throw new Error();
  if (action !== 'inspect' && approval !== '--approved') throw new Error();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (manifest.appId !== 30 || manifest.appName !== 'midnight-ink') throw new Error();
  const daemonPid = Number(fs.readFileSync(path.join(manifest.pm2Home, 'pm2.pid'), 'utf8').trim());
  process.kill(daemonPid, 0);
  const pm2Root = path.dirname(path.dirname(manifest.pm2Cli));
  const Client = require(path.join(pm2Root, 'lib', 'Client.js'));
  const conf = { ...require(path.join(pm2Root, 'constants.js')), ...require(path.join(pm2Root, 'paths.js'))(manifest.pm2Home) };
  // Deliberately bypass constructor/initFileStructure and start()/executeRemote().
  // launchRPC connects only to the existing socket and has no daemon launch path.
  const client = Object.create(Client.prototype);
  client.conf = conf;
  client.rpc_socket_file = conf.DAEMON_RPC_PORT;
  const connectDeadline = setTimeout(() => process.exit(1), 10000);
  try {
    await new Promise((resolve,reject) => client.launchRPC(error => error ? reject(error) : resolve()));
    clearTimeout(connectDeadline);
    const call = (method, payload) => new Promise((resolve,reject) => client.client.call(method, payload, (error,result) => error ? reject(error) : resolve(result)));
    const target = async () => {
      const apps = await call('getMonitorData', {});
      const matches = apps.filter(app => app.name === 'midnight-ink');
      if (matches.length !== 1 || matches[0].pm_id !== 30) throw new Error();
      return matches[0];
    };
    const current = await target();
    const environmentMatches = manifest.environmentKeys.every(key => {
      const value = Object.hasOwn(current.pm2_env,key) ? current.pm2_env[key] : current.pm2_env.env?.[key];
      return value !== undefined && String(value) === process.env[key];
    });
    if (action === 'inspect') {
      process.stdout.write(JSON.stringify({name:current.name,pm_id:current.pm_id,pid:current.pid,environmentMatches,pm2_env:{pm_cwd:current.pm2_env.pm_cwd,pm_exec_path:current.pm2_env.pm_exec_path,status:current.pm2_env.status}}));
      return;
    }
    const expected = action === 'deploy' ? manifest.originalCwd : manifest.releasePath;
    if (!environmentMatches || current.pm2_env.pm_cwd !== expected || current.pm2_env.pm_exec_path !== path.join(expected,'scripts','server.mjs')) throw new Error();
    const app = require(path.join(root,action === 'deploy' ? 'deploy.config.cjs' : 'rollback.config.cjs')).apps[0];
    const destination = action === 'deploy' ? manifest.releasePath : manifest.rollbackPath;
    if (app.pm_cwd !== destination) throw new Error();
    await call('restartProcessId', restartPacket(app));
    process.stdout.write('Scoped restart request completed for app 30.');
  } finally {
    clearTimeout(connectDeadline);
    client.disconnectRPC(() => {});
  }
}

if (require.main === module) {
  const deadline = setTimeout(() => process.exit(1), 145000);
  main().then(() => { clearTimeout(deadline); process.exit(0); }, () => {
    // Raw PM2 errors can contain runtime configuration; emit no error objects.
    process.stderr.write('Existing-daemon PM2 operation failed; inspect before retrying.');
    process.exit(1);
  });
}
