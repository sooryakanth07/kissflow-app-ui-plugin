"""
Style Mapper
Maps friendly style names to full Kissflow metadata style keys.
Handles ref vs value wrapping for design tokens.
"""

from typing import Any, Dict, List, Optional


def should_use_ref(value: Any) -> bool:
    """Determine if a value should use { ref } format (design token) vs { value }."""
    if not isinstance(value, str):
        return False
    if value.startswith("Color."):
        return True
    if value.startswith("Font."):
        return True
    if value.startswith("Shadow."):
        return True
    if value.startswith("Line.Height."):
        return True
    if value.startswith("Letter.Spacing."):
        return True
    if value in ("none", "transparent"):
        return True
    return False


def wrap_value(value: Any) -> dict:
    """Wrap a value in the correct format."""
    if should_use_ref(value):
        return {"ref": value}
    return {"value": value}


def _get_prefix(widget_type: Optional[str], container_type: Optional[str]) -> str:
    """Get the style key prefix based on context."""
    if container_type == "Body":
        return "Body.Container"
    if container_type == "Popup":
        return "Popup.Container"
    if container_type == "Tab":
        return "Tab.Container"
    if container_type == "Repeater":
        return "Repeater.Container"
    if container_type:
        return "Container"
    return widget_type or "Container"


def _get_common_mappings(prefix: str) -> Dict[str, List[str]]:
    """Common style mappings for containers and as fallback."""
    return {
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
        "gap": [f"{prefix}.Row.Gap", f"{prefix}.Column.Gap"],
        "padding": [
            f"{prefix}.Padding.Top",
            f"{prefix}.Padding.Right",
            f"{prefix}.Padding.Bottom",
            f"{prefix}.Padding.Left",
        ],
        "paddingTop": [f"{prefix}.Padding.Top"],
        "paddingRight": [f"{prefix}.Padding.Right"],
        "paddingBottom": [f"{prefix}.Padding.Bottom"],
        "paddingLeft": [f"{prefix}.Padding.Left"],
        "margin": [
            f"{prefix}.Margin.Top",
            f"{prefix}.Margin.Right",
            f"{prefix}.Margin.Bottom",
            f"{prefix}.Margin.Left",
        ],
        "marginTop": [f"{prefix}.Margin.Top"],
        "marginRight": [f"{prefix}.Margin.Right"],
        "marginBottom": [f"{prefix}.Margin.Bottom"],
        "marginLeft": [f"{prefix}.Margin.Left"],
        "borderWidth": [
            f"{prefix}.Border.Top.Width",
            f"{prefix}.Border.Right.Width",
            f"{prefix}.Border.Bottom.Width",
            f"{prefix}.Border.Left.Width",
        ],
        "borderStyle": [f"{prefix}.Border.Style"],
        "borderColor": [f"{prefix}.Border.Color"],
        "borderRadius": [
            f"{prefix}.Border.Top.Left.Radius",
            f"{prefix}.Border.Top.Right.Radius",
            f"{prefix}.Border.Bottom.Left.Radius",
            f"{prefix}.Border.Bottom.Right.Radius",
        ],
        # Individual border sides
        "borderTopWidth": [f"{prefix}.Border.Top.Width"],
        "borderRightWidth": [f"{prefix}.Border.Right.Width"],
        "borderBottomWidth": [f"{prefix}.Border.Bottom.Width"],
        "borderLeftWidth": [f"{prefix}.Border.Left.Width"],
        # Individual border radius corners
        "borderTopLeftRadius": [f"{prefix}.Border.Top.Left.Radius"],
        "borderTopRightRadius": [f"{prefix}.Border.Top.Right.Radius"],
        "borderBottomLeftRadius": [f"{prefix}.Border.Bottom.Left.Radius"],
        "borderBottomRightRadius": [f"{prefix}.Border.Bottom.Right.Radius"],
        "hoverBorderWidth": [
            f"{prefix}.Hover.Border.Top.Width",
            f"{prefix}.Hover.Border.Right.Width",
            f"{prefix}.Hover.Border.Bottom.Width",
            f"{prefix}.Hover.Border.Left.Width",
        ],
        "hoverBorderStyle": [f"{prefix}.Hover.Border.Style"],
        "hoverBorderColor": [f"{prefix}.Hover.Border.Color"],
        "shadowType": [f"{prefix}.Shadow.Type"],
        "shadowColor": [f"{prefix}.Shadow.Color"],
        "hoverShadowType": [f"{prefix}.Hover.Shadow.Type"],
        "hoverShadowColor": [f"{prefix}.Hover.Shadow.Color"],
        "layout": [f"{prefix}.Flex.Direction"],
    }


