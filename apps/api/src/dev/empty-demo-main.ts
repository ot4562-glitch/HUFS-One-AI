import {createSyntheticEmptyDemoApi} from './empty-demo-fixture.js';
if(process.argv.length!==3||process.argv[2]!=='--synthetic')throw Error('Use --synthetic for the invented local demonstration');
const origin=process.env.EMPTY_DEMO_ORIGIN??'http://127.0.0.1:5173';
const app=createSyntheticEmptyDemoApi({mode:'SYNTHETIC',allowedOrigin:origin});
await app.listen({host:'127.0.0.1',port:3000});
process.stdout.write('SYNTHETIC EMPTY_DEMO only; memory storage; no real login, PG or provider.\nOpen '+origin+'/api/dev/empty-demo/bootstrap\n');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
