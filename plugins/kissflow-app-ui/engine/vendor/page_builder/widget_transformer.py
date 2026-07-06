"""
Widget Transformer
Transforms intermediate format widgets/containers into flat metadata entities.
"""

import copy as _copy
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from utils.page_builder import entity_factory
from utils.page_builder.component_catalog import COMPONENT_REGISTRY
from utils.page_builder.style_mapper import transform_styles


def _copy_subtree(
    root_id: str,
    source_metadata: dict,
    target_metadata: dict,
    new_parent_id: Optional[str] = None,
    visited: Optional[Set[str]] = None,
) -> Optional[str]:
    """Copy an entity and all its descendant entities from source metadata into target metadata.
    Follows all relationship arrays (Kind::Kind keys). Entity IDs are preserved.
    """
    if visited is None:
        visited = set()
    if root_id in visited:
        return root_id
    visited.add(root_id)

    entity = source_metadata.get(root_id)
    if not entity:
        return None

    cloned = _copy.deepcopy(entity)

    # Update parent reference on the root entity only
    if new_parent_id is not None and "Container" in cloned:
        cloned["Container"] = new_parent_id

    target_metadata[root_id] = cloned

    # Recursively follow all Kind::Kind relationship arrays
    for key, value in cloned.items():
        if "::" not in key or not isinstance(value, list):
            continue
        for child_id in value:
            if isinstance(child_id, str):
                _copy_subtree(child_id, source_metadata, target_metadata, None, visited)

    return root_id


def _apply_visibility(
    visibility: dict, container_id: str, container_entity: dict, metadata: dict,
) -> None:
    """Apply conditional visibility to a container entity. Creates Criteria + Condition entities."""
    if not visibility or not visibility.get("condition"):
        return

    # "show" -> hidden by default (isHidden: True), criteria isHidden: False (show when met)
    # "hide" -> visible by default (isHidden: False), criteria isHidden: True (hide when met)
    is_show_action = visibility.get("action") == "show"
    container_entity["isHidden"] = is_show_action
    criteria_is_hidden = not is_show_action

    criteria_id, criteria_entity = entity_factory.create_criteria(criteria_is_hidden, container_id)
    metadata[criteria_id] = criteria_entity

    cond = visibility["condition"]
    condition_id, condition_entity = entity_factory.create_condition(
        {
            "lhsVariable": cond["left"]["variable"],
            "lhsType": cond["left"]["type"],
            "lhsDataType": cond["left"].get("dataType", "Text"),
            "operator": cond["operator"],
            "rhsType": cond["right"]["type"],
            "rhsVariable": cond["right"].get("variable") if cond["right"]["type"] == "PageVariable" else None,
            "rhsValue": cond["right"].get("value") if cond["right"]["type"] == "Value" else None,
        },
        criteria_id,
    )
    metadata[condition_id] = condition_entity
    criteria_entity["Criteria::Condition"].append(condition_id)

    if "Container::Criteria" not in container_entity:
        container_entity["Container::Criteria"] = []
    container_entity["Container::Criteria"].append(criteria_id)


def _substitute_popup_ids_in_code(code: str, popup_id_map: Dict[str, str]) -> str:
    """Substitute intermediate popup IDs with actual metadata entity IDs in code strings.
    Replaces `kf.app.page.openPopup("intermediateId")` with the mapped entity ID.
    """
    if not code or not popup_id_map:
        return code

    def _repl(match):
        intermediate_id = match.group(1)
        entity_id = popup_id_map.get(intermediate_id)
        return f'kf.app.page.openPopup("{entity_id}")' if entity_id else match.group(0)

    return re.sub(r'kf\.app\.page\.openPopup\s*\(\s*["\']([^"\']+)["\']\s*\)', _repl, code)


def _apply_on_click(
    on_click: dict, container_id: str, container_entity: dict, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
) -> None:
    """Apply an onClick event to a container entity. Supports 'code' and 'openPopup'."""
    if not on_click or not on_click.get("type"):
        return
    popup_id_map = popup_id_map or {}

    if on_click["type"] == "code":
        em_id, em_entity = entity_factory.create_event_mapping("on_click", container_id, "JSAction")
        metadata[em_id] = em_entity

        resolved_code = _substitute_popup_ids_in_code(on_click.get("code", ""), popup_id_map)
        cp_id, cp_entity = entity_factory.create_code_property(resolved_code, em_id)
        metadata[cp_id] = cp_entity
        em_entity["EventMapping::Property"].append(cp_id)

        if "Container::EventMapping" not in container_entity:
            container_entity["Container::EventMapping"] = []
        container_entity["Container::EventMapping"].append(em_id)

    elif on_click["type"] == "openPopup":
        popup_entity_id = popup_id_map.get(on_click.get("popupId", ""))
        if popup_entity_id:
            em_id, em_entity = entity_factory.create_event_mapping("on_click", container_id, "OpenPopup")
            metadata[em_id] = em_entity

            pp_id, pp_entity = entity_factory.create_popup_property(popup_entity_id, em_id)
            metadata[pp_id] = pp_entity
            em_entity["EventMapping::Property"].append(pp_id)

            if "Container::EventMapping" not in container_entity:
                container_entity["Container::EventMapping"] = []
            container_entity["Container::EventMapping"].append(em_id)


def _get_field_mapping_type(property_name: str) -> Optional[str]:
    """Get the FieldMapping type for icon/resource properties."""
    if property_name in ("icon", "iconUrl", "iconField"):
        return "Icon"
    if property_name == "imageSrc":
        return "Resource"
    return None