def _get_button_mappings(size: str = "Base", button_type: str = "Primary") -> Dict[str, List[str]]:
    """Generate Button style mappings based on size and type."""
    s = size[0].upper() + size[1:].lower()
    t = button_type[0].upper() + button_type[1:].lower()

    return {
        # Background (type-dependent)
        "background": [f"Button.{t}.Bg.Color"],
        "bgColor": [f"Button.{t}.Bg.Color"],
        "hoverBgColor": [f"Button.{t}.Hover.Bg.Color"],
        # Typography — color is type-dependent, font metrics are size-dependent
        "color": [f"Button.{t}.Color"],
        "fontSize": [f"Button.{s}.Font.Size"],
        "fontWeight": [f"Button.{s}.Font.Weight"],
        "fontType": [f"Button.{s}.Font.Type"],
        "fontStyle": ["Button.Font.Style"],
        "lineHeight": [f"Button.{s}.Line.Height"],
        "letterSpacing": ["Button.Letter.Spacing"],
        "hoverColor": [f"Button.{t}.Hover.Color"],
        # Icon (type-dependent)
        "iconColor": [f"Button.{t}.Icon.Color"],
        "hoverIconColor": [f"Button.{t}.Hover.Icon.Color"],
        # Sizing (size-dependent)
        "width": [f"Button.{s}.Width"],
        "height": [f"Button.{s}.Height"],
        "minWidth": [f"Button.{s}.Min.Width"],
        "maxWidth": [f"Button.{s}.Max.Width"],
        "minHeight": [f"Button.{s}.Min.Height"],
        "maxHeight": [f"Button.{s}.Max.Height"],
        # Padding (size-dependent)
        "padding": [
            f"Button.{s}.Padding.Top",
            f"Button.{s}.Padding.Right",
            f"Button.{s}.Padding.Bottom",
            f"Button.{s}.Padding.Left",
        ],
        "paddingTop": [f"Button.{s}.Padding.Top"],
        "paddingRight": [f"Button.{s}.Padding.Right"],
        "paddingBottom": [f"Button.{s}.Padding.Bottom"],
        "paddingLeft": [f"Button.{s}.Padding.Left"],
        # Margin (static)
        "margin": [
            "Button.Margin.Top",
            "Button.Margin.Right",
            "Button.Margin.Bottom",
            "Button.Margin.Left",
        ],
        "marginTop": ["Button.Margin.Top"],
        "marginRight": ["Button.Margin.Right"],
        "marginBottom": ["Button.Margin.Bottom"],
        "marginLeft": ["Button.Margin.Left"],
        # Border (type-dependent)
        "borderWidth": [
            f"Button.{t}.Border.Top.Width",
            f"Button.{t}.Border.Right.Width",
            f"Button.{t}.Border.Bottom.Width",
            f"Button.{t}.Border.Left.Width",
        ],
        "borderStyle": ["Button.Border.Style"],
        "borderColor": [f"Button.{t}.Border.Color"],
        "borderRadius": [
            f"Button.{t}.Border.Top.Left.Radius",
            f"Button.{t}.Border.Top.Right.Radius",
            f"Button.{t}.Border.Bottom.Left.Radius",
            f"Button.{t}.Border.Bottom.Right.Radius",
        ],
        "hoverBorderWidth": [
            f"Button.{t}.Hover.Border.Top.Width",
            f"Button.{t}.Hover.Border.Right.Width",
            f"Button.{t}.Hover.Border.Bottom.Width",
            f"Button.{t}.Hover.Border.Left.Width",
        ],
        "hoverBorderColor": [f"Button.{t}.Hover.Border.Color"],
        # Shadow
        "shadowType": ["Button.Shadow.Type"],
        "shadowColor": ["Button.Shadow.Color"],
        "hoverShadowColor": ["Button.Hover.Shadow.Color"],
    }


