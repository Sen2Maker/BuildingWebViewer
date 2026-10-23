package io.github.sen2maker.buildingwebviewer;
/** Time-based smoothing of received input only; no extrapolated inertia. */
final class NativeGaussianMotion {
 final double[] pending=new double[5];long last,started;
 void reset(){java.util.Arrays.fill(pending,0);last=started=0;}
 boolean active(){for(double v:pending)if(Math.abs(v)>1e-8)return true;return false;}
 void enqueue(double[] values,long now){if(!active())last=started=now;for(int i=0;i<5;i++)if(Double.isFinite(values[i]))pending[i]+=values[i];}
 double[] step(long now,boolean smooth){return step(now,smooth,100);}
 double[] step(long now,boolean smooth,int milliseconds){double alpha=!smooth||now-started>=milliseconds*8?1:-Math.expm1(-Math.max(0,now-last)/(double)milliseconds);last=now;double[] out=new double[5];for(int i=0;i<5;i++){out[i]=pending[i]*alpha;pending[i]-=out[i];if(Math.abs(pending[i])<1e-8)pending[i]=0;}return out;}
}
