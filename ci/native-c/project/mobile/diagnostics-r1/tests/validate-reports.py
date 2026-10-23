import json
from pathlib import Path
import jsonschema
root = Path(__file__).resolve().parent.parent
schema = json.loads((root / 'report.schema.json').read_text())
jsonschema.Draft202012Validator.check_schema(schema)
validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
count = 0
for path in sorted((root / 'evidence').glob('example-*-report.json')):
    validator.validate(json.loads(path.read_text()))
    count += 1
message = f'PASS: Draft 2020-12 schema valid; {count} actual report(s) validate. No Android report is present.\n'
(root / 'evidence' / 'schema-validation.txt').write_text(message)
print(message, end='')