def _expand_layout(layout: str) -> str:
    """Expand layout shortcuts to flex direction."""
    if layout == "horizontal":
        return "row"
    if layout == "vertical":
        return "column"
    return layout


def _is_variable_binding(value: Any) -> bool:
    """Check if a string is any variable binding: {{item.field}}, {{variable.field}}, or {{variable}} (direct scalar)."""
    return isinstance(value, str) and bool(re.match(r"^\{\{\w+(\.\w+)?\}\}$", value))


def _is_datasource_binding(value: Any) -> bool:
    """Check if a binding is {{item.field}} (DatasourceParameter) vs PageVariable."""
    return isinstance(value, str) and bool(re.match(r"^\{\{item\.\w+\}\}$", value))


def _extract_field_path(value: str) -> Optional[str]:
    """Extract the variable path: {{item.name}} -> 'item.name', {{selectedMovie.title}} -> 'selectedMovie.title', {{userName}} -> 'userName'."""
    match = re.match(r"^\{\{(\w+(?:\.\w+)?)\}\}$", value)
    return match.group(1) if match else None


def _apply_on_load(
    on_load: dict, container_id: str, container_entity: dict, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
) -> None:
    """Apply an onLoad event to a container entity (runs when the container mounts)."""
    if not on_load or on_load.get("type") != "code":
        return
    popup_id_map = popup_id_map or {}

    em_id, em_entity = entity_factory.create_event_mapping("on_load", container_id, "JSAction")
    metadata[em_id] = em_entity

    resolved_code = _substitute_popup_ids_in_code(on_load.get("code", ""), popup_id_map)
    cp_id, cp_entity = entity_factory.create_code_property(resolved_code, em_id)
    metadata[cp_id] = cp_entity
    em_entity["EventMapping::Property"].append(cp_id)

    if "Container::EventMapping" not in container_entity:
        container_entity["Container::EventMapping"] = []
    container_entity["Container::EventMapping"].append(em_id)


def _transform_properties(
    properties: dict, container_id: str, page_id: str, metadata: dict,
) -> Tuple[List[str], List[str]]:
    """Transform component properties into FieldMapping + Property entities.
    Detects {{variable.field}} PageVariable bindings and creates VariableRef chains.
    Returns (field_mapping_ids, variable_ref_ids).
    """
    field_mapping_ids: List[str] = []
    variable_ref_ids: List[str] = []

    for prop_name, prop_value in properties.items():
        fm_type = _get_field_mapping_type(prop_name)
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, container_id, fm_type)
        metadata[fm_id] = fm_entity

        if _is_variable_binding(prop_value) and not _is_datasource_binding(prop_value):
            # PageVariable binding: {{selectedMovie.title}} etc.
            var_prop_id, var_prop_entity = entity_factory.create_variable_property(fm_id)
            metadata[var_prop_id] = var_prop_entity
            fm_entity["FieldMapping::Property"].append(var_prop_id)

            field_path = _extract_field_path(prop_value)
            var_ref_id, var_ref_entity = entity_factory.create_variable_ref(
                field_path, container_id, page_id, var_prop_id, "PageVariable"
            )
            metadata[var_ref_id] = var_ref_entity
            var_prop_entity["Property::VariableRef"].append(var_ref_id)
            variable_ref_ids.append(var_ref_id)
        else:
            prop_id, prop_entity = entity_factory.create_property(prop_value, fm_id)
            metadata[prop_id] = prop_entity
            fm_entity["FieldMapping::Property"].append(prop_id)

        field_mapping_ids.append(fm_id)

    return field_mapping_ids, variable_ref_ids


def _transform_repeater_template_properties(
    properties: dict,
    container_id: str,
    page_id: str,
    metadata: dict,
) -> Tuple[List[str], List[str]]:
    """Transform properties inside a repeater template with variable binding support."""
    field_mapping_ids = []
    variable_ref_ids = []

    for prop_name, prop_value in properties.items():
        fm_type = _get_field_mapping_type(prop_name)
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, container_id, fm_type)
        metadata[fm_id] = fm_entity

        if _is_variable_binding(prop_value):
            var_prop_id, var_prop_entity = entity_factory.create_variable_property(fm_id)
            metadata[var_prop_id] = var_prop_entity
            fm_entity["FieldMapping::Property"].append(var_prop_id)

            field_path = _extract_field_path(prop_value)
            ref_type = "DatasourceParameter" if _is_datasource_binding(prop_value) else "PageVariable"
            var_ref_id, var_ref_entity = entity_factory.create_variable_ref(
                field_path, container_id, page_id, var_prop_id, ref_type
            )
            metadata[var_ref_id] = var_ref_entity
            var_prop_entity["Property::VariableRef"].append(var_ref_id)
            variable_ref_ids.append(var_ref_id)
        else:
            prop_id, prop_entity = entity_factory.create_property(prop_value, fm_id)
            metadata[prop_id] = prop_entity
            fm_entity["FieldMapping::Property"].append(prop_id)

        field_mapping_ids.append(fm_id)

    return field_mapping_ids, variable_ref_ids


def _get_merged_properties(widget_type: str, user_properties: Optional[dict]) -> dict:
    """Merge defaults with user properties."""
    registry = COMPONENT_REGISTRY.get(widget_type)
    defaults = {}
    if registry and registry.get("properties"):
        for key, defn in registry["properties"].items():
            if defn.get("default") not in (None, ""):
                defaults[key] = defn["default"]
    return {**defaults, **(user_properties or {})}


