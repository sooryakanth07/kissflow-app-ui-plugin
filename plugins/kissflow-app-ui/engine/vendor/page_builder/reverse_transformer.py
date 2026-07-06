"""
Reverse Transformer
Converts flat Kissflow page metadata → compact intermediate JSON.
"""

from typing import Any, Dict, List, Optional, Set

from utils.page_builder.component_catalog import COMPONENT_REGISTRY
from utils.page_builder.reverse_style_mapper import reverse_styles

# Build script_path → type reverse map
SCRIPT_TO_TYPE: Dict[str, str] = {reg["script_path"]: widget_type for widget_type, reg in COMPONENT_REGISTRY.items()}

# Config fields to skip during property reversal (only when skip_config_fields=True)
_CONFIG_FIELDS = frozenset(
    [
        "caption",
        "flow_type",
        "flow_id",
        "view_id",
        "view_type",
        "variable_id",
        "variable_type",
        "filterParameters",
        "status",
        "activity_id",
        "selectedFields",
        "report_id",
        "showHeader",
        "showform",
        "steps",
        "newItem",
        "tabType",
    ]
)


def reverse_transform(metadata: dict) -> dict:
    """
    Convert flat Kissflow metadata to intermediate JSON.

    :param metadata: Full flat page metadata.
    :returns: Intermediate JSON.
    """
    visited: Set[str] = set()

    page_id = metadata.get("Root")
    page = metadata.get(page_id)

    if not page or page.get("Kind") != "Page":
        raise ValueError("Invalid metadata: no Page entity at Root")

    # Get Body Container
    body_id = (page.get("Page::Container") or [None])[0]
    body = metadata.get(body_id) if body_id else None

    if not body or body.get("Type") != "Body":
        raise ValueError("Invalid metadata: no Body container found")

    # Reverse body style
    body_style = _reverse_container_style(body, metadata, "Body")

    # Walk children
    children = _reverse_children(body.get("Container::Container") or [], metadata, visited)

    result: Dict[str, Any] = {
        "page": {
            "name": page.get("Name"),
            "description": page.get("Description", ""),
        },
        "body": {
            "children": children,
        },
    }

    if body_style:
        result["body"]["style"] = body_style

    # Reverse body's onClick, onLoad, and visibility (body can have on_load events)
    _apply_reversed_events(body, metadata, result["body"])

    # Reverse all page variables
    var_ids = page.get("Page::Variable") or []
    all_vars = []
    for var_id in var_ids:
        var_entity = metadata.get(var_id)
        if not var_entity:
            continue
        var_def: Dict[str, Any] = {
            "name": var_entity.get("Name"),
            "type": var_entity.get("DataType", "Text"),
        }
        if var_entity.get("DefaultValue") is not None:
            var_def["defaultValue"] = var_entity["DefaultValue"]
        # Extract field names from Schema for ObjectList/Json
        schema = var_entity.get("Schema")
        if schema:
            schema_props = (
                schema.get("items", {}).get("properties") if schema.get("type") == "array" else schema.get("properties")
            )
            if schema_props:
                var_def["fields"] = list(schema_props.keys())
        all_vars.append(var_def)

    if all_vars:
        result["variables"] = all_vars

    # Reverse popups
    popup_ids = page.get("Page::Popup") or []
    if popup_ids:
        popups = []
        for pid in popup_ids:
            popup_entity = metadata.get(pid)
            if not popup_entity:
                continue
            popup_def = _reverse_popup(popup_entity, metadata, visited)
            if popup_def:
                popups.append(popup_def)
        if popups:
            result["popups"] = popups

    return result


