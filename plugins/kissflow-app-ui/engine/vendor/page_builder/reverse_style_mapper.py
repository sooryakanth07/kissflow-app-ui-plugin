"""
Reverse Style Mapper
Maps full Kissflow style keys back to friendly intermediate format names.
Builds reverse maps by inverting the forward style_mapper mappings.
"""

from typing import Any, Dict, Optional

from utils.page_builder.style_mapper import (
    WIDGET_STYLE_MAPPINGS,
    get_button_mappings,
    get_progress_bar_mappings,
)


def _unwrap_value(wrapped: Any) -> Any:
    """Unwrap a style value: { ref: "Color.X" } → "Color.X", { value: "10px" } → "10px"."""
    if isinstance(wrapped, dict):
        return wrapped.get("ref") or wrapped.get("value")
    return wrapped


def build_reverse_map(forward_map: Dict[str, list]) -> Dict[str, str]:
    """
    Build reverse mapping for a widget: { 'Label.Font.Size': 'fontSize', ... }
    First friendly name wins (avoid overwriting).
    """
    reverse = {}
    for friendly_name, full_keys in forward_map.items():
        for key in full_keys:
            if key not in reverse:
                reverse[key] = friendly_name
    return reverse


def _build_common_reverse_map(prefix: str) -> Dict[str, str]:
    """Build reverse map for common container mappings."""
    pairs = {
        "background": [f"{prefix}.Background"],
        "hoverBackground": [f"{prefix}.Hover.Background"],
        "width": [f"{prefix}.Width"],
        "height": [f"{prefix}.Height"],
        "minWidth": [f"{prefix}.Min.Width"],
        "maxWidth": [f"{prefix}.Max.Width"],
        "minHeight": [f"{prefix}.Min.Height"],
        "maxHeight": [f"{prefix}.Max.Height"],
        "overflow": [f"{prefix}.Overflow"],
        "display": [f"{prefix}.Display"],
        "flexDirection": [f"{prefix}.Flex.Direction"],
        "flexWrap": [f"{prefix}.Flex.Wrap"],
        "justifyContent": [f"{prefix}.Justify.Content"],
        "alignItems": [f"{prefix}.Align.Items"],
        "alignContent": [f"{prefix}.Align.Content"],
        "rowGap": [f"{prefix}.Row.Gap"],
        "columnGap": [f"{prefix}.Column.Gap"],
        "paddingTop": [f"{prefix}.Padding.Top"],
        "paddingRight": [f"{prefix}.Padding.Right"],
        "paddingBottom": [f"{prefix}.Padding.Bottom"],
        "paddingLeft": [f"{prefix}.Padding.Left"],
        "marginTop": [f"{prefix}.Margin.Top"],
        "marginRight": [f"{prefix}.Margin.Right"],
        "marginBottom": [f"{prefix}.Margin.Bottom"],
        "marginLeft": [f"{prefix}.Margin.Left"],
        "borderStyle": [f"{prefix}.Border.Style"],
        "borderColor": [f"{prefix}.Border.Color"],
        "hoverBorderStyle": [f"{prefix}.Hover.Border.Style"],
        "hoverBorderColor": [f"{prefix}.Hover.Border.Color"],
        "shadowType": [f"{prefix}.Shadow.Type"],
        "shadowColor": [f"{prefix}.Shadow.Color"],
        "hoverShadowType": [f"{prefix}.Hover.Shadow.Type"],
        "hoverShadowColor": [f"{prefix}.Hover.Shadow.Color"],
        # Border width (4 directions)
        "borderTopWidth": [f"{prefix}.Border.Top.Width"],
        "borderRightWidth": [f"{prefix}.Border.Right.Width"],
        "borderBottomWidth": [f"{prefix}.Border.Bottom.Width"],
        "borderLeftWidth": [f"{prefix}.Border.Left.Width"],
        # Border radius (4 corners)
        "borderTopLeftRadius": [f"{prefix}.Border.Top.Left.Radius"],
        "borderTopRightRadius": [f"{prefix}.Border.Top.Right.Radius"],
        "borderBottomLeftRadius": [f"{prefix}.Border.Bottom.Left.Radius"],
        "borderBottomRightRadius": [f"{prefix}.Border.Bottom.Right.Radius"],
    }

    result = {}
    for friendly, keys in pairs.items():
        for key in keys:
            result[key] = friendly
    return result


