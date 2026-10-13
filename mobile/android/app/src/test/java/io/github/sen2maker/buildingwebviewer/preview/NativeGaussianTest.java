package io.github.sen2maker.buildingwebviewer.preview;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.*;
import java.util.*;
public class NativeGaussianTest {
 static final String[] BASE={"x","y","z","f_dc_0","f_dc_1","f_dc_2","opacity","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"};
 static File fixture(String format,int count,boolean bands)throws Exception {
  File f=File.createTempFile("native-gaussian-", ".ply");List<String> fields=new ArrayList<>(Arrays.asList(BASE));if(bands)for(int i=0;i<45;i++)fields.add("f_rest_"+i);
  String header="ply\nformat "+format+" 1.0\nelement vertex "+count+"\n";for(String p:fields)header+="property float "+p+"\n";header+="end_header\n";
  try(OutputStream out=new FileOutputStream(f)){out.write(header.getBytes("US-ASCII"));for(int i=0;i<count;i++){
   float[] v=new float[fields.size()];v[0]=i;v[1]=i%3;v[2]=i%7;v[3]=1;v[6]=2;v[7]=v[8]=v[9]=-2;v[10]=1;for(int j=14;j<v.length;j++)v[j]=(j-14)*.001f;
   if(format.equals("ascii")){StringBuilder row=new StringBuilder();for(float n:v)row.append(n).append(' ');row.append('\n');out.write(row.toString().getBytes("US-ASCII"));}
   else{ByteBuffer b=ByteBuffer.allocate(v.length*4).order(format.equals("binary_big_endian")?ByteOrder.BIG_ENDIAN:ByteOrder.LITTLE_ENDIAN);for(float n:v)b.putFloat(n);out.write(b.array());}
  }}return f;
 }
 @Test public void exactDepthSortPreservesAllAndStableTies(){float[] p={0,0,2,0,0,-5,0,0,2,0,0,0,0,0,-.1f};assertArrayEquals(new int[]{1,4,3,0,2},new NativeGaussianSort(5).sort(p,new float[]{0,0,1}));}
 @Test public void allFormatsPreserveFullCountAndSphericalHarmonics()throws Exception{for(String format:new String[]{"ascii","binary_little_endian","binary_big_endian"}){File f=fixture(format,100,true);try{NativeGaussianData d=NativeGaussianData.read(Arrays.asList(f),1000000,(a,b,c)->{});assertEquals(100,d.count);assertTrue(d.hasRest);assertEquals(99,d.positions[297]-d.positions[0],.0001);assertEquals(.0183156,d.covA.get(0),.00001);assertEquals(.044,d.rest.get(11*4+2),.000001);assertEquals(1/(1+Math.exp(-2)),d.centers.get(3),.00001);}finally{f.delete();}}}
 @Test public void mergesSourcesWithoutSampling()throws Exception{File a=fixture("ascii",20,false),b=fixture("binary_little_endian",40,true);try{NativeGaussianData d=NativeGaussianData.read(Arrays.asList(a,b),1000000,(x,y,z)->{});assertEquals(60,d.count);assertEquals(2,d.modelCount);assertEquals(0,d.rest.get(0),0);assertEquals(.001,d.rest.get(20*48+1),.00001);}finally{a.delete();b.delete();}}
 @Test public void fullPhoneSizedDatasetRemainsComplete()throws Exception{File f=fixture("binary_little_endian",594870,true);try{NativeGaussianData d=NativeGaussianData.read(Arrays.asList(f),768L*1024*1024,(a,b,c)->{});assertEquals(594870,d.count);assertEquals(594869,d.positions[(d.count-1)*3]-d.positions[0],.01);int[] order=new NativeGaussianSort(d.count).sort(d.positions,new float[]{1,0,0});assertEquals(594870,order.length);assertEquals(0,order[0]);assertEquals(594869,order[order.length-1]);}finally{f.delete();}}
 @Test public void rejectsTruncationAndCapacityInsteadOfSampling()throws Exception{File a=fixture("binary_little_endian",20,true);try{try{NativeGaussianData.read(Arrays.asList(a),1,(x,y,z)->{});fail();}catch(IOException expected){assertTrue(expected.getMessage().contains("no sampling"));}try(RandomAccessFile f=new RandomAccessFile(a,"rw")){f.setLength(a.length()-4);}try{new NativeGaussianData.Header(a);fail();}catch(IOException expected){assertTrue(expected.getMessage().contains("Truncated"));}}finally{a.delete();}}
}