def transform_component(
    widget: dict, parent_container_id: str, page_id: str, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
) -> str:
    """Transform a component widget into metadata entities. Returns wrapper container ID."""
    widget_type = widget["type"]

    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", widget_type), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    comp_id, comp_entity = entity_factory.create_component(widget_type, wrapper_id, page_id)
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    # 3. Merge defaults with user properties + top-level props (AI sometimes puts them at widget root)
    registry = COMPONENT_REGISTRY.get(widget_type)
    all_properties = _get_merged_properties(widget_type, widget.get("properties"))
    if registry and registry.get("properties"):
        for key in registry["properties"]:
            # Skip 'type' — widget["type"] is always the component type, not a property value
            if key == "type":
                continue
            if widget.get(key) is not None and key not in (widget.get("properties") or {}):
                all_properties[key] = widget[key]

    if all_properties:
        fm_ids, var_ref_ids = _transform_properties(all_properties, wrapper_id, page_id, metadata)
        wrapper_entity["Container::FieldMapping"] = fm_ids
        if var_ref_ids:
            wrapper_entity["Container::VariableRef"] = var_ref_ids

    if widget.get("style"):
        style_context = {}
        if widget_type == "Button":
            style_context["buttonSize"] = all_properties.get("size", "base")
            style_context["buttonType"] = all_properties.get("type", "primary")
        if widget_type == "ProgressBar":
            pb_chart_type = all_properties.get("chartType") or widget.get("chartType") or "linear"
            style_context["progressBarChartType"] = pb_chart_type
            # Linear: auto-size height based on bar thickness + text
            if pb_chart_type == "linear":
                widget["style"]["height"] = "auto"
            # Circular/Semicircular: hide label and help text to avoid height issues
            if pb_chart_type in ("circular", "semicircular"):
                widget["style"]["labelFontSize"] = "0px"
                widget["style"]["helpTextFontSize"] = "0px"
        transformed_style = transform_styles(widget["style"], widget_type, None, style_context)
        style_id, style_entity = entity_factory.create_style(transformed_style, wrapper_id)
        metadata[style_id] = style_entity
        wrapper_entity["Container::Style"].append(style_id)

    # 5. Handle openPopup shorthand on buttons (backwards compat)
    popup_id_map = popup_id_map or {}
    if widget.get("openPopup") and popup_id_map.get(widget["openPopup"]):
        popup_entity_id = popup_id_map[widget["openPopup"]]
        em_id, em_entity = entity_factory.create_event_mapping("on_click", wrapper_id, "OpenPopup")
        metadata[em_id] = em_entity

        pp_id, pp_entity = entity_factory.create_popup_property(popup_entity_id, em_id)
        metadata[pp_id] = pp_entity

        em_entity["EventMapping::Property"].append(pp_id)
        if "Container::EventMapping" not in wrapper_entity:
            wrapper_entity["Container::EventMapping"] = []
        wrapper_entity["Container::EventMapping"].append(em_id)

    # 6. Extensible onClick event (takes priority over openPopup shorthand if both present)
    if widget.get("onClick") and not widget.get("openPopup"):
        _apply_on_click(widget["onClick"], wrapper_id, wrapper_entity, metadata, popup_id_map)

    # 7. onLoad event
    if widget.get("onLoad"):
        _apply_on_load(widget["onLoad"], wrapper_id, wrapper_entity, metadata, popup_id_map)

    # 8. Conditional visibility
    if widget.get("visibility"):
        _apply_visibility(widget["visibility"], wrapper_id, wrapper_entity, metadata)

    return wrapper_id


def transform_container(
    container: dict,
    parent_container_id: str,
    page_id: str,
    metadata: dict,
    container_type: str = "Container",
    popup_id_map: Optional[Dict[str, str]] = None,
    input_metadata: Optional[dict] = None,
) -> str:
    """Transform a container into metadata entities. Returns container ID."""
    cont_id, cont_entity = entity_factory.create_container(
        container_type, container.get("name", "Container"), parent_container_id
    )
    metadata[cont_id] = cont_entity

    style_obj = dict(container.get("style") or {})
    if container.get("layout") and isinstance(container["layout"], str):
        style_obj["flexDirection"] = _expand_layout(container["layout"])
    if "flexWrap" not in style_obj:
        style_obj["flexWrap"] = "nowrap"
    style_obj.pop("flex", None)

    if style_obj:
        transformed_style = transform_styles(style_obj, None, container_type)
        style_id, style_entity = entity_factory.create_style(transformed_style, cont_id)
        metadata[style_id] = style_entity
        cont_entity["Container::Style"].append(style_id)

    for child in container.get("children") or []:
        child_id = transform_widget(child, cont_id, page_id, metadata, popup_id_map, input_metadata)
        cont_entity["Container::Container"].append(child_id)

    # onClick event
    if container.get("onClick"):
        _apply_on_click(container["onClick"], cont_id, cont_entity, metadata, popup_id_map)

    # onLoad event
    if container.get("onLoad"):
        _apply_on_load(container["onLoad"], cont_id, cont_entity, metadata, popup_id_map)

    # Conditional visibility
    if container.get("visibility"):
        _apply_visibility(container["visibility"], cont_id, cont_entity, metadata)

    return cont_id


