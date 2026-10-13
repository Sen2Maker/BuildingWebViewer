/** Match the existing fragment alpha rejection; never a source-data cutoff. */
export const GS_FRAGMENT_ALPHA=1/255;
export function gsOpacityRadius(opacity){
 if(opacity<GS_FRAGMENT_ALPHA)return 0;
 return Math.min(3,Math.sqrt(Math.max(0,2*Math.log(opacity*255)))+.02);
}
