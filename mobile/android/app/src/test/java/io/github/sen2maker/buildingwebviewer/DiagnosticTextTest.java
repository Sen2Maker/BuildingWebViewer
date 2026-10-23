package io.github.sen2maker.buildingwebviewer;
import org.junit.Test;import static org.junit.Assert.*;
public class DiagnosticTextTest{
 @Test public void redactsQueriesAndLocalFilePaths(){assertEquals("https://localhost/pointcloud.html",DiagnosticText.url("https://localhost/pointcloud.html?project=secret#camera"));assertEquals("content:[redacted]",DiagnosticText.url("content://private/user.txt"));assertEquals("https://localhost/[path redacted]",DiagnosticText.url("https://localhost/private/user.txt"));assertFalse(DiagnosticText.message("failed https://localhost/x?token=secret").contains("secret"));}
 @Test public void exposesToolRoutesWithoutProjectData(){assertEquals("https://localhost/gaussian.html",DiagnosticText.url("https://localhost/gaussian.html?project=secret"));assertEquals("https://localhost/generate.html",DiagnosticText.url("https://localhost/generate.html?project=secret"));assertEquals("https://localhost/favicon.svg",DiagnosticText.url("https://localhost/favicon.svg?v=secret"));}
 @Test public void preservesWrongAuthorityForDiagnosis(){assertEquals("https://localhostassets/mobile/index.html",DiagnosticText.url("https://localhostassets/mobile/index.html"));assertTrue(DiagnosticText.message(new String(new char[2000]).replace('\0','x')).length()<610);}
}