def _get_progress_bar_mappings(chart_type: str = "Linear") -> Dict[str, List[str]]:
    """Generate ProgressBar style mappings based on chartType (linear/circular/semicircular)."""
    ct = chart_type[0].upper() + chart_type[1:].lower()

    return {
        # Background
        "bgColor": ["Progressbar.Bg.Color"],
        "background": ["Progressbar.Bg.Color"],
        # Bar-specific (static)
        "barColor": ["Progressbar.Bar.Color"],
        "barFillColor": ["Progressbar.Bar.Fill.Color"],
        "barHeight": ["Progressbar.Bar.Height"],
        "linecap": ["Progressbar.Bar.Linecap"],
        # Label typography (static)
        "labelColor": ["Progressbar.Label.Color"],
        "labelFontSize": ["Progressbar.Label.Font.Size"],
        "labelFontWeight": ["Progressbar.Label.Font.Weight"],
        # Help text typography (static)
        "helpTextColor": ["Progressbar.HelpText.Color"],
        "helpTextFontSize": ["Progressbar.HelpText.Font.Size"],
        "helpTextFontWeight": ["Progressbar.HelpText.Font.Weight"],
        # Value typography (chartType-dependent for font size)
        "valueColor": ["Progressbar.Value.Color"],
        "valueFontSize": [f"Progressbar.{ct}.Value.Font.Size"],
        "valueFontWeight": ["Progressbar.Value.Font.Weight"],
        # Sizing (chartType-dependent)
        "width": [f"Progressbar.{ct}.Width"],
        "height": [f"Progressbar.{ct}.Height"],
        "minWidth": ["Progressbar.Min.Width"],
        "maxWidth": ["Progressbar.Max.Width"],
        "minHeight": ["Progressbar.Min.Height"],
        "maxHeight": ["Progressbar.Max.Height"],
        # Padding
        "padding": [
            "Progressbar.Padding.Top",
            "Progressbar.Padding.Right",
            "Progressbar.Padding.Bottom",
            "Progressbar.Padding.Left",
        ],
        "paddingTop": ["Progressbar.Padding.Top"],
        "paddingRight": ["Progressbar.Padding.Right"],
        "paddingBottom": ["Progressbar.Padding.Bottom"],
        "paddingLeft": ["Progressbar.Padding.Left"],
        # Margin
        "margin": [
            "Progressbar.Margin.Top",
            "Progressbar.Margin.Right",
            "Progressbar.Margin.Bottom",
            "Progressbar.Margin.Left",
        ],
        "marginTop": ["Progressbar.Margin.Top"],
        "marginRight": ["Progressbar.Margin.Right"],
        "marginBottom": ["Progressbar.Margin.Bottom"],
        "marginLeft": ["Progressbar.Margin.Left"],
        # Border
        "borderWidth": [
            "Progressbar.Border.Top.Width",
            "Progressbar.Border.Right.Width",
            "Progressbar.Border.Bottom.Width",
            "Progressbar.Border.Left.Width",
        ],
        "borderStyle": ["Progressbar.Border.Style"],
        "borderColor": ["Progressbar.Border.Color"],
        "borderRadius": [
            "Progressbar.Border.Top.Left.Radius",
            "Progressbar.Border.Top.Right.Radius",
            "Progressbar.Border.Bottom.Left.Radius",
            "Progressbar.Border.Bottom.Right.Radius",
        ],
        "hoverBorderColor": ["Progressbar.Hover.Border.Color"],
        # Shadow
        "shadowType": ["Progressbar.Shadow.Type"],
        "shadowColor": ["Progressbar.Shadow.Color"],
    }


