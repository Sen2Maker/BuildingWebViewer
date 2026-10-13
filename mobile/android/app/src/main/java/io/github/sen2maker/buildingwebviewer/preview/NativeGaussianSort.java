package io.github.sen2maker.buildingwebviewer.preview;
/** Three-pass stable float depth radix; workspace stays owned until GL consumes it. */
final class NativeGaussianSort {
 final int[] keys,src,dst,counts=new int[2048];
 NativeGaussianSort(int n){keys=new int[n];src=new int[n];dst=new int[n];}
 synchronized int[] sort(float[] centers,float[] forward){int n=keys.length;for(int i=0;i<n;i++){float depth=(float)((double)centers[i*3]*forward[0]+(double)centers[i*3+1]*forward[1]+(double)centers[i*3+2]*forward[2]);int bits=Float.floatToRawIntBits(depth);keys[i]=bits<0?~bits:bits|0x80000000;src[i]=i;}int[] a=src,b=dst;for(int shift=0;shift<32;shift+=11){int mask=shift==22?1023:2047;java.util.Arrays.fill(counts,0);for(int id:a)counts[(keys[id]>>>shift)&mask]++;int sum=0;for(int k=0;k<=mask;k++){int v=counts[k];counts[k]=sum;sum+=v;}for(int id:a)b[counts[(keys[id]>>>shift)&mask]++]=id;int[] t=a;a=b;b=t;}return a;}
}
