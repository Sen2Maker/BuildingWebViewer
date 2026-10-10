package io.github.sen2maker.buildingwebviewer.preview;
import org.junit.Test;
import static org.junit.Assert.*;
public class PoliciesTest {
 @Test public void rejectsPathEscapes()throws Exception{for(String s:new String[]{"../evil","/tmp/evil","C:\\evil","a/../../b","a\u0000b"}){try{ArchivePolicy.path(s);fail(s);}catch(java.io.IOException expected){}}assertEquals("a/b.xyz",ArchivePolicy.path("./a\\b.xyz"));}
 @Test public void archiveNames(){for(String s:new String[]{"a.zip","a.7z","a.rar","a.tar.gz","a.tbz2","a.tar.zst","a.txt.xz"})assertTrue(s,ArchivePolicy.archive(s));assertTrue(ArchivePolicy.split("a.part01.rar"));assertTrue(ArchivePolicy.split("a.7z.001"));assertFalse(ArchivePolicy.split("a.rar"));}
 @Test public void updates(){assertTrue(VersionPolicy.patch("1.2.0","1.2.1"));assertFalse(VersionPolicy.patch("1.2.0","1.3.0"));assertFalse(VersionPolicy.patch("1.2.0","2.0.0"));assertFalse(VersionPolicy.patch("1.2.1","1.2.0"));assertTrue(VersionPolicy.compare("1.10.0","1.9.9")>0);}
}
