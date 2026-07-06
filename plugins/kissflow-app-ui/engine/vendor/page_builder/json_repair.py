"""
JSON Repair Utility
Handles common LLM JSON output issues.
"""

import json
import logging
import re
from typing import Any


def parse_json_from_response(raw: str) -> Any:
    """
    Attempt to extract and parse JSON from an LLM response.

    Handles markdown code fences, trailing commas, single-line comments,
    and extracts the outermost JSON object.

    Raises:
        ValueError: If JSON cannot be parsed.
    """
    logging.info("JSONRepair:: raw: %s", raw)
    if not isinstance(raw, str):
        raise ValueError("Expected string input")

    text = raw.strip()

    # Strip markdown code fences
    fence_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Remove trailing commas before } or ]
    text = re.sub(r",\s*([}\]])", r"\1", text)

    # Remove single-line comments
    text = re.sub(r"//.*$", "", text, flags=re.MULTILINE)

    # Try again
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find the outermost { ... } or [ ... ]
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        extracted = text[first_brace : last_brace + 1]
        try:
            return json.loads(extracted)
        except json.JSONDecodeError:
            # Try with trailing comma fix on extracted
            fixed = re.sub(r",\s*([}\]])", r"\1", extracted)
            try:
                return json.loads(fixed)
            except json.JSONDecodeError:
                pass

    raise ValueError("Could not parse JSON from LLM response")
