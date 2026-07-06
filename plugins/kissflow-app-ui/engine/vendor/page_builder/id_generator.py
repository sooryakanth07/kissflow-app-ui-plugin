"""
ID Generator
Generates unique IDs for page metadata entities.
"""

import re
import secrets


def _random_id(length: int = 10) -> str:
    """Generate a URL-safe random string of the given length."""
    return secrets.token_urlsafe(length)[:length]


def generate_page_id(name: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9]", "_", name)[:20]
    return f"Page_{sanitized}_{_random_id(6)}"


def generate_container_id(is_body: bool = False) -> str:
    return "Container001" if is_body else f"Container_{_random_id()}"


def generate_component_id() -> str:
    return f"Component_{_random_id()}"


def generate_style_id() -> str:
    return f"Style_{_random_id()}"


def generate_field_mapping_id() -> str:
    return f"FieldMapping_{_random_id()}"


def generate_property_id() -> str:
    return f"Property_{_random_id()}"


def generate_variable_id() -> str:
    return f"Variable_{_random_id()}"


def generate_repeater_id() -> str:
    return f"Repeater_{_random_id()}"


def generate_variable_ref_id() -> str:
    return f"VariableRef_{_random_id()}"


def generate_event_mapping_id() -> str:
    return f"EventMapping_{_random_id()}"


def generate_popup_id() -> str:
    return f"Popup_{_random_id()}"


def generate_tabs_id() -> str:
    return f"Tabs_{_random_id()}"


def generate_tab_id() -> str:
    return f"Tab_{_random_id()}"

# Conditional visibility
def generate_criteria_id() -> str:
    return f"Criteria_{_random_id()}"


def generate_condition_id() -> str:
    return f"Condition_{_random_id()}"

# Report entity IDs
def generate_report_field_id() -> str:
    return f"ReportField_{_random_id()}"


def generate_column_id() -> str:
    return f"Column_{_random_id()}"


def generate_filter_id() -> str:
    return f"Filter_{_random_id()}"


def generate_filter_param_id() -> str:
    return f"FilterParam_{_random_id()}"


def generate_drilldown_id() -> str:
    return f"Drilldown_{_random_id()}"


def generate_drilldown_field_id() -> str:
    return f"DrilldownField_{_random_id()}"


def generate_drilldown_column_id() -> str:
    return f"DrilldownColumn_{_random_id()}"


def generate_value_id() -> str:
    return f"Value_{_random_id()}"


def generate_sort_id() -> str:
    return f"Sort_{_random_id()}"