def _reverse_popup(popup_entity: dict, metadata: dict, visited: Set[str]) -> Optional[dict]:
    """Reverse a Popup entity into the intermediate popup format."""
    popup_id = popup_entity.get("Id")

    # Title from Popup::FieldMapping
    title = popup_entity.get("Name", "")
    for fm_id in popup_entity.get("Popup::FieldMapping") or []:
        fm = metadata.get(fm_id)
        if not fm or fm.get("Name") != "title":
            continue
        prop_ids = fm.get("FieldMapping::Property") or []
        if not prop_ids:
            continue
        prop = metadata.get(prop_ids[0])
        if prop and prop.get("Value"):
            title = prop["Value"]
            break

    # Style from Popup::Style
    popup_style = {}
    for sid in popup_entity.get("Popup::Style") or []:
        style_entity = metadata.get(sid)
        if not style_entity or not style_entity.get("Value"):
            continue
        popup_style.update(reverse_styles(style_entity["Value"], "Popup", None))

    # Popup container (Type: "Popup")
    container_style: Dict[str, Any] = {}
    children: list = []
    container_ids = popup_entity.get("Popup::Container") or []
    if container_ids:
        popup_container = metadata.get(container_ids[0])
        if popup_container:
            visited.add(popup_container.get("Id"))
            cstyle = _reverse_container_style(popup_container, metadata, "Popup")
            # Strip flexDirection: column / gap: 12px defaults that forward transformer auto-adds
            if cstyle.get("flexDirection") == "column":
                del cstyle["flexDirection"]
            if cstyle.get("gap") == "12px":
                del cstyle["gap"]
            container_style = cstyle

            children = _reverse_children(popup_container.get("Container::Container") or [], metadata, visited)

    result: Dict[str, Any] = {"id": popup_id, "title": title}
    if popup_style:
        result["style"] = popup_style
    if container_style:
        result["containerStyle"] = container_style
    if children:
        result["children"] = children
    return result


def _reverse_children(child_ids: list, metadata: dict, visited: Set[str]) -> list:
    """Reverse a list of child container IDs into intermediate widgets."""
    children = []

    for child_id in child_ids:
        if child_id in visited:
            continue
        visited.add(child_id)

        entity = metadata.get(child_id)
        if not entity:
            continue

        widget = _reverse_entity(entity, metadata, visited)
        if widget:
            children.append(widget)

    return children


def _reverse_entity(entity: dict, metadata: dict, visited: Set[str]) -> Optional[dict]:
    """Reverse a single entity into an intermediate widget."""
    entity_type = entity.get("Type")

    if entity_type == "Component":
        return _reverse_component_wrapper(entity, metadata, visited)

    if entity_type == "Repeater":
        # Repeater template containers are handled by their parent Repeater component
        return None

    # Any container type with children
    if entity.get("Kind") == "Container" and entity_type in ("Container", "Body"):
        return _reverse_container(entity, metadata, visited)

    return None


def _reverse_container(entity: dict, metadata: dict, visited: Set[str]) -> dict:
    """Reverse a regular Container."""
    style = _reverse_container_style(entity, metadata, "Container")
    children = _reverse_children(entity.get("Container::Container") or [], metadata, visited)

    # Detect layout from flexDirection
    layout = "vertical"
    if style.get("flexDirection") == "row":
        layout = "horizontal"
        del style["flexDirection"]
    elif style.get("flexDirection") == "column":
        del style["flexDirection"]

    result: Dict[str, Any] = {
        "type": "Container",
        "name": entity.get("Name") or "Container",
        "layout": layout,
    }

    if style:
        result["style"] = style
    if children:
        result["children"] = children

    # Reverse events and visibility
    _apply_reversed_events(entity, metadata, result)

    return result


def _reverse_component_wrapper(entity: dict, metadata: dict, visited: Set[str]) -> Optional[dict]:
    """Reverse a Component wrapper container."""
    component_ids = entity.get("Container::Component") or []
    if not component_ids:
        return None

    component = metadata.get(component_ids[0])
    if not component:
        return None

    script_path = (component.get("Script") or {}).get("web")

    # Detect special types
    if script_path == "general/repeater":
        return _reverse_repeater(entity, component, metadata, visited)

    if script_path == "report/chart":
        return _reverse_chart_report(entity, component, metadata)

    if script_path == "view/table":
        return _reverse_table_view(entity, component, metadata)

    if script_path == "view/form":
        return _reverse_form_view(entity, component, metadata)

    if script_path == "general/tab":
        return _reverse_tab(entity, component, metadata, visited)

    # Regular component
    widget_type = SCRIPT_TO_TYPE.get(script_path)
    if not widget_type:
        # Unsupported component — emit a passthrough placeholder.
        # The forward transformer will copy the entire entity subtree from the input metadata,
        # preserving the original widget unchanged.
        display_name = component.get("Name") or script_path or "Unknown"
        return {
            "type": "Container",
            "name": f"Unsupported: {display_name}",
            "_raw": True,
            "_entityId": entity.get("Id"),
            "children": [{"type": "Label", "properties": {"title": f"Unsupported component: {display_name}"}}],
        }

    return _reverse_component(entity, component, widget_type, metadata)


