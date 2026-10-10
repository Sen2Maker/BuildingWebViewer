package io.github.sen2maker.buildingwebviewer.preview;
import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import me.zhanghai.android.libarchive.Archive;
import me.zhanghai.android.libarchive.ArchiveEntry;
/** Decode sequentially into private staging storage. No links or external commands. */
final class ArchiveImporter {
  static volatile boolean background=false;
  static void waitForeground()throws InterruptedException{while(background)Thread.sleep(250);}
  interface Sink { void accept(File file,String path) throws Exception; }
  static void extract(File source,File stage,Sink sink)throws Exception{
    if(ArchivePolicy.split(source.getName()))throw new IOException("Split archives are not supported / 不支持分卷压缩包");
    stage.mkdirs();long archive=Archive.readNew();int entries=0;Set<String> names=new HashSet<>();
    try{
      Archive.readSupportFilterAll(archive);Archive.readSupportFormatAll(archive);Archive.readSupportFormatRaw(archive);
      Archive.readOpenFileName(archive,source.getAbsolutePath().getBytes(StandardCharsets.UTF_8),65536);
      long entry;
      while((entry=Archive.readNextHeader(archive))!=0){
        waitForeground();
        if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Import interrupted");
        if(++entries>100000)throw new IOException("Archive has too many entries");
        if(ArchiveEntry.isEncrypted(entry))throw new IOException("Password archives are not supported / 不支持密码压缩包");
        String name=ArchiveEntry.pathnameUtf8(entry);
        if(name==null)name=new String(ArchiveEntry.pathname(entry),StandardCharsets.UTF_8);
        String format=new String(Archive.formatName(archive),StandardCharsets.UTF_8);
        if(format.toLowerCase(Locale.ROOT).contains("raw"))name=source.getName().replaceFirst("(?i)\\.(gz|gzip|bz2|xz|zst|zstd|lz4|lzma)$","");
        name=ArchivePolicy.path(name);
        if(ArchiveEntry.symlink(entry)!=null||ArchiveEntry.hardlink(entry)!=null)throw new IOException("Archive links are not supported");
        int type=ArchiveEntry.filetype(entry);if(type==0040000)continue;if(type!=0100000&&type!=0)throw new IOException("Unsupported archive entry type");
        if(!names.add(name))throw new IOException("Duplicate archive path: "+name);
        if(!ArchivePolicy.data(name)||name.startsWith("__MACOSX/")){Archive.readDataSkip(archive);continue;}
        File file=ArchivePolicy.within(stage,name);if(!file.getParentFile().isDirectory()&&!file.getParentFile().mkdirs())throw new IOException("Cannot create folder");
        long expected=ArchiveEntry.sizeIsSet(entry)?ArchiveEntry.size(entry):-1;
        if(expected>stage.getUsableSpace()-64L*1024*1024)throw new IOException("Not enough storage / 存储空间不足");
        ByteBuffer block=ByteBuffer.allocate(65536);long written=0;
        try(FileOutputStream out=new FileOutputStream(file)){
          while(true){waitForeground();block.clear();Archive.readData(archive,block);int count=block.position();if(count==0)break;
            if(stage.getUsableSpace()<64L*1024*1024)throw new IOException("Not enough storage / 存储空间不足");
            written+=count;if(expected>=0&&written>expected)throw new IOException("Archive size mismatch");out.write(block.array(),0,count);
          }out.getFD().sync();
        }
        if(expected>=0&&written!=expected)throw new IOException("Truncated archive entry");sink.accept(file,name);
      }
      if(Archive.readHasEncryptedEntries(archive)>0)throw new IOException("Encrypted archive unsupported");
    }finally{Archive.free(archive);}
  }
}
