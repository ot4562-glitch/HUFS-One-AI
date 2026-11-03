import {parentPort,workerData} from 'node:worker_threads';
import {decodeApprovedRaster} from '../../dist/packages/ai/src/raster.js';

// Static build path only. The parent bounds copied bytes, lifetime and V8 heap;
// the decoder bounds dimensions, native inflation and JPEG allocator usage.
// No network/model/credentials/environment lookup or arbitrary module loading.
if(!parentPort)throw new Error('Raster worker only');
try{
  const {bytes,...metadata}=decodeApprovedRaster(workerData?.bytes,workerData?.identity);
  parentPort.postMessage({ok:true,metadata});
}catch{
  parentPort.postMessage({ok:false});
}finally{
  parentPort.close();
}
