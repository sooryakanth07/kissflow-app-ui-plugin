"""
Entity Factory
Creates metadata entities for all Kissflow page entity types.
"""

from typing import Any, Dict, List, Optional, Tuple

from utils.page_builder import id_generator as id_gen
from utils.page_builder.component_catalog import COMPONENT_REGISTRY


def create_page(page_data: dict, application_id: str) -> Tuple[str, dict]:
    """Create a Page entity. Returns (page_id, entity)."""
    page_id = id_gen.generate_page_id(page_data.get("name", "Page"))
    entity = {
        "Id": page_id,
        "Kind": "Page",
        "Name": page_data.get("name", ""),
        "Description": page_data.get("description", ""),
        "FlowType": "Page",
        "Settings": page_data.get("settings", {}),
        "Page::Container": [],
        "Page::Component": [],
        "_application_id": application_id,
    }
    return page_id, entity


def create_container(
    container_type: str,
    name: str,
    parent_id: Optional[str] = None,
    layout_config: Optional[dict] = None,
) -> Tuple[str, dict]:
    """Create a Container entity. Returns (container_id, entity)."""
    is_body = container_type == "Body"
    container_id = id_gen.generate_container_id(is_body)

    entity: Dict[str, Any] = {
        "Id": container_id,
        "Kind": "Container",
        "Type": container_type,
        "Name": name,
    }

    if parent_id:
        entity["Container"] = parent_id

    if layout_config:
        entity["LayoutConfig"] = layout_config

    if container_type == "Container":
        entity["LayoutType"] = "flex"

    entity["Container::Container"] = []
    entity["Container::Component"] = []
    entity["Container::FieldMapping"] = []
    entity["Container::Style"] = []
    entity["Container::EventMapping"] = []

    return container_id, entity


def create_component(widget_type: str, container_id: str, page_id: str) -> Tuple[str, dict]:
    """Create a Component entity. Returns (component_id, entity)."""
    component_id = id_gen.generate_component_id()
    registry = COMPONENT_REGISTRY.get(widget_type)

    if not registry:
        raise ValueError(f'Unknown widget type: "{widget_type}"')

    entity = {
        "Id": component_id,
        "Kind": "Component",
        "Script": {"web": registry["script_path"]},
        "Name": widget_type,
        "Data": {
            "manifest_id": widget_type,
            "category": registry["category"],
            "visualization_type": registry["visualization_type"],
        },
        "Container": container_id,
        "Page": page_id,
    }
    return component_id, entity


def create_field_mapping(
    property_name: str,
    container_id: str,
    field_mapping_type: Optional[str] = None,
) -> Tuple[str, dict]:
    """Create a FieldMapping entity. Returns (field_mapping_id, entity)."""
    field_mapping_id = id_gen.generate_field_mapping_id()

    entity: Dict[str, Any] = {
        "Id": field_mapping_id,
        "Kind": "FieldMapping",
        "Name": property_name,
        "Container": container_id,
        "FieldMapping::Property": [],
    }

    if field_mapping_type:
        entity["Type"] = field_mapping_type

    return field_mapping_id, entity


def create_property(value: Any, field_mapping_id: str) -> Tuple[str, dict]:
    """Create a Property entity. Returns (property_id, entity)."""
    property_id = id_gen.generate_property_id()

    entity: Dict[str, Any] = {
        "Id": property_id,
        "Kind": "Property",
        "Type": "Value",
        "FieldMapping": field_mapping_id,
    }

    if value is not None:
        entity["Value"] = value

    return property_id, entity


def create_style(style_value: dict, container_id: str) -> Tuple[str, dict]:
    """Create a Style entity. Returns (style_id, entity)."""
    style_id = id_gen.generate_style_id()

    entity = {
        "Id": style_id,
        "Kind": "Style",
        "Container": container_id,
        "Value": style_value,
    }
    return style_id, entity


def create_variable(var_data: dict, page_id: str) -> Tuple[str, dict]:
    """Create a Variable entity (for repeater data sources). Returns (variable_id, entity)."""
    variable_id = id_gen.generate_variable_id()

    entity: Dict[str, Any] = {
        "Id": variable_id,
        "Kind": "Variable",
        "Name": var_data["name"],
        "DataType": var_data.get("dataType", "ObjectList"),
        "Page": page_id,
    }

    if "defaultValue" in var_data:
        entity["DefaultValue"] = var_data["defaultValue"]

    if "schema" in var_data:
        entity["Schema"] = var_data["schema"]

    if "description" in var_data:
        entity["Description"] = var_data["description"]

    return variable_id, entity


def create_repeater(component_id: str) -> Tuple[str, dict]:
    """Create a Repeater entity (links Component to template Container). Returns (repeater_id, entity)."""
    repeater_id = id_gen.generate_repeater_id()

    entity = {
        "Id": repeater_id,
        "Kind": "Repeater",
        "Component": component_id,
        "Repeater::Container": [],
    }
    return repeater_id, entity


