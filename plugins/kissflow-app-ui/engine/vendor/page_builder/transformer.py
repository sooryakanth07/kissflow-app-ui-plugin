"""
Page Metadata Transformer
Main entry point: intermediate JSON -> flat Kissflow page metadata.
"""

import time
from typing import Any, Dict, List, Optional

from utils.page_builder import entity_factory
from utils.page_builder.style_mapper import transform_styles
from utils.page_builder.widget_transformer import (
    transform_widget,
    _apply_on_click,
    _apply_on_load,
    _apply_visibility,
)


def transform(
    intermediate: dict,
    context: Optional[dict] = None,
    input_metadata: Optional[dict] = None,
) -> dict:
    """
    Transform intermediate page format to full Kissflow page metadata.

    Args:
        intermediate: Intermediate page format with 'page' and 'body' keys.
        input_metadata: Original page metadata (edit flow). Used to resolve _raw widgets
            by copying their entity subtree as-is.
        context: Context info (applicationId, userId, userName).

    Returns:
        Full flat page metadata dict.
    """
    context = context or {}
    metadata: Dict[str, Any] = {}
    application_id = context.get("applicationId", "DefaultApp_A00")

    # Phase 1: Create Page entity
    page_id, page_entity = entity_factory.create_page(intermediate["page"], application_id)
    metadata[page_id] = page_entity
    metadata["Root"] = page_id
    metadata["CurrentVersion"] = 2

    # Phase 1b: Create Variables (all types: Text, Number, Boolean, ObjectList, Json)
    variable_ids: List[str] = []
    declared_var_names: set = set()

    # Explicit page variables from the variables array
    all_var_defs = intermediate.get("variables") or []
    for var_def in all_var_defs:
        data_type = var_def.get("type", "Text")
        var_config: Dict[str, Any] = {
            "name": var_def["name"],
            "dataType": data_type,
            "defaultValue": var_def.get("defaultValue"),
        }
        # ObjectList and Json need a Schema
        if data_type in ("ObjectList", "Json") and var_def.get("fields"):
            # If defaultValue is empty, look for a sibling variable with the same fields
            # that has actual data to infer correct types from
            sample_data = var_def.get("defaultValue")
            is_empty = (
                (data_type == "ObjectList" and (not isinstance(sample_data, list) or len(sample_data) == 0))
                or (data_type == "Json" and (not isinstance(sample_data, dict) or len(sample_data) == 0))
            )
            if is_empty:
                for sibling in all_var_defs:
                    if sibling is var_def or sibling.get("type") != data_type:
                        continue
                    sib_fields = sibling.get("fields")
                    if not sib_fields:
                        continue
                    sib_fields_set = set(sib_fields)
                    if all(f in sib_fields_set for f in var_def["fields"]):
                        sample_data = sibling.get("defaultValue")
                        break

            var_config["schema"] = _generate_schema(
                var_def["fields"], sample_data, data_type
            )
        var_id, var_entity = entity_factory.create_variable(var_config, page_id)
        metadata[var_id] = var_entity
        variable_ids.append(var_id)
        declared_var_names.add(var_def["name"])

    # Backwards compat: auto-collect ObjectList variables from repeaters with inline data
    # Skip if a variable with the same name was already declared in the variables array
    variables = _collect_variables(intermediate.get("body", {}).get("children", []))
    for var_data in variables:
        if var_data["name"] in declared_var_names:
            continue
        schema = _generate_schema(var_data["fields"], var_data.get("data", []), "ObjectList")
        var_id, var_entity = entity_factory.create_variable(
            {
                "name": var_data["name"],
                "dataType": "ObjectList",
                "defaultValue": var_data.get("data", []),
                "schema": schema,
            },
            page_id,
        )
        metadata[var_id] = var_entity
        variable_ids.append(var_id)
    page_entity["Page::Variable"] = variable_ids

    # Phase 2: Create Body Container
    body_id, body_entity = entity_factory.create_container("Body", "Body Container")
    metadata[body_id] = body_entity
    page_entity["Page::Container"].append(body_id)

    # Phase 3: Body styles
    body_style = intermediate.get("body", {}).get("style", {})
    if body_style:
        body_style_value = transform_styles(body_style, None, "Body")
        style_id, style_entity = entity_factory.create_style(body_style_value, body_id)
        metadata[style_id] = style_entity
        body_entity["Container::Style"].append(style_id)

    # Phase 3b: Create Popups (before body children so buttons can reference them)
    popup_id_map: Dict[str, str] = {}  # intermediate popup id -> metadata popup entity id
    popups = intermediate.get("popups") or []
    if popups:
        popup_ids = []
        for popup_data in popups:
            # Create Popup entity — reuse intermediate id if it's already a valid entity id
            intermediate_id = popup_data.get("id")
            existing_id = intermediate_id if isinstance(intermediate_id, str) and intermediate_id.startswith("Popup_") else None
            popup_id, popup_entity = entity_factory.create_popup(
                popup_data.get("title") or popup_data.get("id", "Popup"), page_id, existing_id
            )
            metadata[popup_id] = popup_entity
            popup_ids.append(popup_id)
            popup_id_map[popup_data["id"]] = popup_id

            # Popup title FieldMapping
            if popup_data.get("title"):
                title_fm_id, title_fm_entity = entity_factory.create_field_mapping("title", None)
                title_fm_entity["Popup"] = popup_id
                del title_fm_entity["Container"]
                metadata[title_fm_id] = title_fm_entity
                title_prop_id, title_prop_entity = entity_factory.create_property(
                    popup_data["title"], title_fm_id
                )
                metadata[title_prop_id] = title_prop_entity
                title_fm_entity["FieldMapping::Property"].append(title_prop_id)
                popup_entity["Popup::FieldMapping"].append(title_fm_id)

            # Popup Style (on Popup entity itself)
            popup_style_data = popup_data.get("style") or {}
            if popup_style_data:
                popup_style_value = transform_styles(popup_style_data, "Popup", None)
                ps_id, ps_entity = entity_factory.create_style(popup_style_value, None)
                ps_entity["Popup"] = popup_id
                del ps_entity["Container"]
                metadata[ps_id] = ps_entity
                popup_entity["Popup::Style"].append(ps_id)

            # Popup Container (Type: "Popup")
            pc_id, pc_entity = entity_factory.create_container("Popup", "Popup Container")
            pc_entity["Popup"] = popup_id
            metadata[pc_id] = pc_entity
            popup_entity["Popup::Container"].append(pc_id)

            # Popup Container Style
            container_style = popup_data.get("containerStyle") or {}
            pc_style_value = transform_styles(
                {"flexDirection": "column", "gap": "12px", **container_style}, None, "Popup"
            )
            pcs_id, pcs_entity = entity_factory.create_style(pc_style_value, pc_id)
            metadata[pcs_id] = pcs_entity
            pc_entity["Container::Style"] = [pcs_id]

            # Transform popup children
            popup_children = popup_data.get("children") or []
            if popup_children:
                pc_entity["Container::Container"] = []
                for child in popup_children:
                    child_id = transform_widget(child, pc_id, page_id, metadata, popup_id_map, input_metadata)
                    pc_entity["Container::Container"].append(child_id)

        page_entity["Page::Popup"] = popup_ids

    # Phase 4: Transform body children (pass popup_id_map for button openPopup references)
    for child in intermediate.get("body", {}).get("children", []):
        child_id = transform_widget(child, body_id, page_id, metadata, popup_id_map, input_metadata)
        body_entity["Container::Container"].append(child_id)

    # Phase 4b: Body-level events (onClick, onLoad) and visibility
    body_intermediate = intermediate.get("body", {})
    if body_intermediate.get("onClick"):
        _apply_on_click(body_intermediate["onClick"], body_id, body_entity, metadata, popup_id_map)
    if body_intermediate.get("onLoad"):
        _apply_on_load(body_intermediate["onLoad"], body_id, body_entity, metadata, popup_id_map)
    if body_intermediate.get("visibility"):
        _apply_visibility(body_intermediate["visibility"], body_id, body_entity, metadata)

    # Phase 5: Collect all Component IDs and VariableRef IDs
    component_ids = []
    variable_ref_ids = []
    for key, value in metadata.items():
        if isinstance(value, dict):
            if value.get("Kind") == "Component":
                component_ids.append(key)
            if value.get("Kind") == "VariableRef":
                variable_ref_ids.append(key)
    page_entity["Page::Component"] = component_ids
    if variable_ref_ids:
        page_entity["Page::VariableRef"] = variable_ref_ids

    # Phase 6: Add metadata version
    metadata["_meta_version"] = str(int(time.time() * 1000))

    return metadata


