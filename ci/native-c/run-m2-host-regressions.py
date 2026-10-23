#!/usr/bin/env python3
"""Fail-closed, no-install host runner for exact Main M2 frozen test bytes.

Read input trees; copy verified inputs to a fresh output tree; execute there only.
The manifest is part of the reviewed CI helper, not a caller-supplied allowlist.
No Gradle, npm, SDK download, APK, network mutation, signing, or device action.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, json, os, shutil, stat, subprocess, sys

HERE = Path(os.path.abspath(__file__)).parent
KIT = HERE / 'm2-host-kit'
MANIFEST_SHA256 = 'e292603c36aa927436c56d490853c50ea160083c70a9e23eea6fcfd9909b6aad'
LOCAL_API_SHA256 = '1f84aa28d5e59cd4b24087032bdd6880d87570dda64a8a6474817fb043b39b16'

def fail(message):
    raise ValueError(message)

def no_links(path):
    path = Path(os.path.abspath(path))
    for part in [path, *path.parents]:
        if part.is_symlink(): fail('Symlink rejected: ' + str(part))
    return path

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def relative(value):
    p = PurePosixPath(value)
    if not value or p.is_absolute() or '..' in p.parts or str(p) != value or '\\' in value:
        fail('Unsafe relative path: ' + repr(value))
    return p

def verify_rows(root, rows):
    root = no_links(root)
    seen = set()
    for row in rows:
        name = str(relative(row['path']))
        if name in seen: fail('Duplicate manifest entry: ' + name)
        seen.add(name)
        p = no_links(root / name)
        if not p.is_file() or not stat.S_ISREG(p.stat().st_mode): fail('Missing regular file: ' + str(p))
        if p.stat().st_size != row['bytes'] or digest(p) != row['sha256']:
            fail('Hash/size mismatch: ' + str(p))
    return seen

def exact_tree(root, expected, excluded=()):
    root = no_links(root)
    expected = set(expected)
    allowed_dirs = {''}
    for name in expected | set(excluded):
        allowed_dirs.update(str(p) if str(p) != '.' else '' for p in PurePosixPath(name).parents)
    found = set()
    for current, dirs, files in os.walk(root, followlinks=False):
        base = Path(current)
        for name in list(dirs):
            p = base / name; rel = p.relative_to(root).as_posix()
            no_links(p)
            if rel in excluded:
                dirs.remove(name)
            elif rel not in allowed_dirs:
                fail('Unlisted directory: ' + str(p))
        for name in files:
            p = base / name; rel = p.relative_to(root).as_posix()
            no_links(p)
            if not stat.S_ISREG(p.stat().st_mode): fail('Non-regular entry: ' + str(p))
            if rel not in expected: fail('Unlisted file: ' + str(p))
            found.add(rel)
    if found != expected: fail('Missing files: ' + repr(sorted(expected - found)))

def copy_rows(source, dest, rows):
    for row in rows:
        target = dest / row['path']; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / row['path'], target)
    verify_rows(dest, rows)

def materialize_kit(source, dest, rows):
    destinations = set()
    for row in rows:
        destination = str(relative(row.get('scratchPath', row['path'])))
        if destination in destinations: fail('Duplicate scratch destination: ' + destination)
        destinations.add(destination)
        target = dest / destination; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / row['path'], target)
        verify_rows(dest, [{**row, 'path':destination}])

def validate(project, deps, local_api=None):
    no_links(KIT)
    manifest_path = no_links(KIT / 'manifest.json')
    if digest(manifest_path) != MANIFEST_SHA256: fail('Reviewed host-kit manifest drift')
    m = json.loads(manifest_path.read_text())
    kit_expected = verify_rows(KIT / 'files', m['kitFiles'])
    exact_tree(KIT, {'manifest.json', *('files/' + p for p in kit_expected)})
    native_expected = verify_rows(project, m['sourceNativeFiles'])
    exact_tree(project, native_expected, excluded=('mobile/node_modules',))
    # Only explicitly pinned files are copied from npm. Unrelated installed packages
    # cannot enter module resolution in the disposable candidate.
    verify_rows(deps, m['dependencyFiles'])
    for package in m['dependencyPackages']:
        prefix = package + '/'
        expected = {r['path'][len(prefix):] for r in m['dependencyFiles']
                    if r['path'].startswith(prefix) and 'node_modules' not in PurePosixPath(r['path'][len(prefix):]).parts}
        exact_tree(deps / package, expected, excluded=('node_modules',))
    if local_api:
        local_api = no_links(local_api)
        if not local_api.is_file() or digest(local_api) != LOCAL_API_SHA256:
            fail('Pinned local Android API text drift')
    return m

def run_suite(command, name, expected, evidence, env):
    result = subprocess.run([str(s) for s in command], cwd=evidence.parent,
                            env=env, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=240)
    (evidence / (name + '.txt')).write_text(result.stdout)
    print(result.stdout, end='', flush=True)
    if result.returncode: fail(name + ' failed: exit ' + str(result.returncode))
    for text in expected:
        if text not in result.stdout: fail(name + ' missing expected result: ' + text)
    return {'suite': name, 'status': 'passed', 'expectedResults': expected}

def main(argv=None):
    if sys.flags.optimize: fail('Python optimization would disable frozen test assertions')
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project', type=Path, required=True, help='Exact native-only source project, before Gradle outputs')
    p.add_argument('--dependencies', type=Path, help='Already-installed, already L1.R1-patched mobile node_modules')
    p.add_argument('--output', type=Path, required=True, help='Fresh nonexistent disposable output path')
    p.add_argument('--local-api-signatures', type=Path, help='Local-only pinned API text; never Android SDK proof')
    p.add_argument('--verify-only', action='store_true')
    a = p.parse_args(argv)
    project = no_links(a.project); deps = no_links(a.dependencies or project / 'mobile/node_modules')
    output = no_links(a.output)
    if output.exists(): fail('Output must not already exist: ' + str(output))
    for source in [project, deps, KIT]:
        if output.is_relative_to(source) or source.is_relative_to(output): fail('Output overlaps input tree')
    m = validate(project, deps, a.local_api_signatures)
    if a.verify_only:
        print('M2_HOST_INPUTS_VERIFIED=' + json.dumps({'kitFiles':len(m['kitFiles']), 'nativeFiles':len(m['sourceNativeFiles']), 'dependencies':len(m['dependencyFiles'])},sort_keys=True))
        return
    output.mkdir(parents=True, exist_ok=False)
    scratch = output / 'scratch'; scratch.mkdir()
    materialize_kit(KIT / 'files', scratch, m['kitFiles'])
    candidate = scratch / 'candidate'
    copy_rows(project, candidate / 'project', m['selectedNativeFiles'])
    copy_rows(deps, candidate / 'project/mobile/node_modules', m['dependencyFiles'])
    for item in m['sourceRemaps']:
        origin = no_links(project / item['from'])
        if digest(origin) != item['sha256']: fail('Remap source mismatch')
        target = candidate / item['to']; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origin, target)
        if digest(target) != item['sha256']: fail('Remap output mismatch')
    evidence = output / 'evidence'; evidence.mkdir()
    temp = output / 'tmp'; temp.mkdir()
    env = {k:v for k,v in os.environ.items() if k not in
           {'NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME','PYTHONOPTIMIZE','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','BWV_TEST_NATIVE','BWV_TEST_CORE'}}
    env.update({'PYTHONDONTWRITEBYTECODE':'1','PYTHONNOUSERSITE':'1','TMPDIR':str(temp)})
    py = [sys.executable,'-B']; tests = candidate / 'tests'; results=[]
    suites = [
      (['node','--test','--test-reporter=tap',tests/'liveness/runtime.test.mjs'], 'l1-r1-runtime', ['# tests 21', '# pass 21', '# fail 0', '# skipped 0']),
      (py+[tests/'regression/run_transport_regression.py','--candidate',candidate,'--baseline',scratch/'main_app_integration_staging','--output',output/'transport'], 'native-transport', ['7 original M1 assertions PASS','5107 M1.1 actual-method threading/ownership assertions PASS']),
      (py+[tests/'activity-results/run_baseline.py','--baseline',scratch/'main_app_integration_m1_1_staging','--output',output/'activity-baseline'], 'activity-baseline', ['REPRODUCED main M1.1: stale picker A selection','REPRODUCED main M1.1: native Gaussian return']),
      (py+[tests/'activity-results/run_regression.py','--candidate',candidate,'--output',output/'activity'], 'activity-ownership', ['TOTAL: 47 scenarios / 890 assertions passed.']),
      (py+[tests/'activity-results/run_mutations.py','--candidate',candidate,'--output',output/'activity-mutations'], 'activity-mutations', ['13 mutation controls killed by runtime assertions.']),
      (py+[tests/'liveness/test_installer.py'], 'runtime-installer', ['Ran 7 tests','\nOK\n']),
      (py+[tests/'liveness/run_mutations.py','--output',output/'liveness-mutations'], 'runtime-mutations', ['7 liveness runtime mutations killed by intended assertions']),
      (py+[tests/'liveness/test_save_override.py','--output',output/'save-override'], 'save-override', ['7 actual parent-signature/override checks PASS']),
      (py+[tests/'liveness/test_recovery_notice.py','--output',output/'recovery-view'], 'recovery-view', ['42 actual RecoveryActivity UI-construction checks PASS']),
      (py+[tests/'recovery-ownership/run_merged.py','--output',output/'recovery-ownership'], 'recovery-ownership', ['21 scenarios / 59 assertions','PASS stale-route','PASS duplicate-result','PASS orphan-block','PASS settlement-owner']),
    ]
    for command,name,expected in suites:
        results.append(run_suite(command,name,expected,evidence,env))
    lifecycle = py+[candidate/'check-lifecycle-visibility.py',candidate/'project',output/'lifecycle']
    if a.local_api_signatures: lifecycle += ['--api-signatures', no_links(a.local_api_signatures)]
    results.append(run_suite(lifecycle,'lifecycle-visibility',['NATIVE_LIFECYCLE_VISIBILITY_RESULT='],evidence,env))
    audit=json.loads((output/'lifecycle/results.json').read_text())
    if audit['audit_count']!=16 or audit['activity_api']['android_sdk_checked'] != (a.local_api_signatures is None):
        fail('Exact 16-declaration lifecycle audit/provenance mismatch')
    # Input trees remain byte-exact after all executions. No tests run in them.
    validate(project,deps,a.local_api_signatures)
    report={'status':'passed','checkpoint':'M2','kitManifestSha256':MANIFEST_SHA256,
            'suites':results,'lifecycleAuditCount':16,'androidSdkAudited':audit['activity_api']['android_sdk_checked'],
            'exact32JUnitGate':'REQUIRED SEPARATELY; NOT RUN OR REPLACED',
            'scope':'Host doubles and source/runtime regressions only; no Android build, device, package, install or release evidence'}
    (output/'results.json').write_text(json.dumps(report,indent=2)+'\n')
    print('M2_HOST_REGRESSIONS_RESULT='+json.dumps(report,sort_keys=True))

if __name__=='__main__':
    try: main()
    except (ValueError, OSError, subprocess.SubprocessError) as e:
        print('M2 HOST REGRESSIONS BLOCKED: '+str(e),file=sys.stderr);sys.exit(3)
