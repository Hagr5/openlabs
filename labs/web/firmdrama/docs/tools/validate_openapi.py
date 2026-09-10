"""Check the maintainer OpenAPI reference without importing or running the application."""

from __future__ import annotations

import ast
from copy import deepcopy
from pathlib import Path
import re
import sys

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import OpenAPIV31SpecValidator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "docs/openapi.yaml"
METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
READ_SECURITY = [{"BearerAuth": []}, {"BrowserSession": []}]
WRITE_SECURITY = [{"BearerAuth": []}, {"BrowserSession": [], "BrowserRequestHeader": []}]
BASE_URI = "urn:firmdrama:openapi"


class UniqueKeyLoader(yaml.SafeLoader):
    """Reject duplicate YAML keys instead of silently discarding an earlier value."""


def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f"Duplicate YAML key {key!r}, line {key_node.start_mark.line + 1}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def walk(value, path="$", ancestors=frozenset()):
    if isinstance(value, (dict, list)):
        if id(value) in ancestors:
            raise ValueError(f"Recursive YAML alias at {path}")
        ancestors = ancestors | {id(value)}
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, f"{path}/{key}", ancestors)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{path}/{index}", ancestors)


def resolve(document, reference):
    if not reference.startswith("#/"):
        raise ValueError(f"Only local references are supported: {reference}")
    value = document
    for key in reference[2:].split("/"):
        key = key.replace("~1", "/").replace("~0", "~")
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def dereference(document, value):
    seen = set()
    while isinstance(value, dict) and "$ref" in value:
        reference = value["$ref"]
        if reference in seen:
            raise ValueError(f"Circular reference chain: {reference}")
        seen.add(reference)
        value = resolve(document, reference)
    return value


def load_tree(path):
    return ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))


def source_operations():
    """Read explicit Flask route decorators and registered blueprint prefixes."""
    app_path = ROOT / "src/app.py"
    app_tree = load_tree(app_path)
    imports = {}
    for node in ast.walk(app_tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("src.api."):
            for alias in node.names:
                imports[alias.asname or alias.name] = ROOT.joinpath(*node.module.split(".")).with_suffix(".py")
    sources = [(app_path, app_tree, "app", "")]
    for node in ast.walk(app_tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "register_blueprint":
            blueprint = node.args[0].id
            prefix = next(ast.literal_eval(kw.value) for kw in node.keywords if kw.arg == "url_prefix")
            path = imports[blueprint]
            sources.append((path, load_tree(path), blueprint, prefix))
    operations = {}
    for path, tree, receiver, prefix in sources:
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)
                        and isinstance(decorator.func.value, ast.Name) and decorator.func.value.id == receiver
                        and decorator.func.attr in METHODS | {"route"}):
                    continue
                route = prefix + ast.literal_eval(decorator.args[0])
                if not (route.startswith("/api/") or route == "/health"):
                    continue
                methods = [decorator.func.attr]
                if methods == ["route"]:
                    methods = next((ast.literal_eval(kw.value) for kw in decorator.keywords if kw.arg == "methods"), ["GET"])
                route = re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", route)
                role = None
                protected = False
                for guard in node.decorator_list:
                    if isinstance(guard, ast.Name) and guard.id == "require_auth":
                        protected = True
                    if isinstance(guard, ast.Call) and isinstance(guard.func, ast.Name) and guard.func.id == "require_role":
                        protected = True
                        role = ast.literal_eval(guard.args[0])
                errors = set()
                statuses = set()
                for child in ast.walk(node):
                    if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id in {"error_response", "_json_error"}:
                        if len(child.args) >= 3 and isinstance(child.args[0], ast.Constant) and isinstance(child.args[2], ast.Constant):
                            errors.add((str(child.args[2].value), child.args[0].value))
                    if isinstance(child, ast.Return) and isinstance(child.value, ast.Tuple) and len(child.value.elts) >= 2:
                        status = child.value.elts[1]
                        if isinstance(status, ast.Constant) and isinstance(status.value, int):
                            statuses.add(str(status.value))
                for method in methods:
                    key = (route, method.lower())
                    if key in operations:
                        raise ValueError(f"Duplicate source operation: {key}")
                    operations[key] = {"protected": protected, "role": role, "errors": errors, "statuses": statuses,
                                       "source": path.relative_to(ROOT).as_posix()}
    return operations