def _transform_template_component(
    widget: dict, parent_container_id: str, page_id: str, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
    input_metadata: Optional[dict] = None,
) -> str:
    """Transform a component inside a repeater template."""
    widget_type = widget["type"]

    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", widget_type), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    comp_id, comp_entity = entity_factory.create_component(widget_type, wrapper_id, page_id)
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    all_properties = _get_merged_properties(widget_type, widget.get("properties"))
    if all_properties:
        fm_ids, var_ref_ids = _transform_repeater_template_properties(all_properties, wrapper_id, page_id, metadata)
        wrapper_entity["Container::FieldMapping"] = fm_ids
        if var_ref_ids:
            wrapper_entity["Container::VariableRef"] = var_ref_ids

    if widget.get("style"):
        style_context = {}
        if widget_type == "Button":
            style_context["buttonSize"] = all_properties.get("size", "base")
            style_context["buttonType"] = all_properties.get("type", "primary")
        transformed_style = transform_styles(widget["style"], widget_type, None, style_context)
        style_id, style_entity = entity_factory.create_style(transformed_style, wrapper_id)
        metadata[style_id] = style_entity
        wrapper_entity["Container::Style"].append(style_id)

    # onClick event
    if widget.get("onClick"):
        _apply_on_click(widget["onClick"], wrapper_id, wrapper_entity, metadata, popup_id_map)

    # onLoad event
    if widget.get("onLoad"):
        _apply_on_load(widget["onLoad"], wrapper_id, wrapper_entity, metadata, popup_id_map)

    # Conditional visibility
    if widget.get("visibility"):
        _apply_visibility(widget["visibility"], wrapper_id, wrapper_entity, metadata)

    return wrapper_id


def _transform_template_container(
    container: dict, parent_container_id: str, page_id: str, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
    input_metadata: Optional[dict] = None,
) -> str:
    """Transform a container inside a repeater template."""
    cont_id, cont_entity = entity_factory.create_container(
        "Container", container.get("name", "Container"), parent_container_id
    )
    metadata[cont_id] = cont_entity

    style_obj = dict(container.get("style") or {})
    if container.get("layout") and isinstance(container["layout"], str):
        style_obj["flexDirection"] = _expand_layout(container["layout"])
    if "flexWrap" not in style_obj:
        style_obj["flexWrap"] = "nowrap"
    style_obj.pop("flex", None)

    if style_obj:
        transformed_style = transform_styles(style_obj, None, "Container")
        style_id, style_entity = entity_factory.create_style(transformed_style, cont_id)
        metadata[style_id] = style_entity
        cont_entity["Container::Style"].append(style_id)

    for child in container.get("children") or []:
        child_id = _transform_template_widget(child, cont_id, page_id, metadata, popup_id_map, input_metadata)
        cont_entity["Container::Container"].append(child_id)

    # onClick event
    if container.get("onClick"):
        _apply_on_click(container["onClick"], cont_id, cont_entity, metadata, popup_id_map)

    # onLoad event
    if container.get("onLoad"):
        _apply_on_load(container["onLoad"], cont_id, cont_entity, metadata, popup_id_map)

    # Conditional visibility
    if container.get("visibility"):
        _apply_visibility(container["visibility"], cont_id, cont_entity, metadata)

    return cont_id


def _transform_template_widget(
    widget: dict, parent_container_id: str, page_id: str, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
    input_metadata: Optional[dict] = None,
) -> str:
    """Transform a widget inside a repeater template (handles variable bindings)."""
    # Raw passthrough: copy original entity subtree from input metadata
    if widget and widget.get("_raw") and widget.get("_entityId") and input_metadata:
        copied = _copy_subtree(widget["_entityId"], input_metadata, metadata, parent_container_id)
        if copied:
            return copied

    if widget["type"] == "Container":
        return _transform_template_container(widget, parent_container_id, page_id, metadata, popup_id_map, input_metadata)
    return _transform_template_component(widget, parent_container_id, page_id, metadata, popup_id_map, input_metadata)