def _reverse_component(
    wrapper_entity: dict,
    component: dict,
    widget_type: str,
    metadata: dict,
) -> dict:
    """Reverse a regular component (Label, Button, Card, etc.)."""
    properties = _reverse_properties(wrapper_entity, metadata)
    style = _reverse_component_style(wrapper_entity, widget_type, metadata)

    # Remove default properties that match catalog defaults
    registry = COMPONENT_REGISTRY.get(widget_type)
    if registry:
        for key, prop_def in registry.get("properties", {}).items():
            if properties.get(key) == prop_def.get("default"):
                del properties[key]

    result: Dict[str, Any] = {"type": widget_type}
    if component.get("Name") and component["Name"] != widget_type:
        result["name"] = component["Name"]
    if properties:
        result["properties"] = properties
    if style:
        result["style"] = style

    # Reverse events and visibility on the wrapper container
    _apply_reversed_events(wrapper_entity, metadata, result)

    return result


def _reverse_repeater(
    wrapper_entity: dict,
    component: dict,
    metadata: dict,
    visited: Set[str],
) -> dict:
    """Reverse a Repeater component."""
    data = component.get("Data") or {}
    result: Dict[str, Any] = {"type": "Repeater"}

    if component.get("Name") and component["Name"] != "Repeater":
        result["name"] = component["Name"]

    # Determine source type
    flow_type = data.get("flow_type")
    if flow_type == "Form":
        result["dataform"] = {
            "formId": data.get("flow_id"),
            "viewId": data.get("view_id") or "allitems",
        }
    elif flow_type == "Process":
        result["process"] = {
            "processId": data.get("flow_id"),
            "viewId": data.get("view_id") or "admin",
        }
    elif flow_type == "Variable":
        result["variable"] = data.get("variable_id")
        # Try to get default data from Variable entity
        page_id = component.get("Page")
        page = metadata.get(page_id) if page_id else None
        if page:
            for var_id in page.get("Page::Variable") or []:
                var_entity = metadata.get(var_id)
                if var_entity and var_entity.get("Name") == data.get("variable_id"):
                    result["data"] = var_entity.get("DefaultValue") or []
                    break

    result["fields"] = data.get("selectedFields") or []

    # Detect repeater layout + viewport style from wrapper style
    wrapper_style_ids = wrapper_entity.get("Container::Style") or []
    if wrapper_style_ids:
        wrapper_style_entity = metadata.get(wrapper_style_ids[0])
        wrapper_style_value = (wrapper_style_entity or {}).get("Value") or {}

        has_horizontal = (wrapper_style_value.get("Repeater.Arrangement.Direction") or {}).get("value") == "horizontal"
        has_grid = (wrapper_style_value.get("Repeater.Arrangement.Display") or {}).get("value") == "grid"

        if has_grid:
            result["repeaterLayout"] = "grid"
            cols = (wrapper_style_value.get("Repeater.Arrangement.Columns") or {}).get("value")
            if cols and cols != "4":
                result["gridColumns"] = int(cols)
        elif has_horizontal:
            result["repeaterLayout"] = "horizontal"

        # Reverse viewport sizing from Repeater.* keys → style
        reverse_viewport_map = {
            "Repeater.Width": "width",
            "Repeater.Height": "height",
            "Repeater.Row.Gap": "rowGap",
            "Repeater.Column.Gap": "columnGap",
        }
        viewport_style: Dict[str, Any] = {}
        for full_key, friendly in reverse_viewport_map.items():
            val = (wrapper_style_value.get(full_key) or {}).get("value")
            if val is not None:
                viewport_style[friendly] = val
        # Collapse rowGap + columnGap → gap if equal
        if viewport_style.get("rowGap") and viewport_style.get("rowGap") == viewport_style.get("columnGap"):
            viewport_style["gap"] = viewport_style.pop("rowGap")
            del viewport_style["columnGap"]
        if viewport_style:
            result["style"] = viewport_style

    # Get template container style + children from Repeater entity
    repeater_entity_ids = component.get("Component::Repeater") or []
    if repeater_entity_ids:
        repeater_entity = metadata.get(repeater_entity_ids[0])
        template_container_ids = (repeater_entity or {}).get("Repeater::Container") or []

        if template_container_ids:
            template_container = metadata.get(template_container_ids[0])

            # templateStyle from Repeater.Container.* keys (filter resets)
            template_style = _reverse_container_style(template_container, metadata, "Repeater", filter_resets=True)
            if template_style:
                result["templateStyle"] = template_style

            # Template children
            template_child_ids = (template_container or {}).get("Container::Container") or []
            result["template"] = _reverse_template_children(template_child_ids, metadata, visited)

    return result


