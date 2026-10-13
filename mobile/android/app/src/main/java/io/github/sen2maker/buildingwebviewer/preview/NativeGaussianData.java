package io.github.sen2maker.buildingwebviewer.preview;
import java.io.*;
import java.nio.*;
import java.nio.channels.*;
import java.util.*;
/** Read-only packed GPU records, never a sampled subset or JavaScript payload. */
final class NativeGaussianData {
 interface Progress {void update(int done,int total,String stage);}
 static final int WIDTH=2048;
 final int count,height,restHeight,modelCount;
 final float[] positions,fitMin=new float[3],fitMax=new float[3];
 final double[] origin=new double[3];
 final FloatBuffer centers,covA,covB,dc,rest;
 final boolean hasRest;
 static FloatBuffer floats(long n)throws IOException {if(n>Integer.MAX_VALUE/4)throw new IOException("Buffer capacity exceeded");return ByteBuffer.allocateDirect((int)n*4).order(ByteOrder.nativeOrder()).asFloatBuffer();}
 NativeGaussianData(int n,int models,boolean bands)throws IOException{count=n;modelCount=models;hasRest=bands;height=Math.max(1,(n+WIDTH-1)/WIDTH);restHeight=bands?(int)(((long)n*12+WIDTH-1)/WIDTH):1;positions=new float[n*3];long pixels=(long)WIDTH*height*4;centers=floats(pixels);covA=floats(pixels);covB=floats(pixels);dc=floats(pixels);rest=bands?floats((long)WIDTH*restHeight*4):floats(4);}
 static final class Field {final String name,type;final int offset,index,size;Field(String n,String t,int o,int i)throws IOException{name=n;type=t;offset=o;index=i;switch(t){case "char":case "int8":case "uchar":case "uint8":size=1;break;case "short":case "int16":case "ushort":case "uint16":size=2;break;case "int":case "int32":case "uint":case "uint32":case "float":case "float32":size=4;break;case "double":case "float64":size=8;break;default:throw new IOException("Unsupported PLY property type: "+t);}}}
 static final class Header {
  final File file;int count,stride;long start;String format;Boolean cachedBands;final Map<String,Field> fields=new LinkedHashMap<>();
  Header(File f)throws IOException{file=f;try(InputStream in=new BufferedInputStream(new FileInputStream(f))){StringBuilder line=new StringBuilder();boolean vertex=false,seen=false,ended=false;int b;long bytes=0;
   while((b=in.read())!=-1){bytes++;if(bytes>65536)throw new IOException("PLY header too large");if(b!='\n'){if(b!='\r')line.append((char)b);continue;}String s=line.toString().trim();line.setLength(0);if(bytes==4&&!s.equals("ply"))throw new IOException("Not a PLY file");String[] a=s.split("\\s+");
    if(s.equals("ply")){seen=true;continue;}if(a[0].equals("format")){format=a[1];continue;}
    if(a[0].equals("element")){vertex=a[1].equals("vertex");if(vertex){if(count!=0)throw new IOException("Repeated vertex element");try{long n=Long.parseLong(a[2]);if(n<=0||n>2000000)throw new IOException("Full data exceeds native capacity; use compatibility viewer");count=(int)n;}catch(NumberFormatException e){throw new IOException("Invalid vertex count");}}else if(count==0&&!a[2].equals("0"))throw new IOException("Vertex element must precede other data");continue;}
    if(vertex&&a[0].equals("property")){if(a.length!=3||a[1].equals("list"))throw new IOException("List vertex properties are unsupported");if(fields.containsKey(a[2]))throw new IOException("Duplicate PLY field");Field field=new Field(a[2],a[1],stride,fields.size());fields.put(a[2],field);stride=Math.addExact(stride,field.size);continue;}
    if(s.equals("end_header")){start=bytes;ended=true;break;}
   }if(!seen||!ended||count<=0||stride<=0||!Arrays.asList("binary_little_endian","binary_big_endian","ascii").contains(format))throw new IOException("Incomplete or unsupported PLY header");
   for(String n:new String[]{"x","y","z","f_dc_0","f_dc_1","f_dc_2","opacity","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"})if(!fields.containsKey(n))throw new IOException("Not a Gaussian PLY: missing "+n);
   if(!format.equals("ascii")&&(long)count*stride>file.length()-start)throw new IOException("Truncated Gaussian PLY");
  }}
  boolean bands(){if(cachedBands!=null)return cachedBands;for(int i=0;i<45;i++)if(!fields.containsKey("f_rest_"+i))return cachedBands=false;return cachedBands=true;}
 }
 static final class Rows implements AutoCloseable {
  final Header h;FileChannel channel;BufferedReader text;MappedByteBuffer mapped;long mappedAt=-1;String[] tokens;
  Rows(Header header)throws IOException{h=header;if(h.format.equals("ascii")){InputStream in=new FileInputStream(h.file);long skip=h.start;while(skip>0){long n=in.skip(skip);if(n==0){if(in.read()<0)throw new EOFException();n=1;}skip-=n;}text=new BufferedReader(new InputStreamReader(in,java.nio.charset.StandardCharsets.US_ASCII));}else channel=new FileInputStream(h.file).getChannel();}
  void row(int index)throws IOException{if((index&4095)==0&&Thread.currentThread().isInterrupted())throw new IOException("Loading cancelled");if(text!=null){String line=text.readLine();if(line==null)throw new IOException("Truncated ASCII PLY");tokens=line.trim().split("\\s+");if(tokens.length!=h.fields.size())throw new IOException("Invalid ASCII PLY row");}}
  double get(int index,Field p)throws IOException{if(text!=null){try{return Double.parseDouble(tokens[p.index]);}catch(NumberFormatException e){throw new IOException("Invalid PLY number");}}
   long at=h.start+(long)index*h.stride+p.offset;if(mapped==null||at<mappedAt||at+p.size>mappedAt+mapped.capacity()){mappedAt=at;long size=Math.min(64L*1024*1024,channel.size()-at);if(size<p.size)throw new EOFException();mapped=channel.map(FileChannel.MapMode.READ_ONLY,at,size);mapped.order(h.format.equals("binary_big_endian")?ByteOrder.BIG_ENDIAN:ByteOrder.LITTLE_ENDIAN);}
   int o=(int)(at-mappedAt);switch(p.type){case "float":case "float32":return mapped.getFloat(o);case "double":case "float64":return mapped.getDouble(o);case "char":case "int8":return mapped.get(o);case "uchar":case "uint8":return mapped.get(o)&255;case "short":case "int16":return mapped.getShort(o);case "ushort":case "uint16":return mapped.getShort(o)&65535;case "uint":case "uint32":return Integer.toUnsignedLong(mapped.getInt(o));default:return mapped.getInt(o);}
  }
  double value(int i,String name)throws IOException{double v=get(i,h.fields.get(name));if(!Double.isFinite(v))throw new IOException("Non-finite Gaussian attribute");return v;}
  public void close()throws IOException{if(channel!=null)channel.close();if(text!=null)text.close();mapped=null;}
 }
 static NativeGaussianData read(List<File> files,long memoryBudget,Progress progress)throws IOException{
  List<Header> headers=new ArrayList<>();long total=0;boolean bands=false;for(File f:files){Header h=new Header(f);headers.add(h);total+=h.count;bands|=h.bands();}
  long estimate=total*(bands?600:190);if(total>2000000||estimate>memoryBudget)throw new IOException("Full dataset exceeds available memory; no sampling was applied");
  double[] min={Double.POSITIVE_INFINITY,Double.POSITIVE_INFINITY,Double.POSITIVE_INFINITY},max={Double.NEGATIVE_INFINITY,Double.NEGATIVE_INFINITY,Double.NEGATIVE_INFINITY};int n=(int)total,done=0;
  for(Header h:headers)try(Rows rows=new Rows(h)){for(int i=0;i<h.count;i++){rows.row(i);for(int a=0;a<3;a++){double v=rows.value(i,"xyz".substring(a,a+1));min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);}done++;if((done&8191)==0)progress.update(done,n*2,"bounds");}}
  NativeGaussianData d=new NativeGaussianData(n,files.size(),bands);for(int a=0;a<3;a++)d.origin[a]=(min[a]+max[a])*.5;int at=0;
  for(Header h:headers)try(Rows rows=new Rows(h)){for(int i=0;i<h.count;i++,at++){
   rows.row(i);int tex=at*4;for(int a=0;a<3;a++){float v=(float)(rows.value(i,"xyz".substring(a,a+1))-d.origin[a]);if(!Float.isFinite(v))throw new IOException("Coordinate range exceeded");d.positions[at*3+a]=v;d.centers.put(tex+a,v);d.dc.put(tex+a,finite(rows.value(i,"f_dc_"+a)));}
   double alpha=rows.value(i,"opacity"),op=alpha>=0?1/(1+Math.exp(-alpha)):Math.exp(alpha)/(1+Math.exp(alpha));d.centers.put(tex+3,(float)op);
   double[] scale=new double[3],q=new double[4];for(int a=0;a<3;a++)scale[a]=finite(Math.exp(rows.value(i,"scale_"+a)));double norm=0;for(int a=0;a<4;a++){q[a]=rows.value(i,"rot_"+a);norm+=q[a]*q[a];}norm=Math.sqrt(norm);if(norm==0){q[0]=1;norm=1;}for(int a=0;a<4;a++)q[a]=finite(q[a]/norm);
   double[] cov=covariance(scale,q);for(int a=0;a<4;a++)d.covA.put(tex+a,finite(cov[a]));d.covB.put(tex,finite(cov[4]));d.covB.put(tex+1,finite(cov[5]));d.covB.put(tex+2,(float)Math.min(3,Math.sqrt(Math.max(0,2*Math.log(Math.max(op*255,1))))+.02));
   if(h.bands())for(int c=0;c<3;c++)for(int b=0;b<15;b++){int t=at*12+c*4+(b>>2);d.rest.put(t*4+(b&3),finite(rows.value(i,"f_rest_"+(c*15+b))));}
   if((at&8191)==0)progress.update(n+at,n*2,"pack");
  }}
  float[] values=new float[n];for(int a=0;a<3;a++){for(int i=0;i<n;i++)values[i]=d.positions[i*3+a];Arrays.sort(values);int trim=n>=64?(int)(.05*(n-1)):0;d.fitMin[a]=values[trim];d.fitMax[a]=values[n-1-trim];if(d.fitMax[a]<=d.fitMin[a]){d.fitMin[a]=(float)(min[a]-d.origin[a]);d.fitMax[a]=(float)(max[a]-d.origin[a]);}}
  progress.update(n*2,n*2,"gpu");return d;
 }
 static float finite(double n)throws IOException{float f=(float)n;if(!Float.isFinite(f))throw new IOException("Gaussian attribute exceeds float32 range");return f;}
 static double[] covariance(double[] s,double[] q){double w=q[0],x=q[1],y=q[2],z=q[3];double[][] r={{1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)},{2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)},{2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)}};double[] c=new double[6];int k=0;for(int[] ab:new int[][]{{0,0},{0,1},{0,2},{1,1},{1,2},{2,2}}){double v=0;for(int a=0;a<3;a++)v+=r[ab[0]][a]*r[ab[1]][a]*s[a]*s[a];c[k++]=v;}return c;}
}
