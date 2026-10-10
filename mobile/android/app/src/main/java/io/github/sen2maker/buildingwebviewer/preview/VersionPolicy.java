package io.github.sen2maker.buildingwebviewer.preview;
public final class VersionPolicy {
  public static int[] parse(String value){if(value==null||!value.matches("[0-9]+\\.[0-9]+\\.[0-9]+"))throw new IllegalArgumentException("Invalid version");String[] p=value.split("\\.");return new int[]{Integer.parseInt(p[0]),Integer.parseInt(p[1]),Integer.parseInt(p[2])};}
  public static int compare(String a,String b){int[] x=parse(a),y=parse(b);for(int i=0;i<3;i++){int c=Integer.compare(x[i],y[i]);if(c!=0)return c;}return 0;}
  public static boolean patch(String current,String next){int[] a=parse(current),b=parse(next);return a[0]==b[0]&&a[1]==b[1]&&b[2]>a[2];}
}