def transform_repeater(
    widget: dict, parent_container_id: str, page_id: str, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
    input_metadata: Optional[dict] = None,
) -> str:
    """Transform a Repeater widget. Returns wrapper container ID."""
    # 1. Create Component wrapper Container
    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", "Repeater"), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    # 2. Determine source type
    is_dataform = bool(widget.get("dataform"))
    is_process = bool(widget.get("process"))
    selected_fields = widget.get("fields", [])

    # 3. Create Repeater Component
    comp_id, comp_entity = entity_factory.create_component("Repeater", wrapper_id, page_id)
    comp_entity["Type"] = "Repeater"

    if is_dataform:
        comp_entity["Data"] = {
            "manifest_id": "Repeater",
            "category": "general",
            "visualization_type": "repeater",
            "flow_type": "Form",
            "flow_id": widget["dataform"]["formId"],
            "view_id": widget["dataform"].get("viewId", "allitems"),
            "view_type": widget["dataform"].get("viewType", "Table"),
            "selectedFields": selected_fields,
        }
    elif is_process:
        view_id = widget["process"].get("viewId", "admin")
        process_data: Dict[str, Any] = {
            "manifest_id": "Repeater",
            "category": "general",
            "visualization_type": "repeater",
            "flow_type": "Process",
            "flow_id": widget["process"]["processId"],
            "view_id": view_id,
            "view_type": "table",
            "selectedFields": selected_fields,
        }
        # mytasks/myitems have additional fields
        if view_id == "mytasks":
            process_data["status"] = ""
            process_data["activity_id"] = "all"
            process_data["variable_id"] = ""
            process_data["variable_type"] = ""
        elif view_id == "myitems":
            process_data["status"] = "all"
            process_data["activity_id"] = ""
            process_data["variable_id"] = ""
            process_data["variable_type"] = ""
        comp_entity["Data"] = process_data
    else:
        comp_entity["Data"] = {
            "manifest_id": "Repeater",
            "category": "general",
            "visualization_type": "repeater",
            "flow_type": "Variable",
            "variable_id": widget.get("variable", ""),
            "variable_type": "page",
            "selectedFields": selected_fields,
        }
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    # 4. Create FieldMappings for repeater config
    repeater_props: Dict[str, Any] = {"caption": ""}
    if is_dataform:
        repeater_props.update(
            {
                "flow_type": "Form",
                "flow_id": widget["dataform"]["formId"],
                "view_id": widget["dataform"].get("viewId", "allitems"),
                "view_type": widget["dataform"].get("viewType", "Table"),
                "variable_id": "",
                "variable_type": "",
            }
        )
    elif is_process:
        view_id = widget["process"].get("viewId", "admin")
        repeater_props.update(
            {
                "flow_type": "Process",
                "flow_id": widget["process"]["processId"],
                "view_id": view_id,
                "view_type": "table",
                "variable_id": "",
                "variable_type": "",
            }
        )
        # mytasks needs activity_id: "all", myitems needs status: "all"
        if view_id == "mytasks":
            repeater_props["status"] = ""
            repeater_props["activity_id"] = "all"
        elif view_id == "myitems":
            repeater_props["status"] = "all"
            repeater_props["activity_id"] = ""
    else:
        repeater_props.update(
            {
                "flow_type": "Variable",
                "variable_id": widget.get("variable", ""),
                "variable_type": "page",
            }
        )

    field_mapping_ids = []
    for prop_name, prop_value in repeater_props.items():
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, wrapper_id)
        metadata[fm_id] = fm_entity
        prop_id, prop_entity = entity_factory.create_property(prop_value, fm_id)
        metadata[prop_id] = prop_entity
        fm_entity["FieldMapping::Property"].append(prop_id)
        field_mapping_ids.append(fm_id)

    # Empty FieldMappings that Kissflow expects (skip if already set in repeater_props)
    for empty_prop in ["filterParameters", "status", "activity_id"]:
        if empty_prop in repeater_props:
            continue
        fm_type = "Object" if empty_prop == "filterParameters" else None
        fm_id, fm_entity = entity_factory.create_field_mapping(empty_prop, wrapper_id, fm_type)
        metadata[fm_id] = fm_entity
        prop_id, prop_entity = entity_factory.create_property(None, fm_id)
        if empty_prop == "filterParameters":
            prop_entity["Type"] = "FilterParam"
        metadata[prop_id] = prop_entity
        fm_entity["FieldMapping::Property"].append(prop_id)
        field_mapping_ids.append(fm_id)

    # selectedFields as Array type
    sf_fm_id, sf_fm_entity = entity_factory.create_field_mapping("selectedFields", wrapper_id, "Array")
    metadata[sf_fm_id] = sf_fm_entity
    sf_prop_id, sf_prop_entity = entity_factory.create_property(selected_fields, sf_fm_id)
    sf_prop_entity["Type"] = "Array"
    metadata[sf_prop_id] = sf_prop_entity
    sf_fm_entity["FieldMapping::Property"].append(sf_prop_id)
    field_mapping_ids.append(sf_fm_id)

    wrapper_entity["Container::FieldMapping"] = field_mapping_ids

    # Style on wrapper — resets + viewport sizing (widget.style) + layout arrangement
    repeater_layout = widget.get("repeaterLayout", "vertical")
    wrapper_style_value: Dict[str, Any] = {
        "Repeater.Padding.Top": {"value": "0px"},
        "Repeater.Padding.Right": {"value": "0px"},
        "Repeater.Padding.Bottom": {"value": "0px"},
        "Repeater.Padding.Left": {"value": "0px"},
        "Repeater.Border.Top.Width": {"value": "0px"},
        "Repeater.Border.Right.Width": {"value": "0px"},
        "Repeater.Border.Bottom.Width": {"value": "0px"},
        "Repeater.Border.Left.Width": {"value": "0px"},
    }

    # Layout-specific arrangement styles
    if repeater_layout in ("horizontal", "grid"):
        wrapper_style_value["Repeater.Arrangement.Direction"] = {"value": "horizontal"}
    if repeater_layout == "grid":
        wrapper_style_value["Repeater.Arrangement.Display"] = {"value": "grid"}
        wrapper_style_value["Repeater.Arrangement.Columns"] = {"value": str(widget.get("gridColumns", 4))}

    # widget.style -> Repeater.* viewport keys on the wrapper
    if widget.get("style"):
        viewport_map = {
            "width": "Repeater.Width",
            "height": "Repeater.Height",
            "rowGap": "Repeater.Row.Gap",
            "columnGap": "Repeater.Column.Gap",
        }
        for friendly, full_key in viewport_map.items():
            if widget["style"].get(friendly) is not None:
                wrapper_style_value[full_key] = {"value": widget["style"][friendly]}
        if widget["style"].get("gap") is not None:
            wrapper_style_value["Repeater.Row.Gap"] = {"value": widget["style"]["gap"]}
            wrapper_style_value["Repeater.Column.Gap"] = {"value": widget["style"]["gap"]}

    ws_id, ws_entity = entity_factory.create_style(wrapper_style_value, wrapper_id)
    metadata[ws_id] = ws_entity
    wrapper_entity["Container::Style"].append(ws_id)

    # 5. Create Repeater entity
    rep_id, rep_entity = entity_factory.create_repeater(comp_id)
    metadata[rep_id] = rep_entity
    comp_entity["Component::Repeater"] = [rep_id]

    # 6. Create Repeater Container (template)
    rc_id, rc_entity = entity_factory.create_container("Repeater", "Repeater Container")
    rc_entity["Repeater"] = rep_id
    metadata[rc_id] = rc_entity
    rep_entity["Repeater::Container"].append(rc_id)

    # 7. Style on the repeater container — resets + layout defaults + widget.templateStyle
    rc_resets: Dict[str, Any] = {
        "Repeater.Container.Padding.Top": {"value": "0px"},
        "Repeater.Container.Padding.Right": {"value": "0px"},
        "Repeater.Container.Padding.Bottom": {"value": "0px"},
        "Repeater.Container.Padding.Left": {"value": "0px"},
        "Repeater.Container.Border.Top.Width": {"value": "0px"},
        "Repeater.Container.Border.Right.Width": {"value": "0px"},
        "Repeater.Container.Border.Bottom.Width": {"value": "0px"},
        "Repeater.Container.Border.Left.Width": {"value": "0px"},
        "Repeater.Container.Min.Height": {"value": "10px"},
    }

    # Layout-specific repeater container sizing defaults
    if repeater_layout == "horizontal":
        rc_resets.update({
            "Repeater.Container.Width": {"value": "auto"},
            "Repeater.Container.Min.Width": {"value": "100px"},
            "Repeater.Container.Max.Width": {"value": "unset"},
            "Repeater.Container.Height": {"value": "100%"},
            "Repeater.Container.Min.Height": {"value": "0px"},
            "Repeater.Container.Max.Height": {"value": "unset"},
        })
    elif repeater_layout == "grid":
        rc_resets.update({
            "Repeater.Container.Width": {"value": "0px"},
            "Repeater.Container.Min.Width": {"value": "100%"},
            "Repeater.Container.Max.Width": {"value": "unset"},
            "Repeater.Container.Height": {"value": "200px"},
            "Repeater.Container.Min.Height": {"value": "50px"},
            "Repeater.Container.Max.Height": {"value": "unset"},
        })

    # widget.templateStyle -> Repeater.Container.* keys (each repeated item)
    # Strip locked dimensions that can't be overridden per layout
    template_style_input = dict(widget.get("templateStyle") or {})
    if repeater_layout == "vertical":
        for k in ("width", "minWidth", "maxWidth"):
            template_style_input.pop(k, None)
    elif repeater_layout == "horizontal":
        for k in ("height", "minHeight", "maxHeight"):
            template_style_input.pop(k, None)
    elif repeater_layout == "grid":
        for k in ("width", "minWidth", "maxWidth"):
            template_style_input.pop(k, None)

    user_template_style = transform_styles(template_style_input, None, "Repeater") if template_style_input else {}
    merged_style = {**rc_resets, **user_template_style}
    rcs_id, rcs_entity = entity_factory.create_style(merged_style, rc_id)
    metadata[rcs_id] = rcs_entity
    rc_entity["Container::Style"].append(rcs_id)

    # 8. Transform template children
    template_child_ids = []
    for child in widget.get("template") or []:
        child_id = _transform_template_widget(child, rc_id, page_id, metadata, popup_id_map, input_metadata)
        rc_entity["Container::Container"].append(child_id)
        template_child_ids.append(child_id)

    # 9. Auto-add onClick event to first template row for dataform repeaters
    if is_dataform and template_child_ids:
        row_container_id = template_child_ids[0]
        row_container = metadata.get(row_container_id)
        if row_container:
            form_id = widget["dataform"]["formId"]
            js_code = (
                f"const DATAFORM_ID = '{form_id}';\n"
                "const ITEM_ID = kf.eventParameters.item._id;\n"
                "\n"
                "const dataform = kf.app.getDataform(DATAFORM_ID);\n"
                "\n"
                "dataform.openForm({\n"
                "  _id: ITEM_ID\n"
                "})\n"
            )

            em_id, em_entity = entity_factory.create_event_mapping("on_click", row_container_id)
            metadata[em_id] = em_entity

            cp_id, cp_entity = entity_factory.create_code_property(js_code, em_id)
            metadata[cp_id] = cp_entity

            em_entity["EventMapping::Property"].append(cp_id)
            if "Container::EventMapping" not in row_container:
                row_container["Container::EventMapping"] = []
            row_container["Container::EventMapping"].append(em_id)

    return wrapper_id


