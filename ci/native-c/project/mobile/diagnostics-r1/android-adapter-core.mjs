/** Narrow serialization only. Never pass an AbortSignal, file path, trust policy or update command. */
export function createAndroidAdapters(plugin) {
  if (!plugin) throw new Error('NATIVE_DIAGNOSTIC_BRIDGE_UNAVAILABLE');
  function request(method, ctx, extra = {}) {
    if (ctx.signal?.aborted) return Promise.reject(new Error('DIAGNOSTIC_CANCELLED'));
    const payload = {runId:ctx.runId, ...(ctx.handle ? {handle:ctx.handle} : {}), ...extra};
    const cancel = () => { if (ctx.handle) void plugin.cancelRun({runId:ctx.runId,handle:ctx.handle}).catch(() => {}); };
    ctx.signal?.addEventListener('abort', cancel, {once:true});
    return Promise.resolve().then(() => plugin[method](payload)).finally(() => ctx.signal?.removeEventListener('abort',cancel));
  }
  const native = {
    openRun:ctx => request('openRun',ctx).then(reply => {
      if (typeof reply?.handle !== 'string' || !/^[a-f0-9]{64}$/.test(reply.handle)) throw new Error('INVALID_NATIVE_HANDLE');
      return reply.handle;
    }),
    runtimeSnapshot:ctx => request('runtimeSnapshot',ctx),
    roundTrip:ctx => request('roundTrip',ctx,{challenge:ctx.challenge}),
    probeFilesystem:ctx => request('probeFilesystem',ctx),
    probeScratchStore:ctx => request('probeScratchStore',ctx),
    closeRun:ctx => request('closeRun',ctx)
  };
  const readAsset = async ctx => {
    const reply = await request('readAsset',ctx,{kind:ctx.kind,maxBytes:ctx.maxBytes});
    if (typeof reply?.base64 !== 'string' || reply.base64.length > 4 * Math.ceil(ctx.maxBytes / 3)) throw new Error('ASSET_LIMIT');
    const binary = atob(reply.base64);
    if (binary.length > ctx.maxBytes) throw new Error('ASSET_LIMIT');
    return {rootIdentity:reply.rootIdentity,bytes:Uint8Array.from(binary,c => c.charCodeAt(0))};
  };
  const exportReport = args => plugin.exportReport({runId:args.runId,text:args.text});
  return {native,readAsset,exportReport};
}
