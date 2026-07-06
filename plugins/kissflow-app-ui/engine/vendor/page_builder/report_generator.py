"""
Report Metadata Generator
Deterministically generates Kissflow chart report metadata from simple inputs.
"""

import time
from typing import Any, Dict, List, Optional

from utils.page_builder import id_generator as id_gen

DEFAULT_COLOR_PALETTE = [
    "rgb(var(--lavender-blue))",
    "rgb(var(--greenish-cyan))",
    "rgb(var(--pale-gold))",
    "rgb(var(--peachy-pink))",
    "rgb(var(--periwinkle))",
    "rgb(var(--light-blue))",
    "rgb(var(--pale-salmon))",
    "rgb(var(--bubblegum-pink))",
]


def generate_report_metadata(report_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate full report metadata.

    Args:
        report_id: Kissflow-assigned report ID (from createReport API).
        config: Report configuration with keys:
            - name: Report name
            - formId: Dataform ID (Model)
            - appId: Application ID
            - viewType: "BarColumnChart" | "PieChart" | "LineChart" | "AreaChart"
            - dimensionFieldId: Field ID for grouping (x-axis / slices)
            - measureFieldId: Field ID for aggregation (y-axis / values)
            - aggregateFunction: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX"
            - filters: Optional list of {"fieldId", "operator", "value"}

    Returns:
        Full report metadata ready for PUT draft.
    """
    name = config["name"]
    form_id = config["formId"]
    app_id = config["appId"]
    view_type = config.get("viewType", "BarColumnChart")
    dimension_field_id = config["dimensionFieldId"]
    measure_field_id = config["measureFieldId"]
    aggregate_function = config.get("aggregateFunction", "COUNT")
    filters: List[Dict] = config.get("filters", [])

    metadata: Dict[str, Any] = {}

    # Generate all entity IDs upfront
    dim_field_id = id_gen.generate_report_field_id()
    dim_drill_field_id = id_gen.generate_report_field_id()
    measure_rf_id = id_gen.generate_report_field_id()
    sort_rf_id = id_gen.generate_report_field_id()
    column_id = id_gen.generate_column_id()
    value_id = id_gen.generate_value_id()
    sort_id = id_gen.generate_sort_id()
    drilldown_id = id_gen.generate_drilldown_id()
    drill_filter_id = id_gen.generate_filter_id()
    drill_condition_id = id_gen.generate_filter_id()
    filter_param_id = id_gen.generate_filter_param_id()
    drilldown_field_dim_id = id_gen.generate_drilldown_field_id()
    drilldown_field_measure_id = id_gen.generate_drilldown_field_id()
    drilldown_col_dim_id = id_gen.generate_drilldown_column_id()
    drilldown_col_measure_id = id_gen.generate_drilldown_column_id()

    all_report_field_ids = [dim_field_id, dim_drill_field_id, measure_rf_id, sort_rf_id]
    all_filter_ids = [drill_filter_id]

    # User filters
    for f in filters:
        filter_rf_id = id_gen.generate_report_field_id()
        all_report_field_ids.append(filter_rf_id)

        criteria_id = id_gen.generate_filter_id()
        condition_id = id_gen.generate_filter_id()
        all_filter_ids.append(criteria_id)

        metadata[filter_rf_id] = {
            "Id": filter_rf_id,
            "Kind": "ReportField",
            "FieldId": f["fieldId"],
            "ModelId": form_id,
            "Report": report_id,
        }

        metadata[criteria_id] = {
            "Id": criteria_id,
            "Kind": "Filter",
            "Report": report_id,
            "Type": "Criteria",
            "IsOR": True,
            "Filter::Filter": [condition_id],
            "LHSField": filter_rf_id,
        }

        metadata[condition_id] = {
            "Id": condition_id,
            "Kind": "Filter",
            "Filter": criteria_id,
            "Type": "Condition",
            "LHSField": filter_rf_id,
            "Operator": f.get("operator", "EQUAL_TO"),
            "RHSType": "Value",
            "RHSValue": f["value"],
        }

    # Root Report entity
    metadata[report_id] = {
        "Id": report_id,
        "Name": name,
        "Kind": "Report",
        "FlowType": "Report",
        "Description": "",
        "_application_id": app_id,
        "Model": form_id,
        "Type": "ChartReport",
        "ViewType": view_type,
        "Appearance": {
            "ScaleType": "Linear",
            "Labels": {
                "XAxisLabel": True,
                "YAxisLabel": True,
                "DataLabel": True,
                "Legend": True,
            },
            "DrilldownEnabled": {"action": "system", "value": True},
            "ColorPalette": DEFAULT_COLOR_PALETTE,
        },
        "Report::ReportField": all_report_field_ids,
        "Report::Column": [column_id],
        "Report::Filter": all_filter_ids,
        "Report::FilterParam": [filter_param_id],
        "Report::Drilldown": [drilldown_id],
        "Report::Value": [value_id],
        "Report::Sort": [sort_id],
        "FilterType": "and",
    }

    # Dimension ReportField (Column)
    metadata[dim_field_id] = {
        "Id": dim_field_id,
        "Kind": "ReportField",
        "FieldId": dimension_field_id,
        "ModelId": form_id,
        "Report": report_id,
        "ReportField::Column": [column_id],
    }

    # Column
    metadata[column_id] = {
        "Id": column_id,
        "Kind": "Column",
        "ReportField": dim_field_id,
        "Report": report_id,
    }

    # Dimension ReportField for drilldown
    metadata[dim_drill_field_id] = {
        "Id": dim_drill_field_id,
        "Kind": "ReportField",
        "FieldId": dimension_field_id,
        "ModelId": form_id,
        "Report": report_id,
    }

    # Measure ReportField
    metadata[measure_rf_id] = {
        "Id": measure_rf_id,
        "Kind": "ReportField",
        "FieldId": measure_field_id,
        "ModelId": form_id,
        "AggregateFunction": aggregate_function,
        "Report": report_id,
        "ReportField::Value": [value_id],
    }

    # Value
    metadata[value_id] = {
        "Id": value_id,
        "Kind": "Value",
        "ReportField": measure_rf_id,
        "Report": report_id,
    }

    # Sort ReportField
    metadata[sort_rf_id] = {
        "Id": sort_rf_id,
        "Kind": "ReportField",
        "FieldId": measure_field_id,
        "ModelId": form_id,
        "FieldReferenceId": value_id,
        "Report": report_id,
        "ReportField::Sort": [sort_id],
    }

    # Sort
    metadata[sort_id] = {
        "Id": sort_id,
        "Kind": "Sort",
        "ReportField": sort_rf_id,
        "IsDesc": True,
        "FieldId": measure_field_id,
        "Report": report_id,
    }

    # System Drilldown Filter (Criteria)
    metadata[drill_filter_id] = {
        "Id": drill_filter_id,
        "Kind": "Filter",
        "Report": report_id,
        "Type": "Criteria",
        "Category": "System",
        "Purpose": "Drilldown",
        "IsOR": False,
        "Filter::Filter": [drill_condition_id],
        "LHSField": dim_drill_field_id,
    }

    # Drilldown Condition
    metadata[drill_condition_id] = {
        "Id": drill_condition_id,
        "Kind": "Filter",
        "Filter": drill_filter_id,
        "Type": "Condition",
        "LHSField": dim_drill_field_id,
        "Operator": "EQUAL_TO",
        "RHSType": "FilterParam",
        "RHSParam": filter_param_id,
    }

    # FilterParam
    metadata[filter_param_id] = {
        "Id": filter_param_id,
        "Kind": "FilterParam",
        "Report": report_id,
        "Name": column_id,
        "RHSParam::Filter": [drill_condition_id],
    }

    # Drilldown
    metadata[drilldown_id] = {
        "Id": drilldown_id,
        "Kind": "Drilldown",
        "Report": report_id,
        "DrilldownType": "DEFAULT",
        "Drilldown::DrilldownField": [drilldown_field_dim_id, drilldown_field_measure_id],
        "Drilldown::DrilldownColumn": [drilldown_col_dim_id, drilldown_col_measure_id],
        "TableCount": 0,
    }

    # DrilldownField for dimension
    metadata[drilldown_field_dim_id] = {
        "Id": drilldown_field_dim_id,
        "Kind": "DrilldownField",
        "FieldId": dimension_field_id,
        "Drilldown": drilldown_id,
        "DrilldownField::DrilldownColumn": [drilldown_col_dim_id],
    }
    metadata[drilldown_col_dim_id] = {
        "Id": drilldown_col_dim_id,
        "Kind": "DrilldownColumn",
        "DrilldownField": drilldown_field_dim_id,
        "Drilldown": drilldown_id,
    }

    # DrilldownField for measure
    metadata[drilldown_field_measure_id] = {
        "Id": drilldown_field_measure_id,
        "Kind": "DrilldownField",
        "FieldId": measure_field_id,
        "Drilldown": drilldown_id,
        "DrilldownField::DrilldownColumn": [drilldown_col_measure_id],
    }
    metadata[drilldown_col_measure_id] = {
        "Id": drilldown_col_measure_id,
        "Kind": "DrilldownColumn",
        "DrilldownField": drilldown_field_measure_id,
        "Drilldown": drilldown_id,
    }

    return {
        "Root": report_id,
        **metadata,
        "_meta_version": str(int(time.time() * 1000)),
    }