# Pre-build reverse maps for all widget types
REVERSE_WIDGET_MAPS: Dict[str, Dict[str, str]] = {
    widget_type: build_reverse_map(forward_map) for widget_type, forward_map in WIDGET_STYLE_MAPPINGS.items()
}

# Pre-build button reverse maps for all size + type combinations
BUTTON_SIZES = ("Base", "Small", "Medium", "Large")
BUTTON_TYPES = ("Primary", "Secondary", "Tertiary")
BUTTON_REVERSE_MAPS: Dict[str, Dict[str, str]] = {
    f"{size}_{btype}": build_reverse_map(get_button_mappings(size, btype))
    for size in BUTTON_SIZES
    for btype in BUTTON_TYPES
}

# Pre-build progress bar reverse maps
PROGRESS_BAR_CHART_TYPES = ("Linear", "Circular", "Semicircular")
PROGRESS_BAR_REVERSE_MAPS: Dict[str, Dict[str, str]] = {
    ct: build_reverse_map(get_progress_bar_mappings(ct)) for ct in PROGRESS_BAR_CHART_TYPES
}

# Common reverse maps for container types
COMMON_REVERSE_MAPS: Dict[str, Dict[str, str]] = {
    "Body": _build_common_reverse_map("Body.Container"),
    "Container": _build_common_reverse_map("Container"),
    "Repeater": _build_common_reverse_map("Repeater.Container"),
    "Popup": _build_common_reverse_map("Popup.Container"),
}

# Known repeater reset keys to filter out
REPEATER_RESET_KEYS = frozenset(
    [
        "Repeater.Padding.Top",
        "Repeater.Padding.Right",
        "Repeater.Padding.Bottom",
        "Repeater.Padding.Left",
        "Repeater.Border.Top.Width",
        "Repeater.Border.Right.Width",
        "Repeater.Border.Bottom.Width",
        "Repeater.Border.Left.Width",
        "Repeater.Container.Padding.Top",
        "Repeater.Container.Padding.Right",
        "Repeater.Container.Padding.Bottom",
        "Repeater.Container.Padding.Left",
        "Repeater.Container.Border.Top.Width",
        "Repeater.Container.Border.Right.Width",
        "Repeater.Container.Border.Bottom.Width",
        "Repeater.Container.Border.Left.Width",
        "Repeater.Container.Min.Height",
        # Layout-specific container sizing
        "Repeater.Container.Width",
        "Repeater.Container.Min.Width",
        "Repeater.Container.Max.Width",
        "Repeater.Container.Height",
        "Repeater.Container.Max.Height",
        # Arrangement keys
        "Repeater.Arrangement.Direction",
        "Repeater.Arrangement.Display",
        "Repeater.Arrangement.Columns",
    ]
)

# Default reset values to skip when filtering repeater resets
_REPEATER_RESET_VALUES = frozenset(
    [
        "0px",
        "10px",
        "auto",
        "100px",
        "100%",
        "unset",
        "50px",
        "200px",
    ]
)