def validate(document):
    failures = []
    if document.get("openapi") != "3.1.1":
        failures.append("Expected the documented OpenAPI 3.1.1 baseline")
    # Resolve every reference before invoking libraries; no remote retrieval is needed.
    for path, value in walk(document):
        if isinstance(value, dict) and "$ref" in value:
            try:
                resolve(document, value["$ref"])
            except (ValueError, KeyError, IndexError) as error:
                failures.append(f"{path}: {error}")
    if failures:
        raise ValueError("\n".join(failures))
    for error in OpenAPIV31SpecValidator(document).iter_errors():
        failures.append(f"OpenAPI: {error.message}")

    declared = {(path, method): operation for path, item in document["paths"].items()
                for method, operation in item.items() if method in METHODS}
    source = source_operations()
    for key in sorted(source.keys() - declared.keys()):
        failures.append(f"Undocumented source operation: {key}")
    for key in sorted(declared.keys() - source.keys()):
        failures.append(f"Specification operation has no source route: {key}")
    ids = []
    for key, operation in declared.items():
        ids.append(operation.get("operationId"))
        path, method = key
        parameters = document["paths"][path].get("parameters", []) + operation.get("parameters", [])
        parameters = [dereference(document, p) for p in parameters]
        expected_params = set(re.findall(r"\{(\w+)\}", path))
        if {p["name"] for p in parameters if p["in"] == "path"} != expected_params:
            failures.append(f"Path parameter mismatch: {key}")
        if key not in source:
            continue
        contract = source[key]
        expected_security = ([] if not contract["protected"] else READ_SECURITY if method in {"get", "head", "options"} else WRITE_SECURITY)
        if operation.get("security", document.get("security")) != expected_security:
            failures.append(f"Authentication declaration differs from source: {key}")
        if operation.get("x-required-role") != contract["role"]:
            failures.append(f"Role declaration differs from source: {key}")
        responses = operation["responses"]
        for status in contract["statuses"]:
            if status not in responses:
                failures.append(f"Undocumented source status {status}: {key}")
        for status, code in contract["errors"]:
            declared_codes = dereference(document, responses.get(status, {})).get("x-error-codes", [])
            if code not in declared_codes:
                failures.append(f"Undocumented source error {status}/{code}: {key}")
    if None in ids or len(ids) != len(set(ids)):
        failures.append("Every operation must have a unique operationId")

    root_schema = deepcopy(document)
    root_schema["$id"] = BASE_URI
    registry = Registry().with_resource(BASE_URI, Resource.from_contents(root_schema, default_specification=DRAFT202012))

    def schema_validator(schema):
        schema = deepcopy(schema)
        for _, value in walk(schema):
            if isinstance(value, dict) and "$ref" in value:
                value["$ref"] = BASE_URI + value["$ref"]
        return Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())

    examples = 0
    for name, schema in document["components"]["schemas"].items():
        Draft202012Validator.check_schema(schema)
        for example in schema.get("examples", []):
            schema_validator(schema).validate(example)
            examples += 1
    for path, value in walk(document):
        if not isinstance(value, dict) or "schema" not in value:
            continue
        candidates = [value["example"]] if "example" in value else []
        if isinstance(value.get("examples"), dict):
            for example in value["examples"].values():
                example = dereference(document, example)
                if "value" in example:
                    candidates.append(example["value"])
        for example in candidates:
            for error in schema_validator(value["schema"]).iter_errors(example):
                failures.append(f"Invalid example at {path}: {error.message}")
            examples += 1

    if document.get("x-player-handout") is not False or document.get("x-source-distribution") != "public":
        failures.append("Expected public-source reference excluded from spoiler-free player handouts")
    if "docs/" not in (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines():
        failures.append("docs/ must remain excluded from Docker build context")
    readme = (ROOT / "README.md").read_text(encoding="utf-8").lower()
    if "openapi.yaml" in readme or "swagger" in readme:
        failures.append("Player README must not link to the evaluator API specification")
    for path in (ROOT / "src").rglob("*"):
        if path.is_file() and path.suffix in {".py", ".html", ".js"}:
            if re.search(r"openapi\.ya?ml|swagger-ui", path.read_text(encoding="utf-8"), re.I):
                failures.append(f"Review evaluator-reference exposure in {path.relative_to(ROOT)}")
    if re.search(r"duck\{[a-z]{24}\}", yaml.safe_dump(document)):
        failures.append("Flag-shaped value present in specification")
    if failures:
        raise ValueError("\n".join(failures))
    print(f"PASS: OpenAPI 3.1.1; {len(declared)} operations; {len(document['components']['schemas'])} schemas; {examples} examples.")
    print("PASS: local references, source route/status/error coverage, auth/role declarations and static distribution checks.")
    print("Scope: static documentation validation only; response behavior and deployment require separate runtime verification.")


def main():
    try:
        document = yaml.load(SPEC_PATH.read_text(encoding="utf-8"), Loader=UniqueKeyLoader)
        validate(document)
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
