package io.github.sen2maker.buildingwebviewer.preview;
import java.io.*;
import java.util.Locale;
public final class ArchivePolicy {
  public static String path(String input) throws IOException {
    if(input==null)throw new IOException("Archive path is missing");
    String path=input.replace('\\','/');while(path.startsWith("./"))path=path.substring(2);
    if(path.isEmpty()||path.startsWith("/")||path.matches("^[A-Za-z]:.*")||path.length()>2048)throw new IOException("Unsafe archive path");
    for(String part:path.split("/"))if(part.equals("..")||part.equals(".")||part.matches(".*[\\x00-\\x1f].*"))throw new IOException("Unsafe archive path");
    return path;
  }
  public static boolean data(String name){return name.toLowerCase(Locale.ROOT).matches(".*\\.(obj|xyz|txt|csv|pts|ply|pcd)$");}
  public static boolean archive(String name){return name.toLowerCase(Locale.ROOT).matches(".*\\.(zip|7z|rar|tar|gz|gzip|tgz|bz2|tbz|tbz2|xz|txz|zst|zstd|tzst|lz4|lzma)$");}
  public static boolean split(String name){return name.toLowerCase(Locale.ROOT).matches(".*(\\.part[0-9]+\\.rar|\\.r[0-9]{2}|\\.z[0-9]{2}|\\.[0-9]{3})$");}
  public static File within(File root,String name)throws IOException{
    File result=new File(root,path(name));String base=root.getCanonicalPath()+File.separator;
    if(!result.getCanonicalPath().startsWith(base))throw new IOException("Archive path escapes project");return result;
  }
}