def rewrite_page_id(metadata: dict, new_page_id: str, app_id: str) -> dict:
    """
    Rewrite the auto-generated Page ID with a Kissflow-assigned one.
    Updates Root, the Page entity key, all Component.Page back-references,
    and _application_id.

    Args:
        metadata: Full flat metadata (mutated in place).
        new_page_id: Kissflow-assigned page ID.
        app_id: Kissflow application ID.

    Returns:
        The mutated metadata.
    """
    old_page_id = metadata.get("Root")
    if not old_page_id or old_page_id not in metadata:
        return metadata

    page_entity = metadata.pop(old_page_id)
    page_entity["Id"] = new_page_id
    page_entity["_application_id"] = app_id
    metadata[new_page_id] = page_entity
    metadata["Root"] = new_page_id

    for entity in metadata.values():
        if isinstance(entity, dict) and entity.get("Page") == old_page_id:
            entity["Page"] = new_page_id

    return metadata


def _collect_variables(children: List[dict]) -> List[dict]:
    """Recursively collect variable definitions from Repeater widgets."""
    variables = []
    for child in children:
        if child.get("type") == "Repeater" and child.get("variable") and child.get("data"):
            variables.append(
                {
                    "name": child["variable"],
                    "fields": child.get("fields") or list((child["data"][0] or {}).keys()) if child.get("data") else [],
                    "data": child.get("data", []),
                }
            )
        if child.get("children"):
            variables.extend(_collect_variables(child["children"]))
    return variables


