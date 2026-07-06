"""
JSON Patch (RFC 6902) implementation.
Applies patch operations to a JSON document.
"""

import copy
from typing import Any, Dict, List, Tuple, Union


def _resolve_pointer(doc: Any, path: str) -> Tuple[Any, Union[str, int], Any]:
    """
    Resolve a JSON Pointer (RFC 6901) path to (parent, key, value).

    :param doc: The document to resolve against.
    :param path: JSON Pointer path (e.g., "/body/children/0/style/background").
    :returns: Tuple of (parent, key, value).
    """
    if path == "":
        return None, None, doc

    tokens = path.split("/")[1:]  # remove leading empty string from split
    # Unescape RFC 6901: ~1 → /, ~0 → ~
    tokens = [t.replace("~1", "/").replace("~0", "~") for t in tokens]

    current = doc
    for i in range(len(tokens) - 1):
        token = int(tokens[i]) if isinstance(current, list) else tokens[i]
        current = current[token]
        if current is None:
            raise ValueError(f'Path not found: "{path}" (failed at "{tokens[i]}")')

    tail = tokens[-1]
    if isinstance(current, list):
        key = "-" if tail == "-" else int(tail)
    else:
        key = tail

    value = (
        None
        if key == "-"
        else current[key]
        if isinstance(current, list) and key < len(current)
        else current.get(key)
        if isinstance(current, dict)
        else None
    )
    return current, key, value


def _apply_op(doc: Any, op: dict) -> None:
    """Apply a single patch operation."""
    operation = op["op"]

    if operation == "replace":
        parent, key, _ = _resolve_pointer(doc, op["path"])
        if parent is None:
            raise ValueError("Cannot replace root")
        parent[key] = op["value"]

    elif operation == "add":
        parent, key, _ = _resolve_pointer(doc, op["path"])
        if parent is None:
            raise ValueError("Cannot add at root")
        if isinstance(parent, list):
            if key == "-":
                parent.append(op["value"])
            else:
                parent.insert(key, op["value"])
        else:
            parent[key] = op["value"]

    elif operation == "remove":
        parent, key, _ = _resolve_pointer(doc, op["path"])
        if parent is None:
            raise ValueError("Cannot remove root")
        if isinstance(parent, list):
            parent.pop(key)
        else:
            del parent[key]

    elif operation == "move":
        if "from" not in op:
            raise ValueError('move: missing "from"')
        source_parent, source_key, source_value = _resolve_pointer(doc, op["from"])
        if isinstance(source_parent, list):
            source_parent.pop(source_key)
        else:
            del source_parent[source_key]
        parent, key, _ = _resolve_pointer(doc, op["path"])
        if isinstance(parent, list):
            if key == "-":
                parent.append(source_value)
            else:
                parent.insert(key, source_value)
        else:
            parent[key] = source_value

    elif operation == "copy":
        if "from" not in op:
            raise ValueError('copy: missing "from"')
        _, _, source_value = _resolve_pointer(doc, op["from"])
        copied = copy.deepcopy(source_value)
        parent, key, _ = _resolve_pointer(doc, op["path"])
        if isinstance(parent, list):
            if key == "-":
                parent.append(copied)
            else:
                parent.insert(key, copied)
        else:
            parent[key] = copied

    else:
        raise ValueError(f'Unknown patch operation: "{operation}"')


def apply_patch(document: Any, patches: List[dict]) -> Any:
    """
    Apply a JSON Patch (RFC 6902) to a document.

    :param document: The document to patch (deep-cloned first).
    :param patches: Array of patch operations.
    :returns: The patched document.
    """
    if not isinstance(patches, list):
        raise ValueError("Patches must be an array of operations")

    doc = copy.deepcopy(document)

    for i, patch in enumerate(patches):
        if not patch.get("op") or "path" not in patch:
            raise ValueError(f'Patch[{i}]: missing "op" or "path"')
        try:
            _apply_op(doc, patch)
        except Exception as err:
            raise ValueError(f"Patch[{i}] ({patch['op']} {patch['path']}): {err}") from err

    return doc


def validate_patches(patches: Any) -> Dict[str, Any]:
    """
    Validate patch operations before applying.

    :param patches: Array of patch operations.
    :returns: Dict with "valid" (bool) and "errors" (list of strings).
    """
    errors = []
    if not isinstance(patches, list):
        return {"valid": False, "errors": ["Patches must be an array"]}

    valid_ops = ("add", "remove", "replace", "move", "copy")

    for i, p in enumerate(patches):
        if not p or not isinstance(p, dict):
            errors.append(f"Patch[{i}]: must be an object")
            continue
        if p.get("op") not in valid_ops:
            errors.append(f'Patch[{i}]: op must be one of {", ".join(valid_ops)}, got "{p.get("op")}"')
        path = p.get("path")
        if not isinstance(path, str) or not path.startswith("/"):
            errors.append(f'Patch[{i}]: path must be a string starting with "/"')
        if p.get("op") in ("add", "replace") and "value" not in p:
            errors.append(f'Patch[{i}]: {p["op"]} requires a "value"')
        if p.get("op") in ("move", "copy"):
            from_path = p.get("from")
            if not from_path or not isinstance(from_path, str) or not from_path.startswith("/"):
                errors.append(f'Patch[{i}]: {p["op"]} requires a "from" path starting with "/"')

    return {"valid": len(errors) == 0, "errors": errors}


def normalize_patch_response(parsed: Any) -> Any:
    """
    Normalize common LLM patch response formats into a proper array.
    Handles: bare array, single op object, wrapped in patch/patches/operations key.
    """
    if isinstance(parsed, list):
        return parsed

    if parsed and isinstance(parsed, dict):
        if "op" in parsed and "path" in parsed:
            return [parsed]
        for key in ("patch", "patches", "operations"):
            if isinstance(parsed.get(key), list):
                return parsed[key]

    return parsed
