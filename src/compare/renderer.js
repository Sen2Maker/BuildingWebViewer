import { CloudViewer } from '../cloud/cloud-renderer.js';
import { MeshViewer } from '../lod/renderer.js';
import { createViewerComparison } from '../shared/viewer-comparison.js';

const quietGuides = {axes: false, ruler: false, legend: false, pointCountLabel: false};

/** MeshViewer's ONE-model, real-scale placement, not a per-pane normalization.
 * Keep this origin identical to its midpoint-XY/minimum-Z translation. The cloud
 * retains its original coordinates and uses this exact origin in its shader.
 */
export function meshComparisonFrame(mesh) {
  if (!Array.isArray(mesh?.vertices) || !mesh.vertices.length || !Array.isArray(mesh.faces)) throw Error('Invalid comparison mesh');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of mesh.vertices) {
    if (!Array.isArray(point) || point.length < 3 || !point.slice(0, 3).every(Number.isFinite)) throw Error('Invalid comparison mesh coordinates');
    for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]); }
  }
  const origin = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
  if (!origin.every(Number.isFinite)) throw Error('Comparison coordinates exceed the supported range');
  return {origin, bounds: [min, max], scale: 1};
}

/** Two renderers, one world transform and camera. Loading one side never clears
 * the other side. Data selection is explicit so late callbacks cannot cross IDs.
 */
export class PairedComparisonRenderer {
  constructor(cloudCanvas, meshCanvas, {preset = {}, onError = () => {}} = {}) {
    this.id = null; this.meshData = null; this.cloudData = null; this.cloudParts = []; this.frame = null; this.disposed = false;
    this.cloud = new CloudViewer(cloudCanvas, {onError: message => onError('cloud', message)});
    try { this.mesh = new MeshViewer(meshCanvas, {onError: message => onError('mesh', message)}); }
    catch (error) { this.cloud.dispose(); throw error; }
    this.comparison = createViewerComparison(() => [this.cloud, this.mesh], () => !this.disposed);
    this.comparison.install(this.cloud); this.comparison.install(this.mesh);
    this.comparison.pause(() => {
      const common = {grid: false, palette: 'viridis', reverse: false};
      for (const key of Object.keys(common)) if (preset[key] !== undefined) common[key] = preset[key];
      const point = {pointSize: 2, pointOpacity: 1, colorMode: 'height'};
      for (const key of ['pointSize', 'pointOpacity', 'pointColor', 'colorMode']) if (preset[key] !== undefined) point[key] = preset[key];
      this.cloud.setOptions({...common, ...point, ...quietGuides, pointRatio: 100, showPoints: true, showWire: false, lineStyle: 'native'});
      this.mesh.setOptions({...common, ...quietGuides, mode: 'solid', colors: 'surface', scale: 'real', labels: false, edges: true, lineStyle: 'native'});
    });
  }

  select(id) {
    if (this.disposed) return;
    this.id = id; this.meshData = null; this.cloudData = null; this.cloudParts = []; this.frame = null;
    this.comparison.pause(() => {
      this.cloud.setClouds([], {preserveView: false});
      // Parsed neighbors belong to the bounded session cache, not a second GPU cache.
      this.cloud.clearCache();
      this.mesh.setModels([]);
    });
  }

  setMesh(id, mesh) {
    if (this.disposed || id !== this.id) return false;
    if (String(mesh?.id) !== String(id)) throw Error('Comparison mesh ID does not match the selected building');
    const frame = meshComparisonFrame(mesh);
    this.comparison.pause(() => {
      // A single real-scale model has zero synthetic XY placement and unit scale.
      this.mesh.setModels([mesh], {referenceModels: [mesh]});
      this.mesh.camera.zoom = 1.25; this.mesh.render();
      this.frame = frame; this.meshData = mesh;
      this.cloud.setClouds(this.cloudParts,
        {bounds: frame.bounds, origin: frame.origin, preserveView: false});
    });
    this.comparison.sync(this.mesh);
    return true;
  }

  setCloud(id, cloud) {
    if (this.disposed || id !== this.id) return false;
    this.comparison.pause(() => {
      this.cloudParts = [{key: id, name: id, cloud}];
      this.cloud.setClouds(this.cloudParts, this.frame
        ? {bounds: this.frame.bounds, origin: this.frame.origin, preserveView: true}
        : {preserveView: false});
      this.cloudData = cloud;
    });
    // Crucially, do not fit or reset the mesh camera when the async cloud arrives.
    this.comparison.sync(this.meshData ? this.mesh : this.cloud);
    return true;
  }

  appendCloud(id, nodeId, cloud) {
    if(this.disposed || id!==this.id || this.cloudParts.some(part=>part.key===`${id}/${nodeId}`))return false;
    const parts=[...this.cloudParts,{key:`${id}/${nodeId}`,name:id,cloud}];
    this.comparison.pause(()=>this.cloud.setClouds(parts, this.frame
      ? {bounds:this.frame.bounds,origin:this.frame.origin,preserveView:true} : {preserveView:true}));
    this.cloudParts=parts;
    this.comparison.sync(this.meshData ? this.mesh : this.cloud);
    return true;
  }

  resetView() {
    if (this.disposed) return;
    if (this.meshData) this.setMesh(this.id, this.meshData);
    else if (this.cloudData) this.setCloud(this.id, this.cloudData);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.cloud.dispose(); this.mesh.destroy();
    this.meshData = null; this.cloudData = null; this.cloudParts = []; this.frame = null;
  }
}