def transform_chart_report(widget: dict, parent_container_id: str, page_id: str, metadata: dict) -> str:
    """Transform a ChartReport widget. Returns wrapper container ID."""
    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", "Chart"), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    flow_type = "Process" if widget["report"].get("processId") else "Form"
    flow_id = widget["report"].get("processId") or widget["report"].get("formId")

    comp_id, comp_entity = entity_factory.create_component("ChartReport", wrapper_id, page_id)
    comp_entity["Data"] = {
        "manifest_id": "ChartReport",
        "category": "report",
        "report_type": "ChartReport",
        "visualization_type": "chart",
        "flow_type": flow_type,
        "flow_id": flow_id,
        "report_id": widget["report"].get("reportId", ""),
    }
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    field_mapping_ids = []
    props: Dict[str, Any] = {
        "flow_type": flow_type,
        "flow_id": flow_id,
        "report_id": widget["report"].get("reportId", ""),
        "showHeader": False,
    }

    for prop_name, prop_value in props.items():
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, wrapper_id)
        metadata[fm_id] = fm_entity
        prop_id, prop_entity = entity_factory.create_property(prop_value, fm_id)
        metadata[prop_id] = prop_entity
        fm_entity["FieldMapping::Property"].append(prop_id)
        field_mapping_ids.append(fm_id)

    # filterParameters
    filter_fm_id, filter_fm_entity = entity_factory.create_field_mapping("filterParameters", wrapper_id, "Object")
    metadata[filter_fm_id] = filter_fm_entity
    filter_prop_id, filter_prop_entity = entity_factory.create_property(None, filter_fm_id)
    filter_prop_entity["Type"] = "FilterParam"
    metadata[filter_prop_id] = filter_prop_entity
    filter_fm_entity["FieldMapping::Property"].append(filter_prop_id)
    field_mapping_ids.append(filter_fm_id)

    wrapper_entity["Container::FieldMapping"] = field_mapping_ids

    user_style = transform_styles(widget.get("style") or {}, "ChartReport", None) if widget.get("style") else {}
    style_id, style_entity = entity_factory.create_style(user_style, wrapper_id)
    metadata[style_id] = style_entity
    wrapper_entity["Container::Style"].append(style_id)

    return wrapper_id


