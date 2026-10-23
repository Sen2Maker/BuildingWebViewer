package io.github.sen2maker.buildingwebviewer;
import org.junit.Test;
import static org.junit.Assert.*;
public class PoliciesTest {
 @Test public void rejectsPathEscapes()throws Exception{for(String s:new String[]{"../evil","/tmp/evil","C:\\evil","a/../../b","a\u0000b"}){try{ArchivePolicy.path(s);fail(s);}catch(java.io.IOException expected){}}assertEquals("a/b.xyz",ArchivePolicy.path("./a\\b.xyz"));}
 @Test public void archiveNames(){for(String s:new String[]{"a.zip","a.7z","a.rar","a.tar.gz","a.tbz2","a.tar.zst","a.txt.xz"})assertTrue(s,ArchivePolicy.archive(s));assertTrue(ArchivePolicy.split("a.part01.rar"));assertTrue(ArchivePolicy.split("a.7z.001"));assertFalse(ArchivePolicy.split("a.rar"));}
 @Test public void cadProjectFiles(){for(String extension:new String[]{"dxf","dwg","step","stp","iges","igs","brep","brp","ttf","otf"}){assertTrue(extension,ArchivePolicy.data("part."+extension));assertTrue(extension,ArchivePolicy.data("assembly/sub/PART."+extension.toUpperCase(java.util.Locale.ROOT)));}for(String name:new String[]{"part.exe","part.dxf.exe","lib.so","secret.pem"})assertFalse(name,ArchivePolicy.data(name));}
 @Test public void cadWebAssets(){for(String name:new String[]{"assets/vendor/cad/libredwg-web.wasm","assets/vendor/cad/occt-import-js.wasm","assets/vendor/cad/NotoSansSC.ttf","assets/js/cad.bundle.js",".nojekyll"})assertTrue(name,ArchivePolicy.webAsset(name));for(String name:new String[]{"random.wasm","assets/vendor/cad/unknown.wasm","assets/vendor/cad/other.ttf","evil.dex","lib.so"})assertFalse(name,ArchivePolicy.webAsset(name));}
 @Test public void updates(){assertTrue(VersionPolicy.patch("1.2.0","1.2.1"));assertFalse(VersionPolicy.patch("1.2.0","1.3.0"));assertFalse(VersionPolicy.patch("1.2.0","2.0.0"));assertFalse(VersionPolicy.patch("1.2.1","1.2.0"));assertTrue(VersionPolicy.compare("1.10.0","1.9.9")>0);}
}