def _reverse_style_key(
    full_key: str,
    widget_type: Optional[str] = None,
    container_type: Optional[str] = None,
) -> str:
    """Reverse a full style key to its friendly name."""
    # For Button, try all size + type combinations
    if widget_type == "Button":
        for size in BUTTON_SIZES:
            for btype in BUTTON_TYPES:
                key = f"{size}_{btype}"
                friendly = BUTTON_REVERSE_MAPS[key].get(full_key)
                if friendly:
                    return friendly

    # For ProgressBar, try all chart type combinations
    if widget_type == "ProgressBar":
        for ct in PROGRESS_BAR_CHART_TYPES:
            friendly = PROGRESS_BAR_REVERSE_MAPS[ct].get(full_key)
            if friendly:
                return friendly

    # Try widget-specific reverse map
    if widget_type and widget_type in REVERSE_WIDGET_MAPS:
        friendly = REVERSE_WIDGET_MAPS[widget_type].get(full_key)
        if friendly:
            return friendly

    # Try common container reverse map
    if container_type and container_type in COMMON_REVERSE_MAPS:
        friendly = COMMON_REVERSE_MAPS[container_type].get(full_key)
        if friendly:
            return friendly

    # Try Container as fallback for generic containers
    friendly = COMMON_REVERSE_MAPS["Container"].get(full_key)
    if friendly:
        return friendly

    # Return as-is if not mappable
    return full_key


def collapse_shorthands(styles: dict) -> dict:
    """
    Collapse expanded properties into shorthands where all sides are equal.
    e.g., paddingTop/Right/Bottom/Left all equal → padding.
    """
    result = dict(styles)

    # Collapse padding
    sides = ("paddingTop", "paddingRight", "paddingBottom", "paddingLeft")
    if all(result.get(s) for s in sides):
        values = [result[s] for s in sides]
        if len(set(values)) == 1:
            result["padding"] = values[0]
            for s in sides:
                del result[s]

    # Collapse margin
    sides = ("marginTop", "marginRight", "marginBottom", "marginLeft")
    if all(result.get(s) for s in sides):
        values = [result[s] for s in sides]
        if len(set(values)) == 1:
            result["margin"] = values[0]
            for s in sides:
                del result[s]

    # Collapse borderRadius
    sides = ("borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius")
    if all(result.get(s) for s in sides):
        values = [result[s] for s in sides]
        if len(set(values)) == 1:
            result["borderRadius"] = values[0]
            for s in sides:
                del result[s]

    # Collapse borderWidth
    sides = ("borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth")
    if all(result.get(s) for s in sides):
        values = [result[s] for s in sides]
        if len(set(values)) == 1:
            result["borderWidth"] = values[0]
            for s in sides:
                del result[s]

    # Collapse gap (rowGap + columnGap equal)
    if result.get("rowGap") and result.get("columnGap") and result["rowGap"] == result["columnGap"]:
        result["gap"] = result["rowGap"]
        del result["rowGap"]
        del result["columnGap"]

    # Normalize flexWrap
    if result.get("flexWrap") == "no-wrap":
        result["flexWrap"] = "nowrap"

    return result


def reverse_styles(
    style_value: Any,
    widget_type: Optional[str] = None,
    container_type: Optional[str] = None,
    filter_resets: bool = False,
) -> dict:
    """
    Reverse a full Style entity Value object to friendly intermediate format.

    :param style_value: The Style.Value object with full keys.
    :param widget_type: Widget type or None for containers.
    :param container_type: Container type or None for widgets.
    :param filter_resets: Whether to filter out repeater reset values.
    :returns: Friendly style object.
    """
    if not style_value or not isinstance(style_value, dict):
        return {}

    result = {}

    for full_key, wrapped_value in style_value.items():
        # Filter out repeater resets and layout-specific keys
        if filter_resets and full_key in REPEATER_RESET_KEYS:
            val = _unwrap_value(wrapped_value)
            # Always skip arrangement keys
            if full_key.startswith("Repeater.Arrangement."):
                continue
            # Skip known reset values and layout sizing defaults
            if val in _REPEATER_RESET_VALUES:
                continue

        friendly_name = _reverse_style_key(full_key, widget_type, container_type)
        value = _unwrap_value(wrapped_value)

        if value is not None:
            result[friendly_name] = value

    return collapse_shorthands(result)
