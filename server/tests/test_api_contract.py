"""The API every deployed client depends on, written down so it cannot drift by accident.

Five clients are in the field at once -- the web dashboard, the Android phone app, the
Windows desk build, the Wear OS watch and the ESP32 receivers -- and none of them can be
updated the moment the server changes. Receivers in particular are flashed once and left
on a ward wall. The backend is being restructured underneath them, so the one thing that
must not move is what they see: the routes, the fields, which fields are required.

The snapshot is a summary rather than raw OpenAPI on purpose. FastAPI and Pydantic
reword their generated schema between releases (titles, `anyOf` shapes), and a contract
test that goes red on a library bump trains everyone to regenerate it without reading.
What is kept is exactly what a client breaks on.

A change here is either a mistake or a deliberate API change. For the second, regenerate
and review the diff like any other code:

    UPDATE_CONTRACT=1 python -m pytest tests/test_api_contract.py
"""

import json
import os
from pathlib import Path

from fastapi.routing import APIRoute

from app.main import app

SNAPSHOT = Path(__file__).resolve().parent / "contract" / "api_contract.json"


def _schema_ref(schema: dict | None) -> str | None:
    """Collapses a request/response schema to the model name a client deserializes."""
    if not schema:
        return None
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    if schema.get("type") == "array":
        inner = _schema_ref(schema.get("items"))
        return f"list[{inner}]"
    return schema.get("type", "object")


def _field_type(prop: dict) -> str:
    if "$ref" in prop:
        return prop["$ref"].rsplit("/", 1)[-1]
    if "anyOf" in prop:
        return " | ".join(sorted(_field_type(p) for p in prop["anyOf"]))
    if prop.get("type") == "array":
        return f"list[{_field_type(prop.get('items', {}))}]"
    if "enum" in prop:
        return "enum(" + ",".join(str(v) for v in prop["enum"]) + ")"
    kind = prop.get("type", "any")
    # date-time vs plain string is a contract: the clients parse one and display the other.
    return f"{kind}:{prop['format']}" if "format" in prop else kind


def _all_routes(routes) -> list[APIRoute]:
    """Flattens included routers. Recent FastAPI keeps an included router as one lazy
    entry (holding `original_router`) instead of copying its routes onto the app."""
    found: list[APIRoute] = []
    for route in routes:
        if isinstance(route, APIRoute):
            found.append(route)
        elif hasattr(route, "original_router"):
            found.extend(_all_routes(route.original_router.routes))
    return found


def build_contract() -> dict:
    spec = app.openapi()

    operations: dict[str, dict] = {}
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            body = op.get("requestBody", {}).get("content", {})
            body_schema = next(iter(body.values()), {}).get("schema") if body else None
            responses = {}
            for code, resp in op.get("responses", {}).items():
                if code == "422":
                    continue
                content = resp.get("content", {})
                schema = next(iter(content.values()), {}).get("schema") if content else None
                responses[code] = _schema_ref(schema)
            operations[f"{method.upper()} {path}"] = {
                "params": sorted(
                    f"{p['in']}:{p['name']}{'' if p.get('required') else '?'}"
                    for p in op.get("parameters", [])
                ),
                "body": _schema_ref(body_schema),
                "responses": responses,
            }

    models: dict[str, dict] = {}
    for name, schema in spec.get("components", {}).get("schemas", {}).items():
        if name in ("HTTPValidationError", "ValidationError"):
            continue
        if "enum" in schema:
            models[name] = {"enum": [str(v) for v in schema["enum"]]}
            continue
        required = set(schema.get("required", []))
        models[name] = {
            field: _field_type(prop) + ("" if field in required else "?")
            for field, prop in sorted(schema.get("properties", {}).items())
        }

    # Routes left out of the schema still have callers: the dashboard SPA paths, APK
    # downloads the phones update from, /health for the uptime monitor. The live call
    # socket (/ws/calls) is held to its behaviour by test_review_regressions instead.
    hidden = sorted(
        f"{','.join(sorted(r.methods))} {r.path}" for r in _all_routes(app.routes) if not r.include_in_schema
    )
    return {
        "operations": dict(sorted(operations.items())),
        "models": dict(sorted(models.items())),
        "hidden_routes": hidden,
    }


def test_the_api_contract_has_not_changed():
    current = build_contract()
    if os.getenv("UPDATE_CONTRACT"):
        SNAPSHOT.parent.mkdir(exist_ok=True)
        SNAPSHOT.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n")
    expected = json.loads(SNAPSHOT.read_text())

    for section in ("operations", "models"):
        removed = sorted(set(expected[section]) - set(current[section]))
        assert not removed, f"{section} removed -- deployed clients still call these: {removed}"
        changed = sorted(k for k in expected[section] if expected[section][k] != current[section][k])
        assert not changed, f"{section} changed shape: " + "; ".join(
            f"{k}: {expected[section][k]} -> {current[section][k]}" for k in changed
        )
    assert current == expected, (
        "API grew (new route, model or field). If intended, regenerate with UPDATE_CONTRACT=1 "
        "and commit the snapshot."
    )


def test_domain_errors_reach_clients_exactly_as_before(client):
    """Services raise DomainError now instead of HTTPException; the body and status a
    client sees must not change."""
    res = client.post("/api/v1/calls", json={"device_id": "no-such-device", "ev1527_code": 1})
    assert res.status_code == 401
    assert set(res.json()) == {"detail"}
    assert isinstance(res.json()["detail"], str)