def _reverse_template_children(child_ids: list, metadata: dict, visited: Set[str]) -> list:
    """Reverse template children (inside repeater — handles variable bindings)."""
    children = []

    for child_id in child_ids:
        if child_id in visited:
            continue
        visited.add(child_id)

        entity = metadata.get(child_id)
        if not entity:
            continue

        if entity.get("Type") == "Container" and entity.get("LayoutType") == "flex":
            style = _reverse_container_style(entity, metadata, "Container")
            template_children = _reverse_template_children(entity.get("Container::Container") or [], metadata, visited)

            layout = "vertical"
            if style.get("flexDirection") == "row":
                layout = "horizontal"
                del style["flexDirection"]
            elif style.get("flexDirection") == "column":
                del style["flexDirection"]

            result: Dict[str, Any] = {"type": "Container", "layout": layout}
            if entity.get("Name") and entity["Name"] != "Container":
                result["name"] = entity["Name"]
            if style:
                result["style"] = style
            if template_children:
                result["children"] = template_children
            _apply_reversed_events(entity, metadata, result)
            children.append(result)

        elif entity.get("Type") == "Component":
            component_ids = entity.get("Container::Component") or []
            component = metadata.get(component_ids[0]) if component_ids else None
            if not component:
                continue

            script_path = (component.get("Script") or {}).get("web")
            widget_type = SCRIPT_TO_TYPE.get(script_path)
            if not widget_type:
                # Unsupported component inside repeater template — skip entirely
                continue

            # Reverse properties with variable binding support
            properties = _reverse_properties(entity, metadata, with_bindings=True)
            style = _reverse_component_style(entity, widget_type, metadata)

            # Remove defaults
            registry = COMPONENT_REGISTRY.get(widget_type)
            if registry:
                for key, prop_def in registry.get("properties", {}).items():
                    if properties.get(key) == prop_def.get("default"):
                        del properties[key]

            result = {"type": widget_type}
            if properties:
                result["properties"] = properties
            if style:
                result["style"] = style
            _apply_reversed_events(entity, metadata, result)
            children.append(result)

    return children


def _reverse_chart_report(wrapper_entity: dict, component: dict, metadata: dict) -> dict:
    """Reverse a ChartReport component."""
    data = component.get("Data") or {}

    report: Dict[str, Any] = {}
    if data.get("flow_type") == "Process" and data.get("flow_id"):
        report["processId"] = data["flow_id"]
    elif data.get("flow_id"):
        report["formId"] = data["flow_id"]
    if data.get("report_id"):
        report["reportId"] = data["report_id"]

    style = _reverse_component_style(wrapper_entity, "ChartReport", metadata)

    result: Dict[str, Any] = {
        "type": "ChartReport",
        "name": component.get("Name") or "Chart",
        "report": report,
    }

    # Mark as unmapped if missing required data
    if not report.get("formId") and not report.get("processId"):
        result["_unmapped"] = True

    if style:
        result["style"] = style

    return result


