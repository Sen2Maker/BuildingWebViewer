import { readPointCloud, parseWireOBJ, samplePointCloud } from './point-io.js';

function cloudCacheAbort(reason) {
  return reason instanceof Error ? reason : new DOMException('点云读取已取消', 'AbortError');
}
function cloudCacheSupports(available, requested) {
  return available === 0 || (requested > 0 && available >= requested);
}

// Completed data and in-flight reads belong to Files; UI consumers own only subscriptions.
export class CloudFileCache {
  constructor({budget = 256 * 1024 * 1024, readCloud = readPointCloud, readWire = async file => parseWireOBJ(await file.text(), file.name)} = {}) {
    this.budget = budget; this.readCloud = readCloud; this.readWire = readWire;
    this.records = new Map(); this.pending = new Map(); this.active = new Set(); this.stats = {reads: 0, hits: 0};
  }
  setActive(files) {
    this.active = new Set(files.filter(Boolean));
    for (const task of [...this.pending.values()]) if (!this.active.has(task.file)) this.cancelTask(task);
    this.trim();
  }
  clear() {
    this.active.clear();
    for (const task of [...this.pending.values()]) this.cancelTask(task);
    this.records.clear();
  }
  forget(file) {
    this.active.delete(file);
    const pending = this.pending.get(file); if (pending) this.cancelTask(pending);
    this.records.delete(file);
  }
  bytes(value) {
    const buffers = new Set();
    for (const array of [value.positions, value.rgb, value.sampleIndices, ...Object.values(value.fields || {})]) {
      if (array?.buffer) buffers.add(array.buffer);
    }
    return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0)
      + (value.vertices?.length || 0) * 24 + (value.edges?.length || 0) * 16;
  }
  trim() {
    let total = [...this.records.values()].reduce((sum, record) => sum + record.bytes, 0);
    for (const [file, record] of this.records) {
      if (total <= this.budget && this.records.size <= 64) break;
      if (this.active.has(file)) continue;
      this.records.delete(file); total -= record.bytes;
    }
  }
  view(record, maxPoints) {
    let result = record.value;
    if (record.kind === 'cloud' && maxPoints > 0 && maxPoints < result.count) {
      if (!record.views.has(maxPoints)) {
        record.views.clear(); record.views.set(maxPoints, samplePointCloud(result, maxPoints));
        record.bytes = this.bytes(record.value) + this.bytes(record.views.get(maxPoints));
      }
      result = record.views.get(maxPoints);
    }
    return result;
  }
  stopIfUnowned(task) {
    if (!task.done && !task.subscribers.size && !this.active.has(task.file)) this.cancelTask(task);
  }
  settle(subscriber, error, value) {
    if (subscriber.done) return;
    subscriber.done = true;
    subscriber.signal?.removeEventListener('abort', subscriber.onAbort);
    subscriber.task.subscribers.delete(subscriber);
    if (error) subscriber.reject(error); else subscriber.resolve(value);
    this.stopIfUnowned(subscriber.task);
  }
  cancelTask(task, {transfer = false} = {}) {
    if (task.done) return [];
    task.done = true;
    if (this.pending.get(task.file) === task) this.pending.delete(task.file);
    const subscribers = [...task.subscribers];
    if (transfer) task.subscribers.clear();
    task.controller.abort();
    if (!transfer) for (const subscriber of subscribers) this.settle(subscriber, cloudCacheAbort());
    return transfer ? subscribers : [];
  }
  notify(task, progress) {
    if (task.done || task.controller.signal.aborted) return;
    task.progress = progress;
    for (const subscriber of [...task.subscribers]) {
      if (subscriber.done || subscriber.signal?.aborted) continue;
      try { subscriber.onProgress?.(progress); }
      catch (error) { this.settle(subscriber, error); }
    }
  }
  start(file, kind, maxPoints, transferred = []) {
    const task = {file, kind, limit: maxPoints, controller: new AbortController(), subscribers: new Set(), progress: null, done: false, promise: null};
    for (const subscriber of transferred) {
      if (subscriber.done) continue;
      subscriber.task = task;
      task.subscribers.add(subscriber);
    }
    this.pending.set(file, task); this.stats.reads++;
    // Start in a microtask so the initiating consumer can subscribe before progress begins.
    task.promise = Promise.resolve().then(() => {
      if (task.controller.signal.aborted) throw cloudCacheAbort();
      const readOptions = {maxPoints, signal: task.controller.signal, onProgress: event => this.notify(task, event)};
      return kind === 'cloud' ? this.readCloud(file, readOptions) : this.readWire(file, readOptions);
    }).then(value => {
      // Even readers that ignore AbortSignal may never publish a stale/cancelled result.
      if (task.done || task.controller.signal.aborted || this.pending.get(file) !== task) throw cloudCacheAbort();
      const record = {kind, value, limit: maxPoints, bytes: this.bytes(value), views: new Map()};
      this.records.delete(file); this.records.set(file, record);
      this.pending.delete(file); task.done = true;
      for (const subscriber of [...task.subscribers]) {
        if (subscriber.signal?.aborted) this.settle(subscriber, cloudCacheAbort(subscriber.signal.reason));
        else {
          try { this.settle(subscriber, null, this.view(record, subscriber.maxPoints)); }
          catch (error) { this.settle(subscriber, error); }
        }
      }
      this.trim(); return record;
    }).catch(error => {
      if (!task.done) {
        task.done = true;
        if (this.pending.get(file) === task) this.pending.delete(file);
        for (const subscriber of [...task.subscribers]) this.settle(subscriber, error);
      }
      throw error;
    });
    // Consumers have their own promises. Handle this owner promise even with no subscribers.
    task.promise.catch(() => {});
    return task;
  }
  subscribe(task, {maxPoints, signal, onProgress}) {
    return new Promise((resolve, reject) => {
      const subscriber = {task, maxPoints, signal, onProgress, resolve, reject, done: false, onAbort: null};
      subscriber.onAbort = () => this.settle(subscriber, cloudCacheAbort(signal?.reason));
      task.subscribers.add(subscriber);
      signal?.addEventListener('abort', subscriber.onAbort, {once: true});
      if (signal?.aborted) subscriber.onAbort();
      else if (task.progress !== null && onProgress) {
        try { onProgress(task.progress); } catch (error) { this.settle(subscriber, error); }
      }
    });
  }
  async read(file, kind, {maxPoints = 0, signal, onProgress} = {}) {
    if (!file) return null;
    if (signal?.aborted) throw cloudCacheAbort(signal.reason);
    if (!Number.isSafeInteger(maxPoints) || maxPoints < 0) throw Error('maxPoints 必须为非负整数；0 表示全量');
    const record = this.records.get(file);
    const sufficient = record && record.kind === kind && (kind === 'wire' || record.value.count === record.value.totalCount
      || cloudCacheSupports(record.limit, maxPoints));
    if (sufficient) {
      this.stats.hits++; this.records.delete(file); this.records.set(file, record);
      const result = this.view(record, maxPoints); this.trim(); return result;
    }
    let task = this.pending.get(file);
    if (task && task.kind === kind && (kind === 'wire' || cloudCacheSupports(task.limit, maxPoints))) this.stats.hits++;
    else {
      // A higher detail request replaces an insufficient parser but keeps live consumers.
      const transferred = task ? this.cancelTask(task, {transfer: task.kind === kind}) : [];
      task = this.start(file, kind, maxPoints, transferred);
    }
    return this.subscribe(task, {maxPoints, signal, onProgress});
  }
}