def _infer_schema(value: Any) -> dict:
    """Recursively infer a JSON Schema fragment for a single value.
    Handles primitives, arrays of primitives/objects, and nested objects.
    """
    if value is None:
        return {"type": "string"}
    if isinstance(value, bool):
        return {"type": "boolean"}
    if isinstance(value, int):
        return {"type": "integer"}
    if isinstance(value, float):
        return {"type": "number"}
    if isinstance(value, str):
        return {"type": "string"}
    if isinstance(value, list):
        items = _infer_schema(value[0]) if len(value) > 0 else {"type": "string"}
        return {"type": "array", "items": items}
    if isinstance(value, dict):
        properties = {k: _infer_schema(v) for k, v in value.items()}
        return {"type": "object", "properties": properties}
    return {"type": "string"}


def _generate_schema(fields: List[str], data: Any = None, data_type: str = "ObjectList") -> dict:
    """Generate a JSON Schema from field names and sample data.

    Args:
        fields: Field names
        data: Default value (list for ObjectList, dict for Json)
        data_type: 'ObjectList' or 'Json'
    """
    if data_type == "Json":
        sample = data if isinstance(data, dict) else {}
    else:
        sample = data[0] if isinstance(data, list) and data else {}

    properties = {}
    for field in fields:
        value = sample.get(field) if isinstance(sample, dict) else None
        properties[field] = _infer_schema(value)

    if data_type == "Json":
        return {"type": "object", "properties": properties}
    return {
        "type": "array",
        "items": {
            "type": "object",
            "properties": properties,
        },
    }