def transform_process_table(widget: dict, parent_container_id: str, page_id: str, metadata: dict) -> str:
    """Transform a ProcessTable widget (Kissflow system view). Returns wrapper container ID."""
    # 1. Wrapper container
    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", "Table"), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    # 2. Table Component
    comp_id, comp_entity = entity_factory.create_component("ProcessTable", wrapper_id, page_id)
    comp_entity["Data"] = {
        "manifest_id": "Table",
        "category": "view",
        "visualization_type": "table",
        "flow_type": "Process",
        "flow_id": widget["process"]["processId"],
        "view_id": widget["process"].get("viewId", "mytasks"),
    }
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    # 3. FieldMappings
    field_mapping_ids: List[str] = []
    props: Dict[str, Any] = {
        "flow_type": "Process",
        "flow_id": widget["process"]["processId"],
        "view_id": widget["process"].get("viewId", "mytasks"),
        "showform": widget.get("properties", {}).get("showform", True),
        "steps": "all",
    }

    # Optional properties
    widget_props = widget.get("properties") or {}
    if widget_props.get("newItem"):
        props["newItem"] = True
    if widget_props.get("caption"):
        props["caption"] = widget_props["caption"]
    if widget_props.get("status"):
        props["status"] = widget_props["status"]

    for prop_name, prop_value in props.items():
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, wrapper_id)
        metadata[fm_id] = fm_entity
        prop_id, prop_entity = entity_factory.create_property(prop_value, fm_id)
        metadata[prop_id] = prop_entity
        fm_entity["FieldMapping::Property"].append(prop_id)
        field_mapping_ids.append(fm_id)

    wrapper_entity["Container::FieldMapping"] = field_mapping_ids

    # 4. Style
    user_style = transform_styles(widget.get("style") or {}, "ProcessTable", None) if widget.get("style") else {}
    style_id, style_entity = entity_factory.create_style(user_style, wrapper_id)
    metadata[style_id] = style_entity
    wrapper_entity["Container::Style"].append(style_id)

    return wrapper_id


def transform_dataform_table(widget: dict, parent_container_id: str, page_id: str, metadata: dict) -> str:
    """Transform a DataformTable widget (Kissflow system table view for dataforms). Returns wrapper container ID."""
    # 1. Wrapper container
    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", "Table"), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    # 2. Table Component
    comp_id, comp_entity = entity_factory.create_component("DataformTable", wrapper_id, page_id)
    comp_entity["Data"] = {
        "manifest_id": "Table",
        "category": "view",
        "visualization_type": "table",
        "flow_type": "Form",
        "flow_id": widget["dataform"]["formId"],
        "view_id": widget["dataform"].get("viewId", "allitems"),
    }
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    # 3. FieldMappings
    field_mapping_ids: List[str] = []
    props: Dict[str, Any] = {
        "flow_type": "Form",
        "flow_id": widget["dataform"]["formId"],
        "view_id": widget["dataform"].get("viewId", "allitems"),
        "showform": widget.get("properties", {}).get("showform", True),
    }

    widget_props = widget.get("properties") or {}
    if widget_props.get("newItem"):
        props["newItem"] = True
    if widget_props.get("caption"):
        props["caption"] = widget_props["caption"]
    if widget_props.get("import"):
        props["import"] = True
    if widget_props.get("export"):
        props["export"] = True

    for prop_name, prop_value in props.items():
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, wrapper_id)
        metadata[fm_id] = fm_entity
        prop_id, prop_entity = entity_factory.create_property(prop_value, fm_id)
        metadata[prop_id] = prop_entity
        fm_entity["FieldMapping::Property"].append(prop_id)
        field_mapping_ids.append(fm_id)

    wrapper_entity["Container::FieldMapping"] = field_mapping_ids

    # 4. Style
    user_style = transform_styles(widget.get("style") or {}, "DataformTable", None) if widget.get("style") else {}
    style_id, style_entity = entity_factory.create_style(user_style, wrapper_id)
    metadata[style_id] = style_entity
    wrapper_entity["Container::Style"].append(style_id)

    return wrapper_id


