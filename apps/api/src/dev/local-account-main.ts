import {createLocalAccountApi} from '../modules/local-accounts/http.js';

/** Opt-in local invented-account workbench; never wires into the normal production entrypoint. */
if(!process.argv.includes('--synthetic'))throw new Error('Explicit --synthetic flag is required. This is not real authentication.');
const host=process.env.LOCAL_ACCOUNT_HOST??'127.0.0.1';
if(!['127.0.0.1','::1','localhost'].includes(host))throw new Error('Local accounts may only bind to loopback');
const port=Number(process.env.LOCAL_ACCOUNT_PORT??'3000');
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid local account port');
const app=createLocalAccountApi({mode:'SYNTHETIC',allowedOrigin:process.env.LOCAL_ACCOUNT_ORIGIN??'http://127.0.0.1:5173'});
await app.listen({host,port});
process.stdout.write(`SYNTHETIC local account workbench on http://${host}:${port}; invented accounts only, not real login.\n`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
