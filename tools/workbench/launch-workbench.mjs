import {loadLaunchSettings,buildLaunchOptions,legacyLaunchEnvironment} from './launch-config.mjs';
export async function startWorkbench({createServer,env=process.env,onListening=()=>{},installSignals=true}={}) {
  const settings=await loadLaunchSettings({configPath:env.WORKBENCH_CONFIG,legacySettings:legacyLaunchEnvironment(env)});
  const options=buildLaunchOptions(settings);
  const server=createServer(options);
  server.on('executionError',()=>console.error('Workbench background execution needs attention. Inspect the project execution record.'));
  try { await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});}); }
  catch (error) { await new Promise(resolve=>server.close(()=>resolve())); throw error; }
  const stop=()=>server.close();
  if(installSignals){process.once('SIGTERM',stop);process.once('SIGINT',stop);server.once('close',()=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);});}
  onListening(server.address().port);
  return server;
}
