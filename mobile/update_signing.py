"""Exact-byte ECDSA signatures through OpenSSL; private keys never enter build output."""
import hashlib,json,re,subprocess,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DOMAIN=b'BuildingWebViewer update v1\n'
TRUST=ROOT/'mobile/android/app/src/main/res/raw/update_trust.json'

def canonical(data):
    return json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False)

def openssl(*args,input=None):
    return subprocess.run(['openssl',*map(str,args)],input=input,check=True,capture_output=True).stdout

def verify(envelope, trust=None, now=None, fresh=True):
    trust=trust or json.loads(TRUST.read_text())
    payload=envelope['payload'];key=bytes.fromhex(trust['keys'][envelope['keyId']])
    with tempfile.TemporaryDirectory() as directory:
        p=Path(directory);(p/'key.der').write_bytes(key);(p/'signature').write_bytes(bytes.fromhex(envelope['signature']))
        openssl('pkey','-pubin','-inform','DER','-in',p/'key.der','-pubout','-out',p/'key.pem')
        openssl('dgst','-sha256','-verify',p/'key.pem','-signature',p/'signature',input=DOMAIN+payload.encode())
    data=json.loads(payload);now=int(time.time()) if now is None else now
    assert data['schema']==1 and data['channel']=='preview'
    assert data['packageName']=='io.github.sen2maker.buildingwebviewer.preview'
    assert data['sequence']>=trust['minimumSequence']
    assert 0<data['expiresAt']-data['issuedAt']<=366*86400
    if fresh: assert data['issuedAt']-86400<=now<data['expiresAt']
    assert re.fullmatch(r'\d+\.\d+\.\d+',data['version'])
    apk_version=data['apk']['version']
    assert data['apk']['nativeApi']==data['nativeApi']
    assert tuple(map(int,apk_version.split('.')))<=tuple(map(int,data['version'].split('.')))
    for kind,name,limit in [('web',f"BuildingWebViewer-Update-v{data['version']}.bwvupdate",32*1024*1024),('apk',f"BuildingWebViewer-Android-v{apk_version}-preview.1.apk",128*1024*1024)]:
        item=data[kind]
        artifact_version=apk_version if kind=='apk' else data['version']
        assert item['url']==f"https://github.com/Sen2Maker/BuildingWebViewer/releases/download/v{artifact_version}/{name}"
        assert re.fullmatch('[0-9a-f]{64}',item['sha256']) and 0<item['size']<=limit
    return data

def sign(data,key_path,key_id,trust=None):
    payload=canonical(data)
    sig=openssl('dgst','-sha256','-sign',key_path,input=DOMAIN+payload.encode())
    envelope={'keyId':key_id,'payload':payload,'signature':sig.hex()}
    verify(envelope,trust=trust)
    # Compatibility hint for legacy clients; new clients only trust signed payload.
    envelope.update(version=data['version'],nativeApi=data['nativeApi'],url=data['web']['url'],sha256=data['web']['sha256'])
    return envelope
