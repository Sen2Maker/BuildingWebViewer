#!/usr/bin/env python3
"""Finalize exact post-sync bytes; only pinned empty Cordova stubs may be added."""
from pathlib import Path
import argparse
import importlib.util
import json

SPEC = importlib.util.spec_from_file_location('main_web_assembler', Path(__file__).with_name('assemble-main-web.py'))
assembler = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(assembler)


def finalize(project=assembler.PROJECT, mobile=assembler.MOBILE, dist=None):
    mobile = Path(mobile)
    public = mobile / 'android/app/src/main/assets/public'
    # Re-derive every source byte. A modified web/ plus a rehashed inventory
    # cannot authorize itself; any source change requires assembly and sync.
    expected, build = assembler.build_payload(project, mobile, dist)
    web = assembler.tree_bytes(mobile / 'web')
    verified = assembler.verified_inventory(web)
    assembler.require(verified == expected, 'Assembled source differs from reviewed inputs; reassemble and sync')
    current_pins = json.loads((mobile / 'bundled-pins.json').read_bytes())
    assembler.require(current_pins.get('fixtureOnly') is False and current_pins.get('build') == build,
                      'Pins do not describe the current full main payload')
    actual = assembler.tree_bytes(public)
    expected_names = set(web) | set(assembler.STUBS)
    assembler.require(set(actual) == expected_names,
                      'Unexpected post-sync assets: missing=' + repr(sorted(expected_names - set(actual))) +
                      ', extra=' + repr(sorted(set(actual) - expected_names)))
    final_payload = {**expected, **assembler.STUBS}
    encoded = assembler.canonical_inventory(final_payload)
    # An exact previous final inventory is allowed for idempotence, not arbitrary bytes.
    assembler.require(actual[assembler.INVENTORY] in (web[assembler.INVENTORY], encoded),
                      'Post-sync inventory changed or comes from a different source')
    for name, data in final_payload.items():
        assembler.require(actual[name] == data, 'Changed post-sync asset: ' + name)
    allowed_pins = (assembler.pins_for(expected, build, finalized=False),
                    assembler.pins_for(final_payload, build, finalized=True))
    assembler.require(current_pins in allowed_pins, 'Stale or modified bundle pins')
    # No writes until complete source, copy, stubs and pins pass.
    (public / assembler.INVENTORY).write_bytes(encoded)
    pins = assembler.pins_for(final_payload, build, finalized=True)
    (mobile / 'bundled-pins.json').write_text(json.dumps(pins, indent=2) + '\n')
    assembler.verified_inventory(assembler.tree_bytes(public))
    return pins, len(final_payload)


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    pins, count = finalize()
    print(f"Finalized full main public payload: {count} files + canonical inventory; SHA256 {pins['inventorySha256']}; fixtureOnly=false. No APK built or signed.")


if __name__ == '__main__':
    main()
