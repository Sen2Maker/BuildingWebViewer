#!/usr/bin/env python3
"""Compile actual source method bodies against deterministic UI/IO contract doubles.

No Android SDK/provider is simulated or certified. The baseline demonstrates the
original bugs; corrected source must pass delayed delivery and lifecycle races.
Generated Java and class files stay under a caller-owned /tmp output directory.
"""
from pathlib import Path
import argparse, re, subprocess, tempfile, hashlib, json

def method(text, signature):
    start=text.index(signature); opening=text.index('{',start); depth=0
    # Lexically ignore strings and comments when locating the matching brace.
    tokens=re.finditer(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[{}]',text[opening:])
    for match in tokens:
        token=match.group()
        if token=='{':depth+=1
        elif token=='}':
            depth-=1
            if depth==0:return text[start:opening+match.end()]
    raise ValueError('Unterminated '+signature)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--candidate',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--baseline',type=Path);parser.add_argument('--output',type=Path)
    args=parser.parse_args();root=args.candidate.resolve();out=args.output or Path(tempfile.mkdtemp(prefix='bwv-transport-regression-'));out.mkdir(parents=True,exist_ok=True)
    runs=[]
    if args.baseline:runs.append(('baseline',args.baseline.resolve(),False))
    runs.append(('candidate',root,True))
    template=(Path(__file__).parent/'transport_harness.java.in').read_text()
    for name,source,fixed in runs:
        mobile=source/'project/mobile';patch=mobile/'native-patches';bridge=(patch/'patched/Bridge.java').read_text();message=(patch/'patched/MessageHandler.java').read_text();candidate=(mobile/'android/app/src/main/java/io/github/sen2maker/buildingwebviewer/BWVProjectsPlugin.java').read_text();base=(mobile/'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Plugin.java').read_text()
        values={
          'BRIDGE_NOTIFY':method(bridge,'void notifyTransportFailure(') if 'void notifyTransportFailure(' in bridge else 'void notifyTransportFailure(PluginCall call) {}',
          'HAS_FAILURE':str('void notifyTransportFailure(' in bridge).lower(),
          'BRIDGE_CALL':method(bridge,'public void callPluginMethod('),'BRIDGE_SAVE':method(bridge,'public void saveCall('),'BRIDGE_GET':method(bridge,'public PluginCall getSavedCall('),
          'BRIDGE_RELEASE':method(bridge,'public void releaseCall(PluginCall call)'),'BRIDGE_RELEASE_ID':method(bridge,'public void releaseCall(String callbackId)'),
          'MESSAGE_SEND':method(message,'public void sendResponseMessage('),'MESSAGE_RELEASE':method(message,'void releaseCall(PluginCall call)') if fixed else 'void releaseCall(PluginCall call) { replies.remove(call); }',
          'BASE_ADD':method(base,'public void addListener('),'BASE_REMOVE':method(base,'public void removeListener('),'BASE_REMOVE_ALL_CALL':method(base,'public void removeAllListeners(PluginCall call)'), 'BASE_REMOVE_ALL':method(base,'public void removeAllListeners()'),
          'CANDIDATE_ADD':method(candidate,'public void addListener('),'CANDIDATE_REMOVE':method(candidate,'public void removeListener('),'CANDIDATE_REMOVE_ALL_CALL':method(candidate,'public void removeAllListeners(PluginCall call)'),
          'CANDIDATE_REMOVE_ALL':method(candidate,'public void removeAllListeners()') if fixed else '', 'CANDIDATE_START':method(candidate,'void documentStarted()'),'CANDIDATE_DESTROY':method(candidate,'protected void handleOnDestroy()'),
          'LISTENER_FIELD':re.search(r'private final Set<PluginCall> listenerCalls=[^;]+;',candidate).group() if fixed else '', 'FIXED':str(fixed).lower()}
        java=template
        for key,value in values.items():java=java.replace('@@'+key+'@@',value)
        if '@@' in java:raise AssertionError('Unfilled source fragment')
        dest=out/name;dest.mkdir(exist_ok=True);generated=dest/'TransportMethodRegression.java';generated.write_text(java)
        subprocess.run(['java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','21','-target','21','-Xlint:all','-Werror','-d',str(dest),str(generated),str(patch/'BwvBridgeCallGuard.java')],check=True)
        result=subprocess.run(['java','-ea','-cp',str(dest),'com.getcapacitor.TransportMethodRegression'],check=True,text=True,capture_output=True)
        (dest/'result.txt').write_text(result.stdout);print(result.stdout,end='')
        (dest/'actual-source-methods.json').write_text(json.dumps({key:hashlib.sha256(value.encode()).hexdigest() for key,value in values.items()},indent=2)+'\n')
    print('Read-only source extraction, generated tests: '+str(out))
if __name__=='__main__':main()
