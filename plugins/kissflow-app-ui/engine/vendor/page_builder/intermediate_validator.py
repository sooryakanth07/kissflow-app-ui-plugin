"""
Intermediate Format Validator
Validates LLM output before transformation.
"""

from typing import Dict, List

from utils.page_builder.component_catalog import COMPONENT_REGISTRY, SUPPORTED_TYPES


def validate_intermediate(intermediate: dict) -> Dict:
    """
    Validate intermediate JSON and return a list of errors.

    Returns:
        {"valid": bool, "errors": list[str]}
    """
    errors: List[str] = []

    if not intermediate or not isinstance(intermediate, dict):
        return {"valid": False, "errors": ["Intermediate format must be a JSON object"]}

    if not intermediate.get("page"):
        errors.append('Missing required field: "page"')
    else:
        name = intermediate["page"].get("name")
        if not name or not isinstance(name, str):
            errors.append("page.name must be a non-empty string")

    if not intermediate.get("body"):
        errors.append('Missing required field: "body"')
    else:
        children = intermediate["body"].get("children")
        if not isinstance(children, list):
            errors.append("body.children must be an array")
        else:
            for i, child in enumerate(children):
                _validate_widget(child, f"body.children[{i}]", errors, 1)

    # Validate page variables
    variables = intermediate.get("variables")
    if isinstance(variables, list):
        valid_var_types = ["Text", "Number", "Boolean", "ObjectList", "Json"]
        for i, v in enumerate(variables):
            if not v.get("name") or not isinstance(v.get("name"), str):
                errors.append(f'variables[{i}]: must have a "name" (string)')
            v_type = v.get("type")
            if v_type and v_type not in valid_var_types:
                errors.append(
                    f'variables[{i}]: type must be one of {", ".join(valid_var_types)}, got "{v_type}"'
                )
            # ObjectList/Json need appropriate defaultValue
            if v_type == "ObjectList":
                dv = v.get("defaultValue")
                if dv is not None and not isinstance(dv, list):
                    errors.append(f"variables[{i}]: ObjectList defaultValue must be an array")
            if v_type == "Json":
                dv = v.get("defaultValue")
                if dv is not None and (not isinstance(dv, dict) or isinstance(dv, list)):
                    errors.append(f"variables[{i}]: Json defaultValue must be an object")

    # Validate popups
    popups = intermediate.get("popups")
    if isinstance(popups, list):
        popup_ids_seen: set = set()
        for i, popup in enumerate(popups):
            popup_id = popup.get("id")
            if not popup_id or not isinstance(popup_id, str):
                errors.append(f'popups[{i}]: must have an "id" (string)')
            else:
                if popup_id in popup_ids_seen:
                    errors.append(f'popups[{i}]: duplicate popup id "{popup_id}"')
                popup_ids_seen.add(popup_id)
            if not popup.get("title") or not isinstance(popup.get("title"), str):
                errors.append(f'popups[{i}]: must have a "title" (string)')
            popup_children = popup.get("children")
            if isinstance(popup_children, list):
                for j, child in enumerate(popup_children):
                    _validate_widget(child, f"popups[{i}].children[{j}]", errors, 1)

    return {"valid": len(errors) == 0, "errors": errors}


