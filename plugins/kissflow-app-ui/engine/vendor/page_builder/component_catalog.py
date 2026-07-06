"""
Component Catalog
Defines all supported components, their properties, and metadata.
"""

SUPPORTED_TYPES = [
    "Container",
    "Label",
    "Button",
    "Card",
    "Icon",
    "Image",
    "Divider",
    "Hyperlink",
    "RichText",
    "ProgressBar",
    "IFrame",
    "Repeater",
    "ChartReport",
    "ProcessTable",
    "DataformTable",
    "Tab",
    "FormView",
    "Popup",
]

COMPONENT_REGISTRY = {
    "Label": {
        "script_path": "general/label",
        "visualization_type": "label",
        "category": "general",
        "properties": {
            "title": {"default": "Enter label name", "type": "string"},
        },
        "default_layout": {"colSpan": 5, "rowSpan": 7},
    },
    "Button": {
        "script_path": "general/button",
        "visualization_type": "button",
        "category": "general",
        "properties": {
            "caption": {"default": "Button", "type": "string"},
            "size": {"default": "base", "type": "string", "options": ["small", "medium", "base", "large"]},
            "type": {"default": "primary", "type": "string", "options": ["primary", "secondary", "tertiary"]},
            "icon": {"default": "", "type": "icon"},
            "iconPosition": {"default": "left", "type": "string", "options": ["left", "right"]},
        },
        "default_layout": {"colSpan": 4, "rowSpan": 10},
    },
    "Card": {
        "script_path": "general/card",
        "visualization_type": "card",
        "category": "general",
        "properties": {
            "label": {"default": "Enter card description", "type": "string"},
            "cardType": {"default": "Type1", "type": "string"},
            "count": {"default": 20, "type": "number"},
            "icon": {"default": "", "type": "icon"},
            "tooltipContent": {"default": "", "type": "string"},
        },
        "default_layout": {"colSpan": 6, "rowSpan": 21},
    },
    "Icon": {
        "script_path": "general/icon",
        "visualization_type": "icon",
        "category": "general",
        "properties": {
            "iconUrl": {"default": "", "type": "icon"},
            "isBadgeType": {"default": False, "type": "boolean"},
            "badgeIndicationType": {"default": "count", "type": "string", "options": ["count", "dot"]},
            "badgeIndicationCount": {"default": 9, "type": "number"},
            "tooltipContent": {"default": "", "type": "string"},
        },
        "default_layout": {"colSpan": 2, "rowSpan": 7},
    },
    "Image": {
        "script_path": "general/image",
        "visualization_type": "image",
        "category": "general",
        "properties": {
            "imageSrc": {"default": "", "type": "resource"},
            "tooltipContent": {"default": "", "type": "string"},
        },
        "default_layout": {"colSpan": 8, "rowSpan": 70},
    },
    "Divider": {
        "script_path": "general/divider",
        "visualization_type": "divider",
        "category": "general",
        "properties": {
            "orientation": {"default": "horizontal", "type": "string", "options": ["horizontal", "vertical"]},
            "content": {"default": "", "type": "string"},
        },
        "default_layout": {"colSpan": 24, "rowSpan": 5},
    },
    "Hyperlink": {
        "script_path": "general/hyperlink",
        "visualization_type": "hyperlink",
        "category": "general",
        "properties": {
            "title": {"default": "Click this link", "type": "string"},
            "url": {"default": "", "type": "string"},
            "openInNewWindow": {"default": False, "type": "boolean"},
            "tooltipContent": {"default": "", "type": "string"},
        },
        "default_layout": {"colSpan": 5, "rowSpan": 7},
    },
    "RichText": {
        "script_path": "general/rich_text",
        "visualization_type": "richtext",
        "category": "general",
        "properties": {
            "value": {"default": "", "type": "string"},
        },
        "default_layout": {"colSpan": 12, "rowSpan": 30},
    },
    "ProgressBar": {
        "script_path": "general/progressbar",
        "visualization_type": "progressbar",
        "category": "general",
        "properties": {
            "title": {"default": "Progress status", "type": "string"},
            "helpText": {"default": "", "type": "string"},
            "chartType": {"default": "linear", "type": "string", "options": ["linear", "circular", "semicircular"]},
            "maxValue": {"default": 1200, "type": "number"},
            "currentValue": {"default": 700, "type": "number"},
        },
        "default_layout": {"colSpan": 8, "rowSpan": 20},
    },
    "IFrame": {
        "script_path": "general/iframe",
        "visualization_type": "iframe",
        "category": "general",
        "properties": {
            "source": {"default": "", "type": "string"},
        },
        "default_layout": {"colSpan": 12, "rowSpan": 70},
    },
    "Repeater": {
        "script_path": "general/repeater",
        "visualization_type": "repeater",
        "category": "general",
        "properties": {},
        "default_layout": {"colSpan": 25, "rowSpan": 70},
    },
    "ChartReport": {
        "script_path": "report/chart",
        "visualization_type": "chart",
        "category": "report",
        "properties": {},
        "default_layout": {"colSpan": 13, "rowSpan": 85},
    },
    "ProcessTable": {
        "script_path": "view/table",
        "visualization_type": "table",
        "category": "view",
        "properties": {},
        "default_layout": {"colSpan": 25, "rowSpan": 70},
    },
    "DataformTable": {
        "script_path": "view/table",
        "visualization_type": "table",
        "category": "view",
        "properties": {},
        "default_layout": {"colSpan": 25, "rowSpan": 70},
    },
    "FormView": {
        "script_path": "view/form",
        "visualization_type": "form",
        "category": "view",
        "properties": {},
        "default_layout": {"colSpan": 25, "rowSpan": 70},
    },
    "Tab": {
        "script_path": "general/tab",
        "visualization_type": "tab",
        "category": "general",
        "properties": {},
        "default_layout": {"colSpan": 30, "rowSpan": 70},
    },
    "Popup": {
        "script_path": "general/popup",
        "visualization_type": "popup",
        "category": "general",
        "properties": {},
        "default_layout": {},
    },
}