def _reverse_table_view(wrapper_entity: dict, component: dict, metadata: dict) -> dict:
    """Reverse a Table view component (ProcessTable or DataformTable)."""
    data = component.get("Data") or {}
    flow_type = data.get("flow_type", "Form")
    widget_type = "ProcessTable" if flow_type == "Process" else "DataformTable"
    style = _reverse_component_style(wrapper_entity, widget_type, metadata)
    properties = _reverse_properties(wrapper_entity, metadata, skip_config_fields=True)

    if flow_type == "Process":
        result: Dict[str, Any] = {
            "type": "ProcessTable",
            "name": component.get("Name") or "Table",
            "process": {
                "processId": data.get("flow_id"),
                "viewId": data.get("view_id") or "mytasks",
            },
        }
        if not data.get("flow_id"):
            result["_unmapped"] = True
    else:
        result = {
            "type": "DataformTable",
            "name": component.get("Name") or "Table",
            "dataform": {
                "formId": data.get("flow_id"),
                "viewId": data.get("view_id") or "allitems",
            },
        }
        if not data.get("flow_id"):
            result["_unmapped"] = True

    if properties:
        result["properties"] = properties
    if style:
        result["style"] = style
    _apply_reversed_events(wrapper_entity, metadata, result)
    return result


def _reverse_form_view(wrapper_entity: dict, component: dict, metadata: dict) -> dict:
    """Reverse a FormView component (process or dataform form)."""
    data = component.get("Data") or {}

    result: Dict[str, Any] = {"type": "FormView", "name": component.get("Name") or "Form"}

    if data.get("flow_type") == "Process":
        result["process"] = {"processId": data.get("flow_id")}
    else:
        result["dataform"] = {"formId": data.get("flow_id")}

    _apply_reversed_events(wrapper_entity, metadata, result)
    return result


def _reverse_tab(wrapper_entity: dict, component: dict, metadata: dict, visited: Set[str]) -> dict:
    """Reverse a Tab component — walks Component::Tabs -> Tabs::Tab -> Tab::Container."""
    result: Dict[str, Any] = {
        "type": "Tab",
        "name": component.get("Name") or "Tab",
        "tabs": [],
    }

    tabs_ids = component.get("Component::Tabs") or []
    if not tabs_ids:
        _apply_reversed_events(wrapper_entity, metadata, result)
        return result

    tabs_entity = metadata.get(tabs_ids[0])
    if not tabs_entity:
        _apply_reversed_events(wrapper_entity, metadata, result)
        return result

    for tab_id in tabs_entity.get("Tabs::Tab") or []:
        tab_entity = metadata.get(tab_id)
        if not tab_entity:
            continue
        visited.add(tab_id)

        tab_def: Dict[str, Any] = {"name": tab_entity.get("Name") or ""}
        tab_container_ids = tab_entity.get("Tab::Container") or []
        if tab_container_ids:
            tab_container = metadata.get(tab_container_ids[0])
            if tab_container:
                visited.add(tab_container.get("Id"))
                children = _reverse_children(tab_container.get("Container::Container") or [], metadata, visited)
                if children:
                    tab_def["children"] = children
        result["tabs"].append(tab_def)

    _apply_reversed_events(wrapper_entity, metadata, result)
    return result


def _reverse_properties(
    container_entity: dict,
    metadata: dict,
    with_bindings: bool = False,
    skip_config_fields: bool = False,
) -> dict:
    """
    Reverse FieldMapping → Property chain into a properties object.

    :param with_bindings: If True, detect variable bindings (for repeater templates).
    :param skip_config_fields: If True, skip config fields (for repeaters/charts/tables).
    """
    properties: Dict[str, Any] = {}
    field_mapping_ids = container_entity.get("Container::FieldMapping") or []

    for fm_id in field_mapping_ids:
        fm = metadata.get(fm_id)
        if not fm:
            continue

        # Skip config fields only for repeaters/charts/tables
        if skip_config_fields and fm.get("Name") in _CONFIG_FIELDS:
            continue

        prop_ids = fm.get("FieldMapping::Property") or []
        if not prop_ids:
            continue

        prop = metadata.get(prop_ids[0])
        if not prop:
            continue

        if prop.get("Type") == "Variable":
            # Variable binding (DatasourceParameter or PageVariable)
            var_ref_ids = prop.get("Property::VariableRef") or []
            if var_ref_ids:
                var_ref = metadata.get(var_ref_ids[0])
                if var_ref:
                    properties[fm["Name"]] = f"{{{{{var_ref.get('Variable')}}}}}"
                    continue

        if prop.get("Value") is not None:
            properties[fm["Name"]] = prop["Value"]

    return properties


