"""
Metadata Structural Validator
Validates the transformed flat metadata for structural integrity.
"""

from typing import Dict, List


def validate_metadata(metadata: dict) -> Dict:
    """
    Validate full page metadata.

    Returns:
        {"valid": bool, "errors": list[str]}
    """
    errors: List[str] = []

    if not metadata or not isinstance(metadata, dict):
        return {"valid": False, "errors": ["Metadata must be an object"]}

    # Check Root exists
    root = metadata.get("Root")
    if not root:
        errors.append("Missing Root pointer")
    elif root not in metadata:
        errors.append(f'Root "{root}" does not exist in metadata')
    elif not isinstance(metadata[root], dict) or metadata[root].get("Kind") != "Page":
        errors.append(f'Root "{root}" is not a Page entity')

    # Check all relationship arrays point to existing entities
    for key, entity in metadata.items():
        if not isinstance(entity, dict) or not entity.get("Kind"):
            continue

        # Check Container back-reference
        container_ref = entity.get("Container")
        if isinstance(container_ref, str) and container_ref not in metadata:
            errors.append(f'{key}: Container reference "{container_ref}" not found')

        # Check Page back-reference for Components
        if entity.get("Kind") == "Component" and entity.get("Page"):
            if entity["Page"] not in metadata:
                errors.append(f'{key}: Page reference "{entity["Page"]}" not found')

        # Check FieldMapping back-reference for Properties
        if entity.get("Kind") == "Property" and entity.get("FieldMapping"):
            if entity["FieldMapping"] not in metadata:
                errors.append(f'{key}: FieldMapping reference "{entity["FieldMapping"]}" not found')

        # Check relationship arrays
        for rel_key, refs in entity.items():
            if "::" not in rel_key:
                continue
            if not isinstance(refs, list):
                continue
            for ref in refs:
                if isinstance(ref, str) and ref not in metadata:
                    errors.append(f'{key}.{rel_key}: reference "{ref}" not found in metadata')

    # Check Page::Component lists all Components
    page_id = metadata.get("Root")
    if page_id and isinstance(metadata.get(page_id), dict):
        declared_components = set(metadata[page_id].get("Page::Component", []))
        for key, entity in metadata.items():
            if isinstance(entity, dict) and entity.get("Kind") == "Component":
                if key not in declared_components:
                    errors.append(f'Component "{key}" exists but is not in Page::Component')

    return {"valid": len(errors) == 0, "errors": errors}