# Widget-specific style mappings
WIDGET_STYLE_MAPPINGS: Dict[str, Dict[str, List[str]]] = {
    "Label": {
        "bgColor": ["Label.Bg.Color"],
        "background": ["Label.Bg.Color"],
        "hoverBgColor": ["Label.Hover.Bg.Color"],
        "color": ["Label.Color"],
        "fontSize": ["Label.Font.Size"],
        "fontWeight": ["Label.Font.Weight"],
        "fontType": ["Label.Font.Type"],
        "fontStyle": ["Label.Font.Style"],
        "lineHeight": ["Label.Line.Height"],
        "letterSpacing": ["Label.Letter.Spacing"],
        "textAlign": ["Label.Text.Align"],
        "hoverColor": ["Label.Hover.Color"],
        "hoverFontWeight": ["Label.Hover.Font.Weight"],
        "width": ["Label.Width"],
        "height": ["Label.Height"],
        "minWidth": ["Label.Min.Width"],
        "maxWidth": ["Label.Max.Width"],
        "minHeight": ["Label.Min.Height"],
        "maxHeight": ["Label.Max.Height"],
        "overflow": ["Label.Overflow"],
        "padding": ["Label.Padding.Top", "Label.Padding.Right", "Label.Padding.Bottom", "Label.Padding.Left"],
        "paddingTop": ["Label.Padding.Top"],
        "paddingRight": ["Label.Padding.Right"],
        "paddingBottom": ["Label.Padding.Bottom"],
        "paddingLeft": ["Label.Padding.Left"],
        "margin": ["Label.Margin.Top", "Label.Margin.Right", "Label.Margin.Bottom", "Label.Margin.Left"],
        "marginTop": ["Label.Margin.Top"],
        "marginRight": ["Label.Margin.Right"],
        "marginBottom": ["Label.Margin.Bottom"],
        "marginLeft": ["Label.Margin.Left"],
        "borderWidth": [
            "Label.Border.Top.Width",
            "Label.Border.Right.Width",
            "Label.Border.Bottom.Width",
            "Label.Border.Left.Width",
        ],
        "borderTopWidth": ["Label.Border.Top.Width"],
        "borderRightWidth": ["Label.Border.Right.Width"],
        "borderBottomWidth": ["Label.Border.Bottom.Width"],
        "borderLeftWidth": ["Label.Border.Left.Width"],
        "borderStyle": ["Label.Border.Style"],
        "borderColor": ["Label.Border.Color"],
        "borderRadius": [
            "Label.Border.Top.Left.Radius",
            "Label.Border.Top.Right.Radius",
            "Label.Border.Bottom.Left.Radius",
            "Label.Border.Bottom.Right.Radius",
        ],
        "hoverBorderColor": ["Label.Hover.Border.Color"],
    },
    "Card": {
        "bgColor": ["Card.Bg.Color"],
        "background": ["Card.Bg.Color"],
        "hoverBgColor": ["Card.Hover.Bg.Color"],
        "width": ["Card.Width"],
        "height": ["Card.Height"],
        "minWidth": ["Card.Min.Width"],
        "maxWidth": ["Card.Max.Width"],
        "minHeight": ["Card.Min.Height"],
        "maxHeight": ["Card.Max.Height"],
        "padding": ["Card.Padding.Top", "Card.Padding.Right", "Card.Padding.Bottom", "Card.Padding.Left"],
        "paddingTop": ["Card.Padding.Top"],
        "paddingRight": ["Card.Padding.Right"],
        "paddingBottom": ["Card.Padding.Bottom"],
        "paddingLeft": ["Card.Padding.Left"],
        "margin": ["Card.Margin.Top", "Card.Margin.Right", "Card.Margin.Bottom", "Card.Margin.Left"],
        "marginTop": ["Card.Margin.Top"],
        "marginRight": ["Card.Margin.Right"],
        "marginBottom": ["Card.Margin.Bottom"],
        "marginLeft": ["Card.Margin.Left"],
        "borderWidth": [
            "Card.Border.Top.Width",
            "Card.Border.Right.Width",
            "Card.Border.Bottom.Width",
            "Card.Border.Left.Width",
        ],
        "borderStyle": ["Card.Border.Style"],
        "borderColor": ["Card.Border.Color"],
        "borderRadius": [
            "Card.Border.Top.Left.Radius",
            "Card.Border.Top.Right.Radius",
            "Card.Border.Bottom.Left.Radius",
            "Card.Border.Bottom.Right.Radius",
        ],
        "hoverBorderWidth": [
            "Card.Hover.Border.Top.Width",
            "Card.Hover.Border.Right.Width",
            "Card.Hover.Border.Bottom.Width",
            "Card.Hover.Border.Left.Width",
        ],
        "hoverBorderColor": ["Card.Hover.Border.Color"],
        "shadowType": ["Card.Shadow.Type"],
        "shadowColor": ["Card.Shadow.Color"],
        "hoverShadowType": ["Card.Hover.Shadow.Type"],
        "hoverShadowColor": ["Card.Hover.Shadow.Color"],
        "valueColor": ["Card.Value.Color"],
        "valueFontSize": ["Card.Value.Font.Size"],
        "valueFontWeight": ["Card.Value.Font.Weight"],
        "valueFontType": ["Card.Value.Font.Type"],
        "valueLineHeight": ["Card.Value.Line.Height"],
        "valueLetterSpacing": ["Card.Value.Letter.Spacing"],
        "valueFontStyle": ["Card.Value.Font.Style"],
        "descriptionColor": ["Card.Description.Color"],
        "descriptionFontSize": ["Card.Description.Font.Size"],
        "descriptionFontWeight": ["Card.Description.Font.Weight"],
        "descriptionFontType": ["Card.Description.Font.Type"],
        "descriptionLineHeight": ["Card.Description.Line.Height"],
        "descriptionLetterSpacing": ["Card.Description.Letter.Spacing"],
        "descriptionFontStyle": ["Card.Description.Font.Style"],
        "iconColor": ["Card.Icon.Color"],
        "iconBgColor": ["Card.Icon.Container.Bg.Color"],
        "iconWidth": ["Card.Icon.Container.Width"],
        "iconHeight": ["Card.Icon.Container.Height"],
        "iconPadding": [
            "Card.Icon.Container.Padding.Top",
            "Card.Icon.Container.Padding.Right",
            "Card.Icon.Container.Padding.Bottom",
            "Card.Icon.Container.Padding.Left",
        ],
        "iconBorderWidth": [
            "Card.Icon.Container.Border.Top.Width",
            "Card.Icon.Container.Border.Right.Width",
            "Card.Icon.Container.Border.Bottom.Width",
            "Card.Icon.Container.Border.Left.Width",
        ],
        "iconBorderStyle": ["Card.Icon.Container.Border.Style"],
        "iconBorderColor": ["Card.Icon.Container.Border.Color"],
        "iconBorderRadius": [
            "Card.Icon.Container.Border.Top.Left.Radius",
            "Card.Icon.Container.Border.Top.Right.Radius",
            "Card.Icon.Container.Border.Bottom.Left.Radius",
            "Card.Icon.Container.Border.Bottom.Right.Radius",
        ],
        "iconShadowType": ["Card.Icon.Container.Shadow.Type"],
        "iconShadowColor": ["Card.Icon.Container.Shadow.Color"],
    },
    "Icon": {
        "bgColor": ["Icon.Bg.Color"],
        "background": ["Icon.Bg.Color"],
        "hoverBgColor": ["Icon.Hover.Bg.Color"],
        "color": ["Icon.Color"],
        "hoverColor": ["Icon.Hover.Color"],
        "badgeColor": ["Icon.Badge.Color"],
        "size": ["Icon.Size"],
        "sizeType": ["Icon.Size.Type"],
        "justifyContent": ["Icon.Justify.Content"],
        "alignItems": ["Icon.Align.Items"],
        "width": ["Icon.Width"],
        "height": ["Icon.Height"],
        "minWidth": ["Icon.Min.Width"],
        "maxWidth": ["Icon.Max.Width"],
        "minHeight": ["Icon.Min.Height"],
        "maxHeight": ["Icon.Max.Height"],
        "padding": ["Icon.Padding.Top", "Icon.Padding.Right", "Icon.Padding.Bottom", "Icon.Padding.Left"],
        "paddingTop": ["Icon.Padding.Top"],
        "paddingRight": ["Icon.Padding.Right"],
        "paddingBottom": ["Icon.Padding.Bottom"],
        "paddingLeft": ["Icon.Padding.Left"],
        "margin": ["Icon.Margin.Top", "Icon.Margin.Right", "Icon.Margin.Bottom", "Icon.Margin.Left"],
        "marginTop": ["Icon.Margin.Top"],
        "marginRight": ["Icon.Margin.Right"],
        "marginBottom": ["Icon.Margin.Bottom"],
        "marginLeft": ["Icon.Margin.Left"],
        "borderWidth": [
            "Icon.Border.Top.Width",
            "Icon.Border.Right.Width",
            "Icon.Border.Bottom.Width",
            "Icon.Border.Left.Width",
        ],
        "borderStyle": ["Icon.Border.Style"],
        "borderColor": ["Icon.Border.Color"],
        "borderRadius": [
            "Icon.Border.Top.Left.Radius",
            "Icon.Border.Top.Right.Radius",
            "Icon.Border.Bottom.Left.Radius",
            "Icon.Border.Bottom.Right.Radius",
        ],
        "hoverBorderColor": ["Icon.Hover.Border.Color"],
        "shadowType": ["Icon.Shadow.Type"],
        "shadowColor": ["Icon.Shadow.Color"],
        "hoverShadowType": ["Icon.Hover.Shadow.Type"],
        "hoverShadowColor": ["Icon.Hover.Shadow.Color"],
    },
    "Image": {
        "bgColor": ["Image.Bg.Color"],
        "background": ["Image.Bg.Color"],
        "hoverBgColor": ["Image.Hover.Bg.Color"],
        "objectFit": ["Image.Object.Fit"],
        "opacity": ["Image.Opacity"],
        "hoverOpacity": ["Image.Hover.Opacity"],
        "width": ["Image.Width"],
        "height": ["Image.Height"],
        "minWidth": ["Image.Min.Width"],
        "maxWidth": ["Image.Max.Width"],
        "minHeight": ["Image.Min.Height"],
        "maxHeight": ["Image.Max.Height"],
        "padding": ["Image.Padding.Top", "Image.Padding.Right", "Image.Padding.Bottom", "Image.Padding.Left"],
        "paddingTop": ["Image.Padding.Top"],
        "paddingRight": ["Image.Padding.Right"],
        "paddingBottom": ["Image.Padding.Bottom"],
        "paddingLeft": ["Image.Padding.Left"],
        "margin": ["Image.Margin.Top", "Image.Margin.Right", "Image.Margin.Bottom", "Image.Margin.Left"],
        "marginTop": ["Image.Margin.Top"],
        "marginRight": ["Image.Margin.Right"],
        "marginBottom": ["Image.Margin.Bottom"],
        "marginLeft": ["Image.Margin.Left"],
        "borderWidth": [
            "Image.Border.Top.Width",
            "Image.Border.Right.Width",
            "Image.Border.Bottom.Width",
            "Image.Border.Left.Width",
        ],
        "borderStyle": ["Image.Border.Style"],
        "borderColor": ["Image.Border.Color"],
        "borderRadius": [
            "Image.Border.Top.Left.Radius",
            "Image.Border.Top.Right.Radius",
            "Image.Border.Bottom.Left.Radius",
            "Image.Border.Bottom.Right.Radius",
        ],
        "hoverBorderWidth": [
            "Image.Hover.Border.Top.Width",
            "Image.Hover.Border.Right.Width",
            "Image.Hover.Border.Bottom.Width",
            "Image.Hover.Border.Left.Width",
        ],
        "hoverBorderStyle": ["Image.Hover.Border.Style"],
        "hoverBorderColor": ["Image.Hover.Border.Color"],
        "shadowType": ["Image.Shadow.Type"],
        "shadowColor": ["Image.Shadow.Color"],
        "hoverShadowType": ["Image.Hover.Shadow.Type"],
        "hoverShadowColor": ["Image.Hover.Shadow.Color"],
    },
    "Divider": {
        "thickness": ["Divider.Thickness"],
        "dividerStyle": ["Divider.Style"],
        "color": ["Divider.Color"],
        "contentAlignment": ["Divider.Content.Alignment"],
        "contentColor": ["Divider.Content.Color"],
        "contentFontSize": ["Divider.Content.Font.Size"],
        "contentFontWeight": ["Divider.Content.Font.Weight"],
        "contentFontType": ["Divider.Content.Font.Type"],
        "contentLineHeight": ["Divider.Content.Line.Height"],
        "contentLetterSpacing": ["Divider.Content.Letter.Spacing"],
        "contentFontStyle": ["Divider.Content.Font.Style"],
        "width": ["Divider.Width"],
        "height": ["Divider.Height"],
        "minWidth": ["Divider.Min.Width"],
        "maxWidth": ["Divider.Max.Width"],
        "minHeight": ["Divider.Min.Height"],
        "maxHeight": ["Divider.Max.Height"],
        "padding": ["Divider.Padding.Top", "Divider.Padding.Right", "Divider.Padding.Bottom", "Divider.Padding.Left"],
        "paddingTop": ["Divider.Padding.Top"],
        "paddingRight": ["Divider.Padding.Right"],
        "paddingBottom": ["Divider.Padding.Bottom"],
        "paddingLeft": ["Divider.Padding.Left"],
        "margin": ["Divider.Margin.Top", "Divider.Margin.Right", "Divider.Margin.Bottom", "Divider.Margin.Left"],
        "marginTop": ["Divider.Margin.Top"],
        "marginRight": ["Divider.Margin.Right"],
        "marginBottom": ["Divider.Margin.Bottom"],
        "marginLeft": ["Divider.Margin.Left"],
    },
    "Hyperlink": {
        "bgColor": ["Hyperlink.Bg.Color"],
        "background": ["Hyperlink.Bg.Color"],
        "hoverBgColor": ["Hyperlink.Hover.Bg.Color"],
        "color": ["Hyperlink.Color"],
        "fontSize": ["Hyperlink.Font.Size"],
        "fontWeight": ["Hyperlink.Font.Weight"],
        "fontType": ["Hyperlink.Font.Type"],
        "fontStyle": ["Hyperlink.Font.Style"],
        "lineHeight": ["Hyperlink.Line.Height"],
        "letterSpacing": ["Hyperlink.Letter.Spacing"],
        "hoverColor": ["Hyperlink.Hover.Color"],
        "hoverFontWeight": ["Hyperlink.Hover.Font.Weight"],
        "width": ["Hyperlink.Width"],
        "height": ["Hyperlink.Height"],
        "minWidth": ["Hyperlink.Min.Width"],
        "maxWidth": ["Hyperlink.Max.Width"],
        "minHeight": ["Hyperlink.Min.Height"],
        "maxHeight": ["Hyperlink.Max.Height"],
        "overflow": ["Hyperlink.Overflow"],
        "padding": [
            "Hyperlink.Padding.Top",
            "Hyperlink.Padding.Right",
            "Hyperlink.Padding.Bottom",
            "Hyperlink.Padding.Left",
        ],
        "paddingTop": ["Hyperlink.Padding.Top"],
        "paddingRight": ["Hyperlink.Padding.Right"],
        "paddingBottom": ["Hyperlink.Padding.Bottom"],
        "paddingLeft": ["Hyperlink.Padding.Left"],
        "margin": [
            "Hyperlink.Margin.Top",
            "Hyperlink.Margin.Right",
            "Hyperlink.Margin.Bottom",
            "Hyperlink.Margin.Left",
        ],
        "marginTop": ["Hyperlink.Margin.Top"],
        "marginRight": ["Hyperlink.Margin.Right"],
        "marginBottom": ["Hyperlink.Margin.Bottom"],
        "marginLeft": ["Hyperlink.Margin.Left"],
        "borderWidth": [
            "Hyperlink.Border.Top.Width",
            "Hyperlink.Border.Right.Width",
            "Hyperlink.Border.Bottom.Width",
            "Hyperlink.Border.Left.Width",
        ],
        "borderStyle": ["Hyperlink.Border.Style"],
        "borderColor": ["Hyperlink.Border.Color"],
        "borderRadius": [
            "Hyperlink.Border.Top.Left.Radius",
            "Hyperlink.Border.Top.Right.Radius",
            "Hyperlink.Border.Bottom.Left.Radius",
            "Hyperlink.Border.Bottom.Right.Radius",
        ],
        "hoverBorderColor": ["Hyperlink.Hover.Border.Color"],
    },
    # ProgressBar is handled dynamically via _get_progress_bar_mappings() — not in static map
    "RichText": {
        "bgColor": ["Richtext.Bg.Color"],
        "background": ["Richtext.Bg.Color"],
        "width": ["Richtext.Width"],
        "height": ["Richtext.Height"],
        "minWidth": ["Richtext.Min.Width"],
        "maxWidth": ["Richtext.Max.Width"],
        "minHeight": ["Richtext.Min.Height"],
        "maxHeight": ["Richtext.Max.Height"],
        "overflow": ["Richtext.Overflow"],
        "padding": [
            "Richtext.Padding.Top",
            "Richtext.Padding.Right",
            "Richtext.Padding.Bottom",
            "Richtext.Padding.Left",
        ],
        "paddingTop": ["Richtext.Padding.Top"],
        "paddingRight": ["Richtext.Padding.Right"],
        "paddingBottom": ["Richtext.Padding.Bottom"],
        "paddingLeft": ["Richtext.Padding.Left"],
        "margin": ["Richtext.Margin.Top", "Richtext.Margin.Right", "Richtext.Margin.Bottom", "Richtext.Margin.Left"],
        "marginTop": ["Richtext.Margin.Top"],
        "marginRight": ["Richtext.Margin.Right"],
        "marginBottom": ["Richtext.Margin.Bottom"],
        "marginLeft": ["Richtext.Margin.Left"],
        "borderWidth": [
            "Richtext.Border.Top.Width",
            "Richtext.Border.Right.Width",
            "Richtext.Border.Bottom.Width",
            "Richtext.Border.Left.Width",
        ],
        "borderStyle": ["Richtext.Border.Style"],
        "borderColor": ["Richtext.Border.Color"],
        "borderRadius": [
            "Richtext.Border.Top.Left.Radius",
            "Richtext.Border.Top.Right.Radius",
            "Richtext.Border.Bottom.Left.Radius",
            "Richtext.Border.Bottom.Right.Radius",
        ],
        "hoverBorderColor": ["Richtext.Hover.Border.Color"],
        "shadowType": ["Richtext.Shadow.Type"],
        "shadowColor": ["Richtext.Shadow.Color"],
    },
    "IFrame": {
        "bgColor": ["Iframe.Bg.Color"],
        "background": ["Iframe.Bg.Color"],
        "width": ["Iframe.Width"],
        "height": ["Iframe.Height"],
        "minWidth": ["Iframe.Min.Width"],
        "maxWidth": ["Iframe.Max.Width"],
        "minHeight": ["Iframe.Min.Height"],
        "maxHeight": ["Iframe.Max.Height"],
        "overflow": ["Iframe.Overflow"],
        "padding": ["Iframe.Padding.Top", "Iframe.Padding.Right", "Iframe.Padding.Bottom", "Iframe.Padding.Left"],
        "paddingTop": ["Iframe.Padding.Top"],
        "paddingRight": ["Iframe.Padding.Right"],
        "paddingBottom": ["Iframe.Padding.Bottom"],
        "paddingLeft": ["Iframe.Padding.Left"],
        "margin": ["Iframe.Margin.Top", "Iframe.Margin.Right", "Iframe.Margin.Bottom", "Iframe.Margin.Left"],
        "marginTop": ["Iframe.Margin.Top"],
        "marginRight": ["Iframe.Margin.Right"],
        "marginBottom": ["Iframe.Margin.Bottom"],
        "marginLeft": ["Iframe.Margin.Left"],
        "borderWidth": [
            "Iframe.Border.Top.Width",
            "Iframe.Border.Right.Width",
            "Iframe.Border.Bottom.Width",
            "Iframe.Border.Left.Width",
        ],
        "borderStyle": ["Iframe.Border.Style"],
        "borderColor": ["Iframe.Border.Color"],
        "borderRadius": [
            "Iframe.Border.Top.Left.Radius",
            "Iframe.Border.Top.Right.Radius",
            "Iframe.Border.Bottom.Left.Radius",
            "Iframe.Border.Bottom.Right.Radius",
        ],
        "hoverBorderColor": ["Iframe.Hover.Border.Color"],
        "shadowType": ["Iframe.Shadow.Type"],
        "shadowColor": ["Iframe.Shadow.Color"],
    },
    "ChartReport": {
        "width": ["Chart.Width"],
        "height": ["Chart.Height"],
    },
    "ProcessTable": {
        "width": ["Table.Width"],
        "height": ["Table.Height"],
        "minWidth": ["Table.Min.Width"],
        "maxWidth": ["Table.Max.Width"],
        "minHeight": ["Table.Min.Height"],
        "maxHeight": ["Table.Max.Height"],
    },
    "DataformTable": {
        "width": ["Table.Width"],
        "height": ["Table.Height"],
        "minWidth": ["Table.Min.Width"],
        "maxWidth": ["Table.Max.Width"],
        "minHeight": ["Table.Min.Height"],
        "maxHeight": ["Table.Max.Height"],
    },
    "Popup": {
        "width": ["Popup.Width"],
        "background": ["Popup.Background"],
        "headerColor": ["Popup.Header.Color"],
        "borderRadius": [
            "Popup.Border.Top.Left.Radius",
            "Popup.Border.Top.Right.Radius",
            "Popup.Border.Bottom.Left.Radius",
            "Popup.Border.Bottom.Right.Radius",
        ],
    },
}