def _reverse_visibility(entity: dict, metadata: dict) -> Optional[dict]:
    """Reverse Container::Criteria → intermediate visibility object."""
    criteria_ids = entity.get("Container::Criteria") or []
    if not criteria_ids:
        return None

    criteria = metadata.get(criteria_ids[0])
    if not criteria:
        return None

    condition_ids = criteria.get("Criteria::Condition") or []
    if not condition_ids:
        return None

    condition = metadata.get(condition_ids[0])
    if not condition:
        return None

    # Determine action
    action = "show" if entity.get("isHidden") else "hide"

    left: Dict[str, Any] = {
        "type": condition.get("LHSType"),
        "variable": condition.get("LHSVariable"),
    }
    if condition.get("LHSDataType"):
        left["dataType"] = condition["LHSDataType"]

    right: Dict[str, Any] = {"type": condition.get("RHSType")}
    if condition.get("RHSVariable") is not None:
        right["variable"] = condition["RHSVariable"]
    if condition.get("RHSValue") is not None:
        right["value"] = condition["RHSValue"]

    return {
        "action": action,
        "condition": {
            "left": left,
            "operator": condition.get("Operator"),
            "right": right,
        },
    }


def _reverse_on_click(entity: dict, metadata: dict) -> Optional[dict]:
    """Reverse Container::EventMapping → intermediate onClick object."""
    event_mapping_ids = entity.get("Container::EventMapping") or []

    for em_id in event_mapping_ids:
        em = metadata.get(em_id)
        if not em or em.get("Name") != "on_click":
            continue

        em_type = em.get("Type")
        prop_ids = em.get("EventMapping::Property") or []
        if not prop_ids:
            continue

        prop = metadata.get(prop_ids[0])
        if not prop:
            continue

        if em_type == "JSAction" and prop.get("Type") == "Code":
            return {"type": "code", "code": prop.get("Value") or ""}

        if em_type == "OpenPopup" and prop.get("Type") == "Popup":
            return {"type": "openPopup", "popupId": prop.get("Value")}

    return None


def _reverse_on_load(entity: dict, metadata: dict) -> Optional[dict]:
    """Reverse Container::EventMapping → intermediate onLoad object."""
    event_mapping_ids = entity.get("Container::EventMapping") or []

    for em_id in event_mapping_ids:
        em = metadata.get(em_id)
        if not em or em.get("Name") != "on_load":
            continue

        if em.get("Type") == "JSAction":
            prop_ids = em.get("EventMapping::Property") or []
            if not prop_ids:
                continue
            prop = metadata.get(prop_ids[0])
            if prop and prop.get("Type") == "Code":
                return {"type": "code", "code": prop.get("Value") or ""}

    return None


def _apply_reversed_events(entity: dict, metadata: dict, result: dict) -> None:
    """Apply reversed visibility, onClick, and onLoad to a widget result."""
    visibility = _reverse_visibility(entity, metadata)
    if visibility:
        result["visibility"] = visibility

    on_click = _reverse_on_click(entity, metadata)
    if on_click:
        result["onClick"] = on_click

    on_load = _reverse_on_load(entity, metadata)
    if on_load:
        result["onLoad"] = on_load


def _reverse_container_style(
    container_entity: dict,
    metadata: dict,
    container_type: str,
    filter_resets: bool = False,
) -> dict:
    """Reverse style for a container."""
    style_ids = (container_entity or {}).get("Container::Style") or []
    if not style_ids:
        return {}

    style_entity = metadata.get(style_ids[0])
    if not style_entity or not style_entity.get("Value"):
        return {}

    return reverse_styles(style_entity["Value"], None, container_type, filter_resets)


def _reverse_component_style(wrapper_entity: dict, widget_type: str, metadata: dict) -> dict:
    """Reverse style for a component."""
    style_ids = wrapper_entity.get("Container::Style") or []
    if not style_ids:
        return {}

    style_entity = metadata.get(style_ids[0])
    if not style_entity or not style_entity.get("Value"):
        return {}

    return reverse_styles(style_entity["Value"], widget_type, None)