def create_variable_ref(
    field_path: str,
    container_id: str,
    page_id: str,
    property_id: str,
    ref_type: str = "DatasourceParameter",
) -> Tuple[str, dict]:
    """Create a VariableRef entity. ref_type is 'DatasourceParameter' for {{item.field}} or 'PageVariable' for {{variable.field}}."""
    var_ref_id = id_gen.generate_variable_ref_id()

    entity = {
        "Id": var_ref_id,
        "Kind": "VariableRef",
        "Type": ref_type,
        "Variable": field_path,
        "Container": container_id,
        "Page": page_id,
        "Property": property_id,
    }
    return var_ref_id, entity


def create_variable_property(field_mapping_id: str) -> Tuple[str, dict]:
    """Create a Property entity that references a variable (for repeater item bindings). Returns (property_id, entity)."""
    property_id = id_gen.generate_property_id()

    entity = {
        "Id": property_id,
        "Kind": "Property",
        "Type": "Variable",
        "FieldMapping": field_mapping_id,
        "Property::VariableRef": [],
    }
    return property_id, entity


def create_event_mapping(
    event_name: str,
    container_id: str,
    event_type: str = "JSAction",
) -> Tuple[str, dict]:
    """Create an EventMapping entity (for onClick, onLoad, etc.). Returns (event_mapping_id, entity)."""
    event_mapping_id = id_gen.generate_event_mapping_id()

    entity = {
        "Id": event_mapping_id,
        "Kind": "EventMapping",
        "Name": event_name,
        "Container": container_id,
        "Type": event_type,
        "EventMapping::Property": [],
    }
    return event_mapping_id, entity


def create_code_property(code: str, event_mapping_id: str) -> Tuple[str, dict]:
    """Create a Code Property entity (for JS action code). Returns (property_id, entity)."""
    property_id = id_gen.generate_property_id()

    entity = {
        "Id": property_id,
        "Kind": "Property",
        "Type": "Code",
        "EventMapping": event_mapping_id,
        "Value": code,
    }
    return property_id, entity


def create_popup(name: str, page_id: str, existing_id: Optional[str] = None) -> Tuple[str, dict]:
    """Create a Popup entity. If existing_id is provided, reuse it instead of generating a new one."""
    popup_id = existing_id or id_gen.generate_popup_id()

    entity = {
        "Id": popup_id,
        "Kind": "Popup",
        "Script": {"web": "general/popup"},
        "Name": name,
        "Page": page_id,
        "Popup::Container": [],
        "Popup::FieldMapping": [],
        "Popup::Style": [],
    }
    return popup_id, entity


def create_popup_property(popup_id: str, event_mapping_id: str) -> Tuple[str, dict]:
    """Create a Popup Property (for OpenPopup event). Returns (property_id, entity)."""
    property_id = id_gen.generate_property_id()

    entity = {
        "Id": property_id,
        "Kind": "Property",
        "Type": "Popup",
        "Name": "popup_params",
        "Value": popup_id,
        "EventMapping": event_mapping_id,
    }
    return property_id, entity


def create_tabs(component_id: str) -> Tuple[str, dict]:
    """Create a Tabs entity (links Tab Component to its Tab children). Returns (tabs_id, entity)."""
    tabs_id = id_gen.generate_tabs_id()

    entity = {
        "Id": tabs_id,
        "Kind": "Tabs",
        "Component": component_id,
        "Tabs::Tab": [],
        "DefaultTab": None,
    }
    return tabs_id, entity


def create_tab(name: str, tabs_id: str) -> Tuple[str, dict]:
    """Create a Tab entity (single tab within a Tabs group). Returns (tab_id, entity)."""
    tab_id = id_gen.generate_tab_id()

    entity = {
        "Id": tab_id,
        "Kind": "Tab",
        "Name": name,
        "hasBadge": False,
        "Tabs": tabs_id,
        "Tab::Container": [],
    }
    return tab_id, entity

def create_criteria(is_hidden: bool, container_id: str) -> Tuple[str, dict]:
    """Create a Criteria entity (conditional visibility rule on a container). Returns (criteria_id, entity)."""
    criteria_id = id_gen.generate_criteria_id()

    entity = {
        "Id": criteria_id,
        "Kind": "Criteria",
        "isHidden": is_hidden,
        "Container": container_id,
        "Criteria::Condition": [],
    }
    return criteria_id, entity


def create_condition(params: dict, criteria_id: str) -> Tuple[str, dict]:
    """Create a Condition entity (a single comparison within a Criteria). Returns (condition_id, entity)."""
    condition_id = id_gen.generate_condition_id()

    entity: Dict[str, Any] = {
        "Id": condition_id,
        "Kind": "Condition",
        "LHSVariable": params["lhsVariable"],
        "LHSType": params["lhsType"],
        "LHSDataType": params.get("lhsDataType", "Text"),
        "Operator": params["operator"],
        "RHSType": params["rhsType"],
        "HasArguments": True,
        "Criteria": criteria_id,
    }

    if params.get("rhsVariable") is not None:
        entity["RHSVariable"] = params["rhsVariable"]
    if params.get("rhsValue") is not None:
        entity["RHSValue"] = params["rhsValue"]

    return condition_id, entity