def _validate_widget(widget: dict, path: str, errors: List[str], depth: int) -> None:
    """Validate a single widget recursively."""
    if not widget or not isinstance(widget, dict):
        errors.append(f"{path}: must be an object")
        return

    widget_type = widget.get("type")
    if not widget_type or not isinstance(widget_type, str):
        errors.append(f'{path}: missing or invalid "type" field')
        return

    if widget_type not in SUPPORTED_TYPES:
        errors.append(f'{path}: unknown type "{widget_type}". Supported: {", ".join(SUPPORTED_TYPES)}')
        return

    # Skip validation for unmapped widgets (charts/tables not yet bound to data)
    if widget.get("_unmapped"):
        return

    # Skip validation for raw passthrough widgets (unsupported components preserved as-is)
    if widget.get("_raw"):
        return

    if widget_type == "Container":
        children = widget.get("children")
        if isinstance(children, list):
            for i, child in enumerate(children):
                _validate_widget(child, f"{path}.children[{i}]", errors, depth + 1)

        layout = widget.get("layout")
        if isinstance(layout, str) and layout not in ("horizontal", "vertical", "row", "column"):
            errors.append(f'{path}: layout must be "horizontal" or "vertical", got "{layout}"')

    elif widget_type == "Repeater":
        is_dataform = bool(widget.get("dataform"))
        is_process = bool(widget.get("process"))

        if is_dataform:
            df = widget["dataform"]
            if not df.get("formId") or not isinstance(df.get("formId"), str):
                errors.append(f'{path}: Dataform Repeater must have "dataform.formId" (string)')
            if not widget.get("fields") or not isinstance(widget.get("fields"), list) or len(widget["fields"]) == 0:
                errors.append(f'{path}: Repeater must have "fields" (non-empty array of field IDs)')
        elif is_process:
            proc = widget["process"]
            if not proc.get("processId") or not isinstance(proc.get("processId"), str):
                errors.append(f'{path}: Process Repeater must have "process.processId" (string)')
            if not widget.get("fields") or not isinstance(widget.get("fields"), list) or len(widget["fields"]) == 0:
                errors.append(f'{path}: Repeater must have "fields" (non-empty array of field IDs)')
        else:
            if not widget.get("variable") or not isinstance(widget.get("variable"), str):
                errors.append(f'{path}: Repeater must have a "variable", "dataform", or "process" source')
            if not widget.get("fields") or not isinstance(widget.get("fields"), list) or len(widget["fields"]) == 0:
                errors.append(f'{path}: Repeater must have "fields" (non-empty array of field names)')
            # data is optional if the variable is defined in the top-level variables array
            if widget.get("data") is not None and not isinstance(widget.get("data"), list):
                errors.append(f'{path}: Repeater "data" must be an array of objects if provided')

        repeater_layout = widget.get("repeaterLayout")
        if repeater_layout and repeater_layout not in ("vertical", "horizontal", "grid"):
            errors.append(
                f'{path}: repeaterLayout must be "vertical", "horizontal", or "grid", got "{repeater_layout}"'
            )
        if repeater_layout == "grid" and widget.get("gridColumns") is not None:
            gc = widget["gridColumns"]
            if not isinstance(gc, (int, float)) or gc < 1 or gc > 12:
                errors.append(f"{path}: gridColumns must be a number between 1 and 12")

        template = widget.get("template")
        if not isinstance(template, list) or len(template) == 0:
            errors.append(f'{path}: Repeater must have "template" (non-empty array of child widgets)')
        else:
            for i, child in enumerate(template):
                _validate_widget(child, f"{path}.template[{i}]", errors, depth + 1)

    elif widget_type == "ChartReport":
        report = widget.get("report")
        if not report or not isinstance(report, dict):
            errors.append(f'{path}: ChartReport must have a "report" object')
        else:
            has_form_id = isinstance(report.get("formId"), str) and bool(report["formId"])
            has_process_id = isinstance(report.get("processId"), str) and bool(report["processId"])
            if not has_form_id and not has_process_id:
                errors.append(f'{path}: ChartReport must have "report.formId" or "report.processId" (string)')

            has_report_id = isinstance(report.get("reportId"), str) and bool(report["reportId"])
            has_generate = isinstance(report.get("generate"), dict)
            if not has_report_id and not has_generate:
                errors.append(
                    f'{path}: ChartReport must have either "report.reportId" (existing) or "report.generate" (auto-create)'
                )

            if has_generate:
                gen = report["generate"]
                if not gen.get("dimensionFieldId"):
                    errors.append(f'{path}: report.generate must have "dimensionFieldId"')
                if not gen.get("measureFieldId"):
                    errors.append(f'{path}: report.generate must have "measureFieldId"')

    elif widget_type == "ProcessTable":
        process = widget.get("process")
        if not process or not isinstance(process, dict):
            errors.append(f'{path}: ProcessTable must have a "process" object')
        else:
            if not process.get("processId") or not isinstance(process.get("processId"), str):
                errors.append(f'{path}: ProcessTable must have "process.processId" (string)')
            if not process.get("viewId") or not isinstance(process.get("viewId"), str):
                errors.append(f'{path}: ProcessTable must have "process.viewId" ("mytasks" or "myitems")')

    elif widget_type == "DataformTable":
        dataform = widget.get("dataform")
        if not dataform or not isinstance(dataform, dict):
            errors.append(f'{path}: DataformTable must have a "dataform" object')
        else:
            if not dataform.get("formId") or not isinstance(dataform.get("formId"), str):
                errors.append(f'{path}: DataformTable must have "dataform.formId" (string)')

    elif widget_type == "FormView":
        has_process = isinstance(widget.get("process"), dict)
        has_dataform = isinstance(widget.get("dataform"), dict)
        if not has_process and not has_dataform:
            errors.append(f'{path}: FormView must have a "process" or "dataform" object')
        if has_process and (not widget["process"].get("processId") or not isinstance(widget["process"].get("processId"), str)):
            errors.append(f'{path}: FormView process must have "processId" (string)')
        if has_dataform and (not widget["dataform"].get("formId") or not isinstance(widget["dataform"].get("formId"), str)):
            errors.append(f'{path}: FormView dataform must have "formId" (string)')

    elif widget_type == "Tab":
        tabs = widget.get("tabs")
        if not isinstance(tabs, list) or len(tabs) == 0:
            errors.append(f'{path}: Tab must have "tabs" (non-empty array)')
        else:
            for i, tab in enumerate(tabs):
                if not tab.get("name") or not isinstance(tab.get("name"), str):
                    errors.append(f'{path}.tabs[{i}]: each tab must have a "name" (string)')
                tab_children = tab.get("children")
                if isinstance(tab_children, list):
                    for j, child in enumerate(tab_children):
                        _validate_widget(child, f"{path}.tabs[{i}].children[{j}]", errors, depth + 1)

    else:
        # Validate component properties
        registry = COMPONENT_REGISTRY.get(widget_type)
        if registry and widget.get("properties"):
            valid_props = list(registry["properties"].keys())
            for prop_name in widget["properties"]:
                if prop_name not in valid_props:
                    errors.append(
                        f'{path}: unknown property "{prop_name}" for {widget_type}. Valid: {", ".join(valid_props)}'
                    )

        # Validate onClick (on any widget type)
    on_click = widget.get("onClick")
    if on_click:
        valid_onclick_types = ["code", "openPopup"]
        oc_type = on_click.get("type")
        if not oc_type or oc_type not in valid_onclick_types:
            errors.append(f'{path}.onClick: type must be one of {", ".join(valid_onclick_types)}')
        if oc_type == "code" and on_click.get("code") is not None and not isinstance(on_click.get("code"), str):
            errors.append(f"{path}.onClick: code must be a string")
        if oc_type == "openPopup" and (not on_click.get("popupId") or not isinstance(on_click.get("popupId"), str)):
            errors.append(f'{path}.onClick: openPopup must have a "popupId" (string)')

    # Validate onLoad (on any widget type)
    on_load = widget.get("onLoad")
    if on_load:
        if on_load.get("type") != "code":
            errors.append(f'{path}.onLoad: type must be "code"')
        if on_load.get("code") is not None and not isinstance(on_load.get("code"), str):
            errors.append(f"{path}.onLoad: code must be a string")

    # Validate visibility (on any widget type)
    visibility = widget.get("visibility")
    if visibility:
        action = visibility.get("action")
        if not action or action not in ("show", "hide"):
            errors.append(f'{path}.visibility: action must be "show" or "hide"')
        cond = visibility.get("condition")
        if not cond or not isinstance(cond, dict):
            errors.append(f'{path}.visibility: must have a "condition" object')
        else:
            left = cond.get("left")
            if not left or not isinstance(left, dict) or not left.get("variable"):
                errors.append(f'{path}.visibility.condition: must have "left" with "variable"')
            if not cond.get("operator") or not isinstance(cond.get("operator"), str):
                errors.append(f'{path}.visibility.condition: must have "operator" (string)')
            right = cond.get("right")
            if not right or not isinstance(right, dict) or not right.get("type"):
                errors.append(f'{path}.visibility.condition: must have "right" with "type"')