def _resolve_style_keys(
    friendly_name: str,
    widget_type: Optional[str],
    container_type: Optional[str],
    context: Optional[dict] = None,
) -> List[str]:
    """Resolve a friendly style name to full metadata key(s)."""
    context = context or {}

    if widget_type == "Button":
        button_mappings = _get_button_mappings(
            context.get("buttonSize", "base"),
            context.get("buttonType", "primary"),
        )
        if friendly_name in button_mappings:
            return button_mappings[friendly_name]

    if widget_type == "ProgressBar":
        pb_mappings = _get_progress_bar_mappings(context.get("progressBarChartType", "linear"))
        if friendly_name in pb_mappings:
            return pb_mappings[friendly_name]

    if widget_type and widget_type not in ("Button", "ProgressBar") and widget_type in WIDGET_STYLE_MAPPINGS:
        widget_mapping = WIDGET_STYLE_MAPPINGS[widget_type].get(friendly_name)
        if widget_mapping:
            return widget_mapping

    prefix = _get_prefix(widget_type, container_type)
    common_mapping = _get_common_mappings(prefix)
    if friendly_name in common_mapping:
        return common_mapping[friendly_name]

    return [friendly_name]


def _expand_css_shorthands(style_obj: dict) -> None:
    """
    Expand CSS shorthand values into individual properties.
    e.g., "padding": "4px 8px" -> paddingTop: "4px", paddingRight: "8px", ...
    Mutates style_obj in place.
    """
    shorthands = {
        "padding": ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
        "margin": ["marginTop", "marginRight", "marginBottom", "marginLeft"],
        "borderWidth": ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"],
    }

    for prop, sides in shorthands.items():
        value = style_obj.get(prop)
        if not isinstance(value, str):
            continue

        parts = value.strip().split()
        if len(parts) == 1:
            continue  # single value like "4px" is fine — maps to all 4 sides

        if len(parts) == 2:
            top, right = parts
            bottom, left = top, right
        elif len(parts) == 3:
            top, right, bottom = parts
            left = right
        elif len(parts) == 4:
            top, right, bottom, left = parts
        else:
            continue

        # Replace shorthand with individual values (only if not already set)
        del style_obj[prop]
        if not style_obj.get(sides[0]):
            style_obj[sides[0]] = top
        if not style_obj.get(sides[1]):
            style_obj[sides[1]] = right
        if not style_obj.get(sides[2]):
            style_obj[sides[2]] = bottom
        if not style_obj.get(sides[3]):
            style_obj[sides[3]] = left


