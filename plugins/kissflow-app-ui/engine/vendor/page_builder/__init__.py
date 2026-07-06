"""
Page Builder - Intermediate JSON to Kissflow Page Metadata Transformer

Generates complete Kissflow page builder metadata from a compact intermediate JSON format.
The LLM generates a small nested JSON (~100-200 lines), and a deterministic transformer
converts it to the full flat Kissflow metadata (~1000+ lines).
"""

from utils.page_builder.intermediate_validator import validate_intermediate
from utils.page_builder.json_patch import apply_patch, normalize_patch_response, validate_patches
from utils.page_builder.json_repair import parse_json_from_response
from utils.page_builder.metadata_validator import validate_metadata
from utils.page_builder.reverse_style_mapper import reverse_styles
from utils.page_builder.reverse_transformer import reverse_transform
from utils.page_builder.transformer import rewrite_page_id, transform

__all__ = [
    "transform",
    "rewrite_page_id",
    "validate_intermediate",
    "validate_metadata",
    "parse_json_from_response",
    "reverse_transform",
    "reverse_styles",
    "apply_patch",
    "validate_patches",
    "normalize_patch_response",
]