def transform_form_view(widget: dict, parent_container_id: str, page_id: str, metadata: dict) -> str:
    """Transform a FormView widget (embeds a Kissflow form for data entry). Returns wrapper container ID."""
    # 1. Wrapper container
    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", "Form"), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    # 2. Determine flow type
    is_process = bool(widget.get("process"))
    flow_type = "Process" if is_process else "Form"
    flow_id = widget["process"]["processId"] if is_process else widget.get("dataform", {}).get("formId")

    # 3. Form Component
    comp_id, comp_entity = entity_factory.create_component("FormView", wrapper_id, page_id)
    comp_entity["Data"] = {
        "manifest_id": "Form",
        "category": "view",
        "visualization_type": "form",
        "flow_type": flow_type,
        "flow_id": flow_id,
    }
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    # 4. FieldMappings
    field_mapping_ids: List[str] = []
    props: Dict[str, Any] = {
        "flow_type": flow_type,
        "flow_id": flow_id,
    }

    # Empty FieldMappings that Kissflow expects
    empty_props = ["view_id", "instance_id", "activity_instance_id"]

    for prop_name, prop_value in props.items():
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, wrapper_id)
        metadata[fm_id] = fm_entity
        prop_id, prop_entity = entity_factory.create_property(prop_value, fm_id)
        metadata[prop_id] = prop_entity
        fm_entity["FieldMapping::Property"].append(prop_id)
        field_mapping_ids.append(fm_id)

    for prop_name in empty_props:
        fm_id, fm_entity = entity_factory.create_field_mapping(prop_name, wrapper_id)
        metadata[fm_id] = fm_entity
        prop_id, prop_entity = entity_factory.create_property(None, fm_id)
        metadata[prop_id] = prop_entity
        fm_entity["FieldMapping::Property"].append(prop_id)
        field_mapping_ids.append(fm_id)

    wrapper_entity["Container::FieldMapping"] = field_mapping_ids

    # 5. Empty style (Kissflow needs it)
    style_id, style_entity = entity_factory.create_style({}, wrapper_id)
    metadata[style_id] = style_entity
    wrapper_entity["Container::Style"].append(style_id)

    return wrapper_id


def transform_tab(
    widget: dict, parent_container_id: str, page_id: str, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
    input_metadata: Optional[dict] = None,
) -> str:
    """Transform a Tab widget with multiple tabs. Returns wrapper container ID."""
    # 1. Wrapper container
    wrapper_id, wrapper_entity = entity_factory.create_container(
        "Component", widget.get("name", "Tab"), parent_container_id
    )
    metadata[wrapper_id] = wrapper_entity

    # 2. Tab Component
    comp_id, comp_entity = entity_factory.create_component("Tab", wrapper_id, page_id)
    comp_entity["Type"] = "Tab"
    metadata[comp_id] = comp_entity
    wrapper_entity["Container::Component"].append(comp_id)

    # 3. FieldMapping: tabType
    fm_id, fm_entity = entity_factory.create_field_mapping("tabType", wrapper_id)
    metadata[fm_id] = fm_entity
    prop_id, prop_entity = entity_factory.create_property("TYPE1", fm_id)
    metadata[prop_id] = prop_entity
    fm_entity["FieldMapping::Property"].append(prop_id)
    wrapper_entity["Container::FieldMapping"] = [fm_id]

    # 4. Empty style on wrapper (Kissflow needs it)
    ws_id, ws_entity = entity_factory.create_style({}, wrapper_id)
    metadata[ws_id] = ws_entity
    wrapper_entity["Container::Style"].append(ws_id)

    # 5. Create Tabs entity
    tabs_id, tabs_entity = entity_factory.create_tabs(comp_id)
    metadata[tabs_id] = tabs_entity
    comp_entity["Component::Tabs"] = [tabs_id]

    # 6. Create each Tab
    for i, tab_data in enumerate(widget.get("tabs") or []):
        # Create Tab entity
        tab_id, tab_entity = entity_factory.create_tab(tab_data["name"], tabs_id)
        metadata[tab_id] = tab_entity
        tabs_entity["Tabs::Tab"].append(tab_id)

        # Set first tab as default
        if i == 0:
            tabs_entity["DefaultTab"] = tab_id

        # Create Tab Container (Type: "Tab")
        tc_id, tc_entity = entity_factory.create_container("Tab", "Tab Container")
        tc_entity["Tab"] = tab_id
        metadata[tc_id] = tc_entity
        tab_entity["Tab::Container"].append(tc_id)

        # Empty style on tab container
        ts_id, ts_entity = entity_factory.create_style({}, tc_id)
        metadata[ts_id] = ts_entity
        tc_entity["Container::Style"] = [ts_id]

        # Transform tab children
        for child in tab_data.get("children") or []:
            child_id = transform_widget(child, tc_id, page_id, metadata, popup_id_map, input_metadata)
            if "Container::Container" not in tc_entity:
                tc_entity["Container::Container"] = []
            tc_entity["Container::Container"].append(child_id)

    return wrapper_id


def transform_widget(
    widget: dict, parent_container_id: str, page_id: str, metadata: dict,
    popup_id_map: Optional[Dict[str, str]] = None,
    input_metadata: Optional[dict] = None,
) -> str:
    """Transform any widget. Returns entity ID."""
    # Raw passthrough: copy the original entity subtree from input_metadata unchanged
    if widget and widget.get("_raw") and widget.get("_entityId") and input_metadata:
        copied = _copy_subtree(widget["_entityId"], input_metadata, metadata, parent_container_id)
        if copied:
            return copied
        # If not found, fall through to creating a stub Container

    widget_type = widget.get("type", "")
    if widget_type == "Container":
        return transform_container(widget, parent_container_id, page_id, metadata, "Container", popup_id_map, input_metadata)
    if widget_type == "Repeater":
        return transform_repeater(widget, parent_container_id, page_id, metadata, popup_id_map, input_metadata)
    if widget_type == "ChartReport":
        return transform_chart_report(widget, parent_container_id, page_id, metadata)
    if widget_type == "ProcessTable":
        return transform_process_table(widget, parent_container_id, page_id, metadata)
    if widget_type == "DataformTable":
        return transform_dataform_table(widget, parent_container_id, page_id, metadata)
    if widget_type == "Tab":
        return transform_tab(widget, parent_container_id, page_id, metadata, popup_id_map, input_metadata)
    if widget_type == "FormView":
        return transform_form_view(widget, parent_container_id, page_id, metadata)
    return transform_component(widget, parent_container_id, page_id, metadata, popup_id_map)