_UNSUPPORTED_PROPERTIES = frozenset(
    [
        "flex",
        "flex-grow",
        "flexGrow",
        "flex-shrink",
        "flexShrink",
        "flex-basis",
        "flexBasis",
    ]
)


def transform_styles(
    style_obj: dict,
    widget_type: Optional[str] = None,
    container_type: Optional[str] = None,
    context: Optional[dict] = None,
) -> dict:
    """Transform a style object from intermediate (friendly) format to full metadata format."""
    if not style_obj or not isinstance(style_obj, dict):
        return {}

    # Normalize common LLM mistakes
    if style_obj.get("flexWrap") == "no-wrap":
        style_obj["flexWrap"] = "nowrap"

    # Expand CSS shorthand values (e.g., "padding": "4px 8px" -> individual sides)
    _expand_css_shorthands(style_obj)

    # Safety net: if any border width is non-zero but borderColor is missing,
    # default to a neutral gray instead of Kissflow's default black.
    if not style_obj.get("borderColor"):
        width_keys = ("borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth")
        has_non_zero = any(
            isinstance(style_obj.get(k), str) and any(c in style_obj[k] for c in "123456789")
            for k in width_keys
        )
        if has_non_zero:
            style_obj["borderColor"] = "Color.Gray.200"

    result = {}
    for friendly_name, value in style_obj.items():
        if friendly_name == "layout":
            continue
        if friendly_name in _UNSUPPORTED_PROPERTIES:
            continue

        full_keys = _resolve_style_keys(friendly_name, widget_type, container_type, context)
        wrapped = wrap_value(value)

        for key in full_keys:
            result[key] = wrapped

    return result


# Public aliases for cross-module use (e.g., reverse_style_mapper.py).
# Mirrors the JS exports: getButtonMappings, getProgressBarMappings.
get_button_mappings = _get_button_mappings
get_progress_bar_mappings = _get_progress_bar_mappings
