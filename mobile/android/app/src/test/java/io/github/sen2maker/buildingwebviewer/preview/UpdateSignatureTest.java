package io.github.sen2maker.buildingwebviewer.preview;
import org.junit.Test;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;
public class UpdateSignatureTest {
  @Test public void signatureAuthenticatesExactPayloadAndKey()throws Exception{
    KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));
    KeyPair key=generator.generateKeyPair();String payload="{\"version\":\"1.3.0\",\"notes\":\"中文\"}";
    Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(key.getPrivate());signer.update((UpdateSignature.DOMAIN+payload).getBytes(StandardCharsets.UTF_8));String signature=UpdateSignature.hex(signer.sign());
    UpdateSignature.verify(UpdateSignature.hex(key.getPublic().getEncoded()),payload,signature);
    try{UpdateSignature.verify(UpdateSignature.hex(key.getPublic().getEncoded()),payload+" ",signature);fail();}catch(GeneralSecurityException expected){}
    try{UpdateSignature.verify(UpdateSignature.hex(generator.generateKeyPair().getPublic().getEncoded()),payload,signature);fail();}catch(GeneralSecurityException expected){}
  }
  @Test public void malformedSignaturesAreRejected()throws Exception{
    for(String bad:new String[]{"", "zz", "a", "AB"})try{UpdateSignature.unhex(bad);fail();}catch(IllegalArgumentException expected){}
  }
}
