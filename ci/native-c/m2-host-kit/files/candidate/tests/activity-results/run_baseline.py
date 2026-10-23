#!/usr/bin/env python3
"""Reproduce both original M1.1 misrouting defects using unchanged frozen-source methods."""
from pathlib import Path
import argparse,hashlib,json,subprocess,tempfile,sys
sys.dont_write_bytecode=True
from source_extract import method
HERE=Path(__file__).resolve().parent

def run(baseline,output):
 paths={'guard':baseline/'project/mobile/native-patches/BwvBridgeCallGuard.java','app':baseline/'project/mobile/android/app/src/main/java/io/github/sen2maker/buildingwebviewer/BWVProjectsPlugin.java','upstream':baseline/'project/mobile/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Plugin.java'}
 sources={k:p.read_text() for k,p in paths.items()};template=(HERE/'baseline/reproduction.java.in').read_text();pins={}
 for key,name,signature in [('AUTHORIZED','app','private boolean authorized('),('RUN','app','private void run('),('PICK_FILES','app','public void pickFiles('),('PICKED','app','private void picked('),('RETURNED','app','private void nativeGaussianReturned('),('START','upstream','public void startActivityForResult(PluginCall call, Intent intent, String callbackName)'),('TRIGGER','upstream','private void triggerActivityCallback(')]:
  fragment=method(sources[name],signature);template=template.replace('@@'+key+'@@',fragment.text);pins[key]={'path':str(paths[name].relative_to(baseline)),'signature':signature,'sha256':hashlib.sha256(fragment.text.encode()).hexdigest(),'start':fragment.start,'end':fragment.end}
 output.mkdir(parents=True,exist_ok=True);source=output/'MainPickerOwnerRegression.java';source.write_text(template);pins={'methods':pins,'frozen_files':{str(path.relative_to(baseline)):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths.values()},'scaffold_sha256':hashlib.sha256((HERE/'baseline/reproduction.java.in').read_bytes()).hexdigest(),'claim':'Frozen M1.1 actual source slices reproduce two expected defects; not Android runtime acceptance.'};(output/'source-pins.json').write_text(json.dumps(pins,indent=2)+'\n');classes=output/'classes';classes.mkdir(exist_ok=True)
 guard=baseline/'project/mobile/native-patches/BwvBridgeCallGuard.java'
 subprocess.run(['java','-m','jdk.compiler/com.sun.tools.javac.Main','-source','21','-target','21','-Xlint:all','-Werror','-d',str(classes),str(source),str(guard)],check=True)
 result=subprocess.run(['java','-ea','-cp',str(classes),'com.getcapacitor.MainPickerOwnerRegression'],capture_output=True,text=True);(output/'result.txt').write_text(result.stdout+result.stderr);print(result.stdout+result.stderr,end='')
 if result.returncode:raise subprocess.CalledProcessError(result.returncode,result.args)
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--baseline',type=Path,required=True);parser.add_argument('--output',type=Path);args=parser.parse_args();run(args.baseline.resolve(),(args.output or Path(tempfile.mkdtemp(prefix='main-activity-baseline-'))).resolve())
