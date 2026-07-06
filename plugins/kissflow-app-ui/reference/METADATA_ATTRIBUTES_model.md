# Kissflow MODEL-side Metadata — Exhaustive Attribute Reference

> **Source repo:** `/Users/dinesh/Projects/kissflow-xg` (company's own source — authorized).
> **Scope:** Every attribute (`self.get("X")` / `self.get(CONST)`) and every `Parent::Child`
> relation string used by each MODEL-side metadata class in
> `businessobject/core/server/metadata/__init__.py`, with constants resolved to their literal
> string values. Every attribute and enum member is cited as `file:line`.
> Anything not directly confirmed in source is marked **(unverified)**.

### File abbreviations used in citations
| Abbrev | Real path |
|---|---|
| `meta/__init__.py` | `businessobject/core/server/metadata/__init__.py` |
| `blob.py` | `base/base/constants/metadata/metadata_blob.py` |
| `meta_const.py` | `base/base/constants/metadata/__init__.py` |
| `base_const.py` | `base/base/constants/__init__.py` |
| `engine.py` | `businessobject/core/engine/__init__.py` |
| `funcdef.py` | `businessobject/core/engine/function/function_definition.py` |
| `datatypes.py` | `businessobject/core/engine/function/__init__.py` |
| `date_time.py` | `base/base/constants/date_time.py` |
| `bo_const.py` | `businessobject/core/server/constant.py` |
| `query_utils.py` | `businessobject/core/server/util/query_utils.py` |

### Architectural notes (read first)
- Metadata classes are **schemaless**: attributes are accessed dynamically via
  `self.get("AttrName")`. There are **no declared fields** — the complete attribute set per
  class is the union of every distinct key it reads (`meta/__init__.py:178-179`,
  the `get()` implementation).
- A blob document is keyed by object `Id`; `Kind` selects the Python class
  (`meta/__init__.py:163`, `:316`). Class map: `base_cls_kind_map = locals()`
  (`meta/__init__.py:1606`), plus `"Model" -> BaseModel` (`meta/__init__.py:1607`).
- Relations are stored as **arrays of child object IDs** under a `Parent::Child` key
  (one-to-many). Constants for these live in `class OneToMany` (`blob.py:37-185`).
- `"::"` is the cross-container delimiter (`meta/__init__.py:104`); `"."` the dot delimiter
  (`meta/__init__.py:105`).
- Field type-specific JSON is produced by dynamically-dispatched methods
  `get_additional_<type>_json_attributes` / `get_additional_<widget>_json_attributes`
  (`meta/__init__.py:924-929`). There are **no** separate per-type `Field` subclasses —
  all field behaviour lives in the single `Field` class.

---

## 1. BaseObject  (`class BaseObject` — `meta/__init__.py:117`)

Root of all non-model metadata objects (Field, Node, Condition, etc.).

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `Id` | string | yes | — | Object id (used as cache key) | `meta/__init__.py:121, 182` |
| `ModelId` | string | (model only) | — | Fallback id for models | `meta/__init__.py:121, 1575` |
| `Kind` | string | yes | — | Class selector for `get_class()` | `meta/__init__.py:163, 188` |
| `Name` | string | yes | — | Object name | `meta/__init__.py:185` |
| `BaseMetadata` | string (model id) | no | None | Parent metadata to merge in (`_load_base`) | `meta/__init__.py:135, 138, 206` |
| `ReferredModel` | string | no | None | Parent model (`get_parent_model`) | `meta/__init__.py:191` |
| `CollectionId` | string | no | `Id` | Mongo collection id | `meta/__init__.py:194`; const `meta_const.py:271` |
| `FlowType` | string (see FLOW_TYPE enum) | no | None | Owning flow type | `meta/__init__.py:209` |

`get()` definition: `meta/__init__.py:178-179`. `get_object_cross_reference` splits on `"::"`
(`meta/__init__.py:171-176`).

---

## 2. BaseModel / Model  (`class BaseModel` — `meta/__init__.py:380`; aliased `Model` at `:1607`)

A model document. Overrides id/kind/name to the `Model*` keys.

### Core attributes
| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `ModelId` | string | yes | — | Model id (`get_id`) | `meta/__init__.py:398, 444` |
| `ModelKind` | string | yes | — | Model kind (`get_kind`) | `meta/__init__.py:401` |
| `ModelName` | string | yes | — | Model display name | `meta/__init__.py:420` |
| `_meta_version` | string/int | no | None | Meta version | `meta/__init__.py:423` |
| `BaseMetadata` | string | no | None | Parent metadata merged recursively | `meta/__init__.py:426-428`; const `blob.py:217` |
| `BaseInterface` | string | no | None | Parent interface merged recursively | `meta/__init__.py:431-433`; const `blob.py:218` |
| `Fields` | object `{FieldName: FieldId}` | yes | — | Field name→id map | `meta/__init__.py:441-442, 464, 497, 588`; const `blob.py:250` |
| `Folder` | string | no | None | Folder id | `meta/__init__.py:500` |
| `ReadOnly` | bool | no | None | Read-only model | `meta/__init__.py:503` |
| `Suspended` | bool | no | None | Suspended model | `meta/__init__.py:506`; const `blob.py:220` |
| `_show_hidden_fields` | bool | no | None | Show hidden fields flag | `meta/__init__.py:509`; const `blob.py:350` |
| `Integration` | object | no | None | Integration config | `meta/__init__.py:580` |
| `Root` | string (flow id) | no | None | Root flow id (for `get_application_id`) | `meta/__init__.py:479`; const `blob.py:204` |
| `<Root>` → `_application_id` | string | no | None | App id read from `Root` sub-dict | `meta/__init__.py:480-482`; const `flow.FlowConstants.APPLICATION_ID` |
| `FilterParam` | object | no | `{}` | Filter parameters | `meta/__init__.py:485`; const `blob.py:297` |
| `SequenceNumber` | list | no | `[]` | Sequence-number field ids | `meta/__init__.py:476`; const `meta_const.FieldType.SEQUENCE_NUMBER` `meta_const.py:88` |
| `CustomComponent` | object | no | None | Custom component config | `meta/__init__.py:460`; const `blob.py:415` |
| `Security` | object | no | `{}` | Security block (see Security keys) | `meta/__init__.py:404`; const `base_const.SECURITY.SECURITY` `base_const.py:637` |
| `Appearance` | object | no | `{}` | Appearance block (card/title) | `meta/__init__.py:583, 598`; const `flow.Appearance.APPEARANCE` |
| `Appearance.CardFields` | list | no | — | Card-configured fields | `meta/__init__.py:584-585` |
| `Appearance.Title` | object | no | — | Title definition | `meta/__init__.py:601`; const `flow.Appearance.TITLE` |
| `Appearance.Title.TitleFields` | list | no | — | Title field ids | `meta/__init__.py:602`; const `flow.Appearance.TITLE_FIELDS` |

### Model relations (one-to-many — values are arrays/maps of child ids)
| Relation key | Literal value | Meaning | file:line |
|---|---|---|---|
| `Model::Model` | `"Model::Model"` | Child models map `{childId: childName}` | `meta/__init__.py:447`; `blob.py:110` |
| `Model::Row` | `"Model::Row"` | Layout rows | `blob.py:108` |
| `Model::Field` | `"Model::Field"` | Fields | `blob.py:109` |
| `Model::Column` | `"Model::Column"` | Layout columns | `blob.py:118` |
| `Model::Permission` | `"Model::Permission"` | Permissions | `blob.py:120` |
| `Model::Component` | `"Model::Component"` | Components | `blob.py:121` |
| `Model::Appearance` | `"Model::Appearance"` | Appearance | `blob.py:122` |
| `Model::Template` | `"Model::Template"` | Templates | `blob.py:115` |
| `Model::Header` / `Model::Footer` | `"Model::Header"` / `"Model::Footer"` | Print header/footer | `blob.py:116-117` |
| `Model::Status` / `Model::State` / `Model::Priority` | resp. literals | Workflow status/state/priority | `blob.py:112-114` |
| `Model::ProcessDef` | `"Model::ProcessDef"` | Process definition | `blob.py:111` |
| `Model::Format` | `"Model::Format"` | Format | `blob.py:119` |

### Security keys (sub-object under `Security`)  — `class SECURITY` `base_const.py:636-660`
| Key | Literal | file:line |
|---|---|---|
| `Security` | `"Security"` | `base_const.py:637` |
| `AllowAccess` | `"AllowAccess"` | `base_const.py:638` |
| `AllowAllFlows` | `"AllowAllFlows"` | `base_const.py:639` |
| `AllowAllModels` | `"AllowAllModels"` | `base_const.py:640` |
| `AllowAllFields` | `"AllowAllFields"` | `base_const.py:641` |
| `AllowedFieldsByFlows` | `"AllowedFieldsByFlows"` | `base_const.py:642` |
| `AllowedFlows` | `"AllowedFlows"` | `base_const.py:643` |
| `BlockedFlows` | `"BlockedFlows"` | `base_const.py:644` |
| `AllowedFields` | `"AllowedFields"` | `base_const.py:645` |
| `Fields` | `"Fields"` | `base_const.py:646` |
| `AllowPrint` | `"AllowPrint"` | `base_const.py:647` |
| `AllowDownload` | `"AllowDownload"` | `base_const.py:648` |
| `FieldAccessibility` | `"FieldAccessibility"` | `base_const.py:649` |
| `Impersonator` | `"Impersonator"` | `base_const.py:650` |
| `TriggersFromFlows` | `"TriggersFromFlows"` | `base_const.py:651` |
| `AllowTriggersFromAllFlows` | `"AllowTriggersFromAllFlows"` | `base_const.py:652` |
| `Permission` | `"Permission"` | `base_const.py:653` |
| `ExternalCommenterScope` | `"ExternalCommenterScope"` | `base_const.py:654` |

> `ModelMeta` system stub (`Model.py:1-14`) declares system fields `ModelVersion`,
> `RootProcessDef`, `Folder` (each `{Id, Name, Type:"String"}`).

---

## 3. ChildModel  (`class ChildModel(BaseModel)` — `meta/__init__.py:686`)

Inherits **all** BaseModel attributes. Adds child-table-specific keys.

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `MinRow` | int | no | None | Min rows in child table | `meta/__init__.py:720`; const `blob.py:280` |
| `MaxRow` | int | no | None | Max rows in child table | `meta/__init__.py:723`; const `blob.py:281` |

`get_container_id` = `parentId::childId` (`meta/__init__.py:692`); `get_query_id` = `childId.`
(`meta/__init__.py:695`); `is_child_model()` → True (`meta/__init__.py:698`).

---

## 4. Column (layout)  (`class Column(BaseObject)` — `meta/__init__.py:673`)

Resolves criteria arrays against its container model.

| Attribute / relation | Type/values | Meaning | file:line |
|---|---|---|---|
| `ColumnVisibility::Criteria` | array of criteria ids | Column visibility criteria | `meta/__init__.py:642, 650`; const `blob.py:54` |
| `ParentColumn` | string (column id) | Parent column id | `meta/__init__.py:635`; const `blob.py:326` |
| `IsHidden` | bool | Hidden flag | `meta/__init__.py:641, 649`; const `meta_const.MetadataConstants.IS_HIDDEN` `meta_const.py:258` |

> Generic `get_criteria(criteria_key, model)` resolves any `*::Criteria` array
> (`meta/__init__.py:674-683`). Column layout relations (from OneToMany):
> `Column::Row` (`blob.py:64,156`), `Column::Field` (`blob.py:65,159`),
> `Column::Permission` (`blob.py:157`), `Column::Model` (`blob.py:158`),
> `Row::Column` (`blob.py:45`).

---

## 5. Field  (`class Field(BaseObject)` — `meta/__init__.py:726`)

The richest object. **All** keys below are read via `self.get(...)` somewhere in the class.

### 5.1 Common Field attributes
| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `Type` | string (FieldType enum) | yes | — | Logical field type | `meta/__init__.py:732, 918` |
| `Widget` | string (Widget enum) | no | None | UI widget type | `meta/__init__.py:735, 921` |
| `DBType` | string (DBType enum) | no | None | Storage type | `meta/__init__.py:769, 893`; const `blob.py:211` |
| `Size` | string/int | no | None | Field size | `meta/__init__.py:738`; const `blob.py:299` |
| `Label` | string | no | None | Field label | `meta/__init__.py:816`; const `blob.py:197` |
| `DefaultValue` | any | no | None | Default value (Kind field → model kind) | `meta/__init__.py:818-821`; const `blob.py:274` |
| `Permission` | string (`Editable`/`ReadOnly`/`Hidden`/`Mandatory`) | no | None | Field permission level | `meta/__init__.py:832-834`; const `blob.py:210`, `meta_const.py:260` |
| `Required` | bool | no | None | Unconditional requirement | `meta/__init__.py:797`; const `blob.py:282` |
| `IsInternal` | bool | no | False | Internal field | `meta/__init__.py:809`; const `blob.py:354` |
| `IsHidden` | bool | no | None | Hidden field | `meta/__init__.py:864, 978`; const `blob.py:323` |
| `IsProtected` | bool | no | None | Protected (cross-flow) | `meta/__init__.py:1283`; const `blob.py:322` |
| `BaseMetadata` | string | no | None | Owning model id (set in `mix_fields`) | `meta/__init__.py:444, 811-812, 890, 1285` |
| `ParentColumn` | string | no | None | Parent column id (visibility) | `meta/__init__.py:961-963`; const `blob.py:326` |
| `Column` | string | no | None | Column id (legacy visibility) | `meta/__init__.py:969`; const `blob.py:238` |
| `IsParentColumnHidden` | bool | no | None | Legacy parent-hidden flag | `meta/__init__.py:970`; const `blob.py:327` |
| `Decimalpoint` | string/int | no | `DECIMAL_PRECISION`=8 | Decimal precision (Number/Currency) | `meta/__init__.py:933, 1023, 1037`; default `bo_const.py:163` |
| `MinValue` | number | no | None | Slider min | `meta/__init__.py:1033`; const `blob.py:410` |
| `MaxValue` | number | no | None | Slider max | `meta/__init__.py:1034`; const `blob.py:411` |
| `AllowHalf` | bool | no | None | StarRating half-step | `meta/__init__.py:1040`; const `blob.py:289` |
| `ComponentId` | string | no | None | Custom component id | `meta/__init__.py:782, 1030`; const `blob.py:414` |
| `DatasourceType` | string (FlowType) | no | None | Select source (Dataset/Form) | `meta/__init__.py:860`; const `blob.py:357` |
| `ReferredList` | string | no | None | Referred list (Select) | const `blob.py:325` (`REFERRED_LIST`) |

### 5.2 Field relations (arrays of child object ids)
| Relation key | Literal value | Meaning | file:line |
|---|---|---|---|
| `Field::QueryDefinition` | `"Field::QueryDefinition"` | Lookup/reference query def | `meta/__init__.py:779, 1059`; `blob.py:93` |
| `Field::Expression` | `"Field::Expression"` | Formula expression | `meta/__init__.py:873-877`; `blob.py:96` |
| `Field::Options` | `"Field::Options"` | Select options container | `meta/__init__.py:824-825` |
| `Field::Node` | `"Field::Node"` | Expression node list | `meta/__init__.py:887`; const `blob.py:95` (`OneToMany.Field.NODE`) |
| `Field::Constraint` | `"Field::Constraint"` | Constraints (e.g. Unique) | `meta/__init__.py:990`; `blob.py:53, 99` |
| `Field::RemoteLookup` | `"Field::RemoteLookup"` | Remote lookup def | `meta/__init__.py:914`; `blob.py:94` |
| `Field::Property` | `"Field::Property"` | Sequence-number properties | `meta/__init__.py:998`; const `blob.py:98` |
| `Field::Component` | `"Field::Component"` | Component | `blob.py:100` |
| `Field::RefreshField` | `"Field::RefreshField"` | Refresh fields | `blob.py:97` |
| `Field::AutofillGuideline` | `"Field::AutofillGuideline"` | Autofill guideline | `blob.py:101` |
| `Field::AutofillInstruction` | `"Field::AutofillInstruction"` | Autofill instruction | `blob.py:102` |
| `FieldRequirement::Criteria` | `"FieldRequirement::Criteria"` | Conditional-required criteria | `meta/__init__.py:803, 806`; `blob.py:52` |
| `ColumnVisibility::Criteria` | `"ColumnVisibility::Criteria"` | Conditional visibility | `meta/__init__.py:945, 947, 979`; `blob.py:54` |
| `ParentColumnVisibility::Criteria` | `"ParentColumnVisibility::Criteria"` | Parent-section visibility | `meta/__init__.py:971`; `blob.py:55` |
| `FieldValidation::Criteria` | `"FieldValidation::Criteria"` | Validation criteria | `blob.py:51` |
| `RHSField::Condition` | `"RHSField::Condition"` | Conditions where field is RHS | `meta/__init__.py:896` |
| `Autofill::QueryDefinition` | `"Autofill::QueryDefinition"` | Autofill query defs | `meta/__init__.py:899` |
| `AutoReset::QueryDefinition` | `"AutoReset::QueryDefinition"` | Auto-reset query defs | `meta/__init__.py:902` |
| `RemoteLookup::QueryDefinition` | `"RemoteLookup::QueryDefinition"` | Remote-lookup query defs | `meta/__init__.py:905` |
| `Aggregate::QueryDefinition` | `"Aggregate::QueryDefinition"` | Aggregate query defs | `meta/__init__.py:908` |
| `SelfAggregateField::QueryDefinition` | `"SelfAggregateField::QueryDefinition"` | Self-aggregate query defs | `meta/__init__.py:908` |

### 5.3 Per-field-type extra JSON attributes (dynamic dispatch)
Dispatched from `get_field_json` (`meta/__init__.py:924-929`) by lower-cased `Type` / `Widget`:

| Method (type/widget) | Adds key(s) | file:line |
|---|---|---|
| `get_additional_number_json_attributes` | `Decimalpoint` | `meta/__init__.py:1022-1023` |
| `get_additional_currency_json_attributes` | `Decimalpoint` | `meta/__init__.py:1036-1037` |
| `get_additional_slider_json_attributes` | `MinValue`, `MaxValue` | `meta/__init__.py:1032-1034` |
| `get_additional_starrating_json_attributes` | `AllowHalf` | `meta/__init__.py:1039-1040` |
| `get_additional_custom_json_attributes` | `ComponentId` | `meta/__init__.py:1025-1030` |
| `get_additional_reference_json_attributes` | `Attributes` (from QD) | `meta/__init__.py:1042-1045` |
| `get_additional_user_json_attributes` | `SourceFlowId`, `SourceFlowType`, `Attributes` | `meta/__init__.py:1047-1052` |
| `get_additional_foreignkey_json_attributes` | `ReferredModel` | `meta/__init__.py:1054-1055` |

`get_field_json` always sets: `Name, Type, IsSystemField, Model, Widget, Required, IsInternal`
(`meta/__init__.py:917-923`).

### 5.4 Reference-field DBType set (`is_reference_field`)
`Reference, ReferenceList, User, UserList, UserAndGroup, UserAndGroupList`
(`meta/__init__.py:769-776`).

`is_computed_field` triggers: has expression; reference+autofill; `Name`; widget `Aggregation`;
type `SequenceNumber`; select+autofill (`meta/__init__.py:848-856`).
`is_read_only` also true when `BaseMetadata` ∈
`System, ProcessBase, DatasetBase, ProjectBase, CaseBase, CaseDocBase, FormBase`
(`meta/__init__.py:842-846`).
Projection id suffixes: DateTime→`.dv`, Currency→`.dv`, Geolocation→`.properties.Address`
(`meta/__init__.py:746-749`); value id suffix `.v` for Currency/DateTime (`meta/__init__.py:757-758`);
unit id suffix `.unit` (`meta/__init__.py:763`).

---

## 6. Expression  (`class Expression(BaseObject)` — `meta/__init__.py:1062`)

| Attribute / relation | Type/values | Meaning | file:line |
|---|---|---|---|
| `Field` | string (field id) | Container field of the expression | `meta/__init__.py:1067` |
| `Expression::Node` | array of node ids | Root node list (first = root) | `meta/__init__.py:1070, 1073`; const `blob.py:46` |

---

## 7. Node  (`class Node(BaseObject)` — `meta/__init__.py:1076`)

Expression/condition AST node.

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `Type` | string (NodeType enum) | yes | — | Node type | `meta/__init__.py:1088` |
| `Value` | any / function-name string | no | None | Static value or engine function name | `meta/__init__.py:1094, 1109` |
| `Field` | string (field id) | no | None | Field reference | `meta/__init__.py:1091` |
| `Datatype` | string (DataType) | no | None | Node data type | `meta/__init__.py:1103` |
| `Category` | string (Category) | no | None | Function category / module | `meta/__init__.py:1106` |
| `RefModel` | string (model id) | no | None | Referenced model | `meta/__init__.py:1112` |
| `RefField` | string | no | None | Referenced field | `meta/__init__.py:1115-1117` |
| `RefRootModel` | string | no | None | Referenced root model | `meta/__init__.py:1120` |
| `LookUpPath` | string | no | None | Lookup path | `meta/__init__.py:1123` |
| `FunctionFlowType` | string | no | None | Function flow type | `meta/__init__.py:1126` |
| `Expression` | string (expression id) | no | None | Parent expression | `meta/__init__.py:1078-1079` |
| `Node` | string (node id) | no | None | Parent/child single node | `meta/__init__.py:1084-1085` |

### Node relations
| Relation key | Literal value | Meaning | file:line |
|---|---|---|---|
| `Node::Node` | `"Node::Node"` | Child node list | `meta/__init__.py:1082`; `blob.py:47` |

> When `node.get_category()` ∈ (`Reference`, `Object`) the `RefField` is returned raw
> (`meta/__init__.py:1115-1117`).

---

## 8. Options  (`class Options(BaseObject)` — `meta/__init__.py:1129`)

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| `Options` | array | Select/Multiselect/Checkbox option values | `meta/__init__.py:1131`; const `blob.py:288` |

---

## 9. QueryDefinition  (`class QueryDefinition(BaseObject)` — `meta/__init__.py:1134`)

Lookup / reference / aggregate query definition.

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `LHSModel` | string `root::model` | yes | — | Left-hand-side model | `meta/__init__.py:1136, 1143`; const `blob.py:258` |
| `LHSRootModel` | string `root::model` | no | None | LHS root model (DatasetView) | `meta/__init__.py:1140, 1201`; const `blob.py:257` |
| `LookupField` | array `[{Id,Type}]` | no | `[{Email,Text},{Kind,Text}]` | Lookup display fields | `meta/__init__.py:1236-1239`; const `blob.py:383` |
| `HiddenField` | array of field ids | no | `[]` | Hidden lookup fields | `meta/__init__.py:1254`; const `blob.py:429` |
| `SortBy` | array/object | no | None | Sort definition | `meta/__init__.py:1263, 1313`; const `blob.py:385` |
| `AutoFill` | bool | no | None | Auto-fill enabled | `meta/__init__.py:1271`; const `blob.py:387` |
| `AutoReset` | bool | no | None | Auto-reset enabled | `meta/__init__.py:1274` |
| `Field` | string (field id) | no | None | Container field | `meta/__init__.py:1266` |

### QueryDefinition relations
| Relation key | Literal value | Meaning | file:line |
|---|---|---|---|
| `QueryDefinition::Criteria` | `"QueryDefinition::Criteria"` | Filter criteria | `meta/__init__.py:1258`; `blob.py:50` |

> `get_attributes()` returns `[{Id, Name, Type}]` per lookup field (`meta/__init__.py:1211-1217`).
> `DATASET_VIEW` flow type routes query to view collection (`meta/__init__.py:1158-1170`).

### 9a. LookupQueryDefinition  (`meta/__init__.py:1296`)
Inherits QueryDefinition; overrides `get_hidden_fields` to resolve cross-container
hidden field ids (`meta/__init__.py:1297-1302`). No new attributes.

### 9b. AggregateDefinition  (`class AggregateDefinition(QueryDefinition)` — `meta/__init__.py:1305`)
| Attribute (JSON key) | Type/values | Meaning | file:line |
|---|---|---|---|
| `AggregateField` | string (field id, cross-ref) | Field being aggregated | `meta/__init__.py:1307`; const `blob.py:259` |
| `AggregateType` | string (Count/Sum/Average/Min/Max/Concatenate — data-only) | Aggregation operation | `meta/__init__.py:1310`; const key `bo_const.py:463` |
| `SortBy` | array (first element used) | Sort | `meta/__init__.py:1313` |

### 9c. RemoteLookup  (`class RemoteLookup(QueryDefinition)` — `meta/__init__.py:1499`)
| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `Method` | string (HTTP method) | no | None | HTTP method | `meta/__init__.py:1507`; const `blob.py:544` |
| `ResultType` | string | no | None | Result type | `meta/__init__.py:1525`; const `blob.py:546` |
| `ResponseType` | string | no | `"Json"` | Response type (Json/XML) | `meta/__init__.py:1534`; const `blob.py:545` |
| `Trigger` | string (`Manual`/other) | no | None | Auto vs manual trigger | `meta/__init__.py:1522`; const `blob.py:427` |
| `Header::Property` | array of property ids | no | `[]` | Header properties | `meta/__init__.py:1502`; const `blob.py:549` |
| `Body::Property` | array of property ids | no | `[]` | Payload properties | `meta/__init__.py:1511`; const `blob.py:550` |
| `RemoteLookup::Expression` | array (first = expr) | yes | — | URL/value expression | `meta/__init__.py:1516`; const `blob.py:547` |
| `XPATH::Expression` | array (first = path) | yes | — | XPath expression | `meta/__init__.py:1519`; const `blob.py:548` |

---

## 10. Criteria  (`class Criteria(BaseObject)` — `meta/__init__.py:1316`)

A logical group of conditions.

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `IsOR` | bool | no | None | OR (true) vs AND (false) join | `meta/__init__.py:1324`; const `blob.py:324` |
| `QueryDefinition` | string (qd id) | no | None | Owning query def | `meta/__init__.py:1329` |
| `Criteria` | string (criteria id) | no | None | Parent criteria | `meta/__init__.py:1335` |

### Criteria relations
| Relation key | Literal value | Meaning | file:line |
|---|---|---|---|
| `Criteria::Condition` | `"Criteria::Condition"` | Conditions in the group | `meta/__init__.py:1319`; `blob.py:144` |
| `Criteria::Criteria` | `"Criteria::Criteria"` | Nested criteria | `blob.py:145` |

Operator resolution: `IsOR`→`$or`, else `$and` via `operator_mapping` (`meta/__init__.py:1323-1326`;
`query_utils.py:27-28`).

---

## 11. Constraint  (`class Constraint(BaseObject)` — `meta/__init__.py:1343`)

| Attribute (JSON key) | Type/values | Meaning | file:line |
|---|---|---|---|
| `Type` | string (`Unique`) | Constraint type | `meta/__init__.py:1345`; const `blob.py:201`; value `ConstraintType.UNIQUE="Unique"` `meta_const.py:313-314` |
| `Context` | any | Constraint context | `meta/__init__.py:1348`; const `blob.py:402` |
| `ErrorMessage` | string | Validation error message | `meta/__init__.py:1351`; const `blob.py:405` |

---

## 12. Condition (base)  (`class Condition(BaseObject)` — `meta/__init__.py:1354`)

A single LHS-operator-RHS condition.

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `LHSField` | string `model::...::field` | yes | — | Left-hand field path | `meta/__init__.py:1356, 1360, 1363` |
| `RHSField` | string (field id) | no | None | Right-hand field | `meta/__init__.py:1374-1375` |
| `RHSRootModel` | string (model id) | no | None | RHS parent model | `meta/__init__.py:1374, 1382`; const `base_const.RootModel.RHS_ROOT_MODEL="RHSRootModel"` `base_const.py:1212` |
| `RHSParam` | string | no | None | RHS param (prefixed `$`) | `meta/__init__.py:1385` |
| `RHSValue` | any | no | None | RHS literal value | `meta/__init__.py:1391, 1404` |
| `RHSType` | string (Value/Field/FilterParam) | no | `""` | RHS source type | `meta/__init__.py:1394`; const `base_const.OPERATORS.RHS_TYPE="RHSType"` `base_const.py:1148` |
| `Operator` | string (OPERATORS enum) | yes | — | Comparison operator | `meta/__init__.py:1388`; const `base_const.py:1146` |
| `Criteria` | string (criteria id) | no | None | Parent criteria | `meta/__init__.py:1397` |

### Condition relations
| Relation key | Literal value | Meaning | file:line |
|---|---|---|---|
| `Condition::Condition` | `"Condition::Condition"` | Nested conditions | `blob.py:148` |
| `LHSOwnField::Condition` | `"LHSOwnField::Condition"` | Conditions by own LHS field | `blob.py:49` |

### 12a. TableAssignmentCondition  (`meta/__init__.py:1407`)
| Attribute (JSON key) | Type/values | Meaning | file:line |
|---|---|---|---|
| `LHSOwnField` | string `model::field` | LHS own field | `meta/__init__.py:1409, 1413`; const `blob.py:422` |
| `RHSOwnField` | string `model::field` | RHS own field | `meta/__init__.py:1416` |

### 12b. ValidationCondition  (`meta/__init__.py:1420`)
| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| `LHSOwnField` | string (field id) | LHS own field (container-resolved) | `meta/__init__.py:1422`; const `blob.py:422` |

### 12c. VisibilityCondition (extends ValidationCondition) — `meta/__init__.py:1425`
| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| `Model` | string (model id) | Condition's own model | `meta/__init__.py:1433, 1437`; const `blob.py:189` |
| `LHSRootModel` | string (model id) | LHS parent model | `meta/__init__.py:1434-1435`; const `base_const.RootModel.LHS_ROOT_MODEL="LHSRootModel"` `base_const.py:1211` |
| `LHSOwnField` | string (field id) | LHS own field | `meta/__init__.py:1435-1437`; const `blob.py:422` |

### 12d. RequirementCondition (extends ValidationCondition) — `meta/__init__.py:1440`
Identical attribute set to VisibilityCondition: `Model`, `LHSRootModel`, `LHSOwnField`
(`meta/__init__.py:1452-1456`).

### 12e. QueryCondition  (`meta/__init__.py:1459`)
`pass` — no overrides; same attributes as base Condition (`meta/__init__.py:1459-1460`).

### 12f. GridCondition  (`class GridCondition(Condition)` — `meta/__init__.py:1463`)
| Attribute (JSON key) | Type/values | Meaning | file:line |
|---|---|---|---|
| `LHSField` | string (may contain `.`) | LHS field (dot-split) | `meta/__init__.py:1468-1471, 1484` |
| `RHSField` | string (or `_current_user`) | RHS field | `meta/__init__.py:1474-1476, 1480` |
| `LHSAttribute` | string | LHS attribute | `meta/__init__.py:1488`; const `base_const.py:1154` |
| `RHSAttribute` | string | RHS attribute | `meta/__init__.py:1492`; const `base_const.py:1156` |
| `LHSAttributeFieldType` | string | LHS attribute field type | `meta/__init__.py:1496`; const `base_const.py:1155` |

> `_current_user` sentinel: `base_const.OPERATORS.RHS_FIELD_CURRENT_USER="_current_user"`
> (`base_const.py:1159`).

---

## 13. Property  (`class Property(BaseObject)` — `meta/__init__.py:1537`)

Used by SequenceNumber fields and RemoteLookup header/body.

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `Name` | string | yes | — | Property name (e.g. `Padding`, `PrefixExpression`) | `meta/__init__.py:1539` |
| `Value` | any | no | None | Property value | `meta/__init__.py:1542` |
| `ValueField` | string (field id) | no | None | Property value field | `meta/__init__.py:1545`; const `blob.py:225` |
| `ValueType` | string | no | `"Value"` | Property value type | `meta/__init__.py:1548`; const `blob.py:224` |
| `Property::Expression` | array (first = expr) | no | None | Expression (e.g. prefix) | `meta/__init__.py:1551`; const `blob.py:39` |

> SequenceNumber property names referenced in code: `Padding` (`meta/__init__.py:1007`),
> `PrefixExpression` (`meta/__init__.py:1016`).

---

## 14. RefreshField  (`class RefreshField(BaseObject)` — `meta/__init__.py:1555`)

| Attribute (JSON key) | Type/values | Required? | Default | Meaning | file:line |
|---|---|---|---|---|---|
| `Field` | string (field id) | yes | — | Field to refresh | `meta/__init__.py:1559, 1560` |
| `RootModel` | string (model id) | no | None | If set → child-table refresh | `meta/__init__.py:1563, 1566`; const `blob.py:205` |
| `Model` | string (child model id) | no | None | Child model id | `meta/__init__.py:1567`; const `blob.py:189` |

---

# Enumerations

## E1. FieldType  (`class FieldType` — `meta_const.py:72-114`)
| Member | Literal value | file:line |
|---|---|---|
| DATE_TIME | `"DateTime"` | `meta_const.py:75` |
| DATE_TIME_UTC | `"DateTimeUTC"` | `meta_const.py:76` |
| TEXT | `"Text"` | `meta_const.py:77` |
| TEXT_AREA | `"Textarea"` | `meta_const.py:78` |
| CURRENCY | `"Currency"` | `meta_const.py:79` |
| DATE | `"Date"` | `meta_const.py:80` |
| Reference / REFERENCE | `"Reference"` | `meta_const.py:81, 94` |
| Aggregation | `"Aggregation"` | `meta_const.py:82` |
| NUMBER | `"Number"` | `meta_const.py:83` |
| SELECT | `"Select"` | `meta_const.py:84` |
| MULTI_SELECT | `"Multiselect"` | `meta_const.py:85` |
| EMAIL | `"Email"` | `meta_const.py:86` |
| BOOLEAN | `"Boolean"` | `meta_const.py:87` |
| SEQUENCE_NUMBER | `"SequenceNumber"` | `meta_const.py:88` |
| STRING | `"String"` | `meta_const.py:89` |
| STRING_LIST | `"StringList"` | `meta_const.py:90` |
| JSON | `"JSON"` | `meta_const.py:91` |
| JSON_LIST | `"JSONList"` | `meta_const.py:92` |
| GEOLOCATION | `"Geolocation"` | `meta_const.py:93` |
| REFERENCE_LIST | `"ReferenceList"` | `meta_const.py:95` |
| CHECK_LIST | `"CheckList"` | `meta_const.py:97` |
| CHECKLIST | `"Checklist"` | `meta_const.py:98` |
| LIST | `"List"` | `meta_const.py:99` |
| CHECKBOX | `"Checkbox"` | `meta_const.py:100` |
| USER | `"User"` | `meta_const.py:102` |
| USER_ACTOR | `"UserActor"` | `meta_const.py:103` |
| OBJECT | `"Object"` | `meta_const.py:104` |
| MULTI_USER | `"MultiUser"` | `meta_const.py:105` |
| USER_LIST | `"UserList"` | `meta_const.py:106` |
| USER_AND_GROUP | `"UserAndGroup"` | `meta_const.py:107` |
| USER_GROUP_LIST | `"UserAndGroupList"` | `meta_const.py:108` |
| DROPDOWN_LIST | `"DropdownList"` | `meta_const.py:109` |
| USERGROUPLIST | `"UserGroupList"` | `meta_const.py:110` |
| STAR_RATING | `"StarRating"` | `meta_const.py:111` |
| SLIDER | `"Slider"` | `meta_const.py:112` |
| OBJECT_LIST | `"ObjectList"` | `meta_const.py:113` |
| REMOTE_LOOKUP | `"RemoteLookup"` | `meta_const.py:114` |

## E2. Widget / WidgetType  (`class WidgetType` — `meta_const.py:126-174`)
| Member | Literal | file:line | | Member | Literal | file:line |
|---|---|---|---|---|---|---|
| TEXT | `"Text"` | `:127` | | RICH_TEXT | `"RichText"` | `:161` |
| TEXT_AREA | `"Textarea"` | `:128` | | BUTTON | `"Button"` | `:162` |
| EMAIL | `"Email"` | `:129` | | GRID | `"Grid"` | `:163` |
| NUMBER | `"Number"` | `:130` | | STRING | `"String"` | `:164` |
| STAR_RATING | `"StarRating"` | `:131` | | FOREIGN_KEY | `"ForeignKey"` | `:165` |
| SLIDER | `"Slider"` | `:132` | | DROPDOWN_LIST | `"DropdownList"` | `:166` |
| DATE | `"Date"` | `:133` | | GROUPS | `"Groups"` | `:167` |
| DATE_TIME | `"DateTime"` | `:134` | | ROLES | `"Roles"` | `:168` |
| CURRENCY | `"Currency"` | `:135` | | GROUP_LIST | `"GroupList"` | `:169` |
| USER | `"User"` | `:136` | | JSON_LIST | `"JSONList"` | `:170` |
| USER_AND_GROUP | `"UserAndGroup"` | `:137` | | LIST | `"List"` | `:171` |
| MULTI_USER | `"MultiUser"` | `:138` | | FLOAT | `"Float"` | `:172` |
| REFERENCE | `"Reference"` | `:139` | | USER_GROUP_LIST | `"UserGroupList"` | `:173` |
| SELECT | `"Select"` | `:140` | | PROFILE_PICTURE | `"ProfilePicture"` | `:174` |
| MULTI_SELECT | `"Multiselect"` | `:141` | | SCANNER | `"Scanner"` | `:156` |
| GEOLOCATION | `"Geolocation"` | `:142` | | CUSTOM | `"Custom"` | `:157` |
| JSON | `"JSON"` | `:143` | | STRING_LIST | `"StringList"` | `:158` |
| BOOLEAN | `"Boolean"` | `:144` | | OBJECT | `"Object"` | `:159` |
| ATTACHMENT | `"Attachment"` | `:145` | | OBJECT_LIST | `"ObjectList"` | `:160` |
| IMAGE | `"Image"` | `:146` | | RADIO_BUTTON | `"Radio"` | `:155` |
| SIGNATURE | `"Signature"` | `:147` | | SMART_ATTACHMENT | `"SmartAttachment"` | `:154` |
| CHECKLIST | `"Checklist"` | `:148` | | SEQUENCE_NUMBER | `"SequenceNumber"` | `:153` |
| CHECKBOX | `"Checkbox"` | `:149` | | XML | `"XML"` | `:152` |
| AGGREGATION | `"Aggregation"` | `:150` | | REMOTE_LOOKUP | `"RemoteLookup"` | `:151` |

> `class Widget` (system-created widget names): `MY_ITEM="myitems"` (`meta_const.py:118`),
> `MY_TASK="mytasks"` (`meta_const.py:119`).

## E3. DBType  (Widget→DBType mapping — `WIDGET_TO_DBTYPE_MAPPING` `meta_const.py:177-211`)
DBType is the storage type stored in the `DBType` field key. Distinct DBType values produced:
`String`, `Email`, `Number`, `Date`, `DateTime`, `Currency`, `User`, `UserAndGroup`, `UserList`,
`Reference`, `StringList`, `Geolocation`, `JSON`, `Boolean`, `JSONList`, `CheckList`, `Aggregation`,
`XML`, `Object`, `ObjectList` (`meta_const.py:178-210`). Reference-field DBType set (used at runtime):
`Reference, ReferenceList, User, UserList, UserAndGroup, UserAndGroupList` (`meta/__init__.py:769-776`).
`WIDGET_TO_FIELD_MAPPING`: `Radio → Select` (`meta_const.py:338-340`).

## E4. NodeType  (`class NodeType` — `engine.py:1-7`)
| Member | Literal | file:line |
|---|---|---|
| FUNCTION | `"Function"` | `engine.py:2` |
| STATIC | `"Static"` | `engine.py:3` |
| FIELD | `"Field"` | `engine.py:4` |
| AGGREGATE_FUNCTION | `"AggregateFunction"` | `engine.py:5` |
| AGGREGATE_FIELD | `"AggregateField"` | `engine.py:6` |
| FETCH_FIELD | `"FetchField"` | `engine.py:7` |

## E5. DataType  (NOT a class — list `DATA_TYPES` — `datatypes.py:1-21`)
`String`(:2), `Number`(:3), `Boolean`(:4), `DateTime`(:5), `Date`(:6), `Currency`(:7),
`JSON`(:8), `Geolocation`(:9), `Reference`(:10), `StringList`(:11), `NumberList`(:12),
`CheckList`(:13), `JSONList`(:14), `ReferenceList`(:15), `ActivityInstance`(:16), `User`(:17),
`UserList`(:18), `UserAndGroup`(:19), `UserAndGroupList`(:20). (All in `datatypes.py`.)
Read at runtime via `node.get("DataType")` / `get_datatype()` (`meta/__init__.py:1103`).

## E6. Category  (NOT a class — top-level keys of `functions` registry — `funcdef.py`)
`Number`(:2), `String`(:18), `DateTime`(:29), `Date`(:57), `Logical`(:84), `Currency`(:85),
`Reference`(:105), `Object`(:111), `User`(:117), `Models`(:125), `UserList`(:128),
`UserAndGroup`(:137), `UserAndGroupList`(:141), `JSON`(:146), `XML`(:152), `JSONList`(:158),
`NumberList`(:159), `Workflow`(:168), `Boolean`(:172), `Process`(:178), `Activity`(:179),
`StringList`(:190), `CheckList`(:200), `Geolocation`(:207). (All in `funcdef.py`.)

## E7. Syntax  — **does not exist as a class/enum** (unverified that any `Syntax`/`Chain` enum exists; none found in `businessobject/`).
Closest analogue: `OPERATOR_FUNC_MAP` (operator symbol → function name) `datatypes.py:39-58`
(e.g. `"&&"→AND`, `"||"→OR`, `"*"→MULOPER`, `"+"→ADDOPER`, `">="→GEOPER`, `"="→EQOPER`).

## E8. Function registry  (`functions` dict — `funcdef.py:1`)
Definition shape: `{"Mandatory":[...], "Optional":[... or str], "Infinite": <type>}`
(`funcdef.py:3-7`; consumed `expression_engine.py:148, 152`). Function name (Node `Value`) is
resolved via `resolve_engine_fn` (`datatypes.py:61-63`) then dispatched (`expression_engine.py:130, 138-139`).
Representative registered function-name keys (see source for the full ~100):
Number→`SUM, ROUND, AVERAGE, MIN, MAX, ABS, ISBLANK, TOTEXT, ADD/SUB/MUL/DIV/MOD/POW OPER…`
(`funcdef.py:2-16, 236-240`); String→`CONCATENATE, FIND, TOUPPERCASE, REPLACE, SUBSTRING, TRIM, LENGTH…`
(`funcdef.py:18-27, 256-259`); DateTime/Date→`DATEDIFF, NOW, TODAY, DAY, WEEK, WEEKNUM, OFFSET, YEAR, MONTH…`
(`funcdef.py:29-82, 241-250`); Currency→`CURRENCY, CONVERT, ROUND, CODE, VALUE…` (`funcdef.py:85-103, 251-255`);
Reference/Object→`CURRENTITEM, GETVALUE, ISBLANK, EQOPER` (`funcdef.py:105-115`);
Geolocation→`STATE, COUNTRY, CITY, ZIPCODE, AREA, ADDRESS, LATITUDE, LONGITUDE` (`funcdef.py:207-215`);
Activity→`ASSIGNEES, APPROVERS, DEADLINE, ASSIGNEDAT, APPROVEDAT, NAME, DEADLINEBREACHED…` (`funcdef.py:179-188`);
Process→`LASTCOMPLETEDSTEP, REQUESTNO, COUNTER, CREATEDBY, STATUS…` (`funcdef.py:178, 263-265`).

## E9. AggregateType  — string metadata attribute (key `"AggregateType"` `bo_const.py:463`)
**No enum class.** Observed literal values (data/fixtures, not a code enum — hence not authoritative):
`Count`, `Sum`, `Average`, `Min`, `Max`, `Concatenate` (case variants `sum` also seen).
**STDDEV / MEDIAN / VARIANCE are absent** from `businessobject/` (unverified — simply not present).
Aggregation operators in `operator_mapping`: `SUM, COUNT, AVERAGE, MAX, MIN, STDDEV`
(`query_utils.py:34-39`) — note `STDDEV` appears here as a query operator but not as an AggregateType value.

## E10. Condition Operators  (`class OPERATORS` — `base_const.py:1113-1207`)
| Member | Literal | file:line |
|---|---|---|
| EQUAL_TO | `"EQUAL_TO"` | `base_const.py:1117` |
| PART_OF | `"PART_OF"` | `base_const.py:1118` |
| NOT_PART_OF | `"NOT_PART_OF"` | `base_const.py:1119` |
| NOT_EQUAL_TO | `"NOT_EQUAL_TO"` | `base_const.py:1120` |
| GREATER_THAN_OR_EQUAL_TO | `"GREATER_THAN_OR_EQUAL_TO"` | `base_const.py:1121` |
| GREATER_THAN | `"GREATER_THAN"` | `base_const.py:1122` |
| LESS_THAN_OR_EQUAL_TO | `"LESS_THAN_OR_EQUAL_TO"` | `base_const.py:1123` |
| LESS_THAN | `"LESS_THAN"` | `base_const.py:1124` |
| CONTAINS | `"CONTAINS"` | `base_const.py:1125` |
| NOT_CONTAINS | `"NOT_CONTAINS"` | `base_const.py:1126` |
| BETWEEN | `"BETWEEN"` | `base_const.py:1127` |
| OR | `"OR"` | `base_const.py:1128` |
| AND | `"AND"` | `base_const.py:1129` |
| REGEX | `"REGEX"` | `base_const.py:1130` |
| MIN_LENGTH | `"MIN_LENGTH"` | `base_const.py:1131` |
| MAX_LENGTH | `"MAX_LENGTH"` | `base_const.py:1132` |
| VALUE_LESS_THAN_OR_EQUAL_TO | `"VALUE_LESS_THAN_OR_EQUAL_TO"` | `base_const.py:1135` |
| VALUE_GREATER_THAN_OR_EQUAL_TO | `"VALUE_GREATER_THAN_OR_EQUAL_TO"` | `base_const.py:1136` |
| VALUE_EQUAL_TO | `"VALUE_EQUAL_TO"` | `base_const.py:1137` |
| VALUE_NOT_EQUAL_TO | `"VALUE_NOT_EQUAL_TO"` | `base_const.py:1138` |
| VALUE_GREATER_THAN | `"VALUE_GREATER_THAN"` | `base_const.py:1139` |
| VALUE_LESS_THAN | `"VALUE_LESS_THAN"` | `base_const.py:1140` |
| EMPTY | `"EMPTY"` | `base_const.py:1157` |
| NOT_EMPTY | `"NOT_EMPTY"` | `base_const.py:1158` |
| IN | `"IN"` | `base_const.py:1160` |

> Additional operators present only in `operator_mapping` (`query_utils.py:13-54`):
> `IN_THE_PAST`, `IN_THE_FUTURE`, `MIN_NO_OF_ATTACHMENTS`, `MAX_NO_OF_ATTACHMENTS`,
> `SELECTION_SHOULD_CONTAIN`, `SELECTION_SHOULD_NOT_CONTAIN`, `YEAR`, `MONTH`, `DAY`, `DATE`.

### Operator metadata keys (on a Condition)  — `OPERATORS` `base_const.py:1142-1160`
`Label`(:1143), `LHSField`(:1144), `LHSOwnField`(:1145), `Operator`(:1146),
`OperatorLabel`(:1147), `RHSType`(:1148), `RHSValue`(:1149), `RHSField`(:1150),
`RHSParam`(:1151), `HasArguments`(:1152), `Filter`(:1153), `LHSAttribute`(:1154),
`LHSAttributeFieldType`(:1155), `RHSAttribute`(:1156), `_current_user`(:1159).

## E11. RHSType  (`class OPERATORS.RHSType` — `base_const.py:1202-1205`)
| Member | Literal | file:line |
|---|---|---|
| Value | `"Value"` | `base_const.py:1203` |
| FIELD | `"Field"` | `base_const.py:1204` |
| FILTER_PARAM | `"FilterParam"` | `base_const.py:1205` |

## E12. RootModel keys  (`class RootModel` — `base_const.py:1210-1212`)
`LHS_ROOT_MODEL="LHSRootModel"` (`:1211`), `RHS_ROOT_MODEL="RHSRootModel"` (`:1212`).

## E13. ConstraintType  (`class ConstraintType` — `meta_const.py:313-314`)
`UNIQUE="Unique"` (`:314`).

## E14. Permission levels
The `Permission` field value (`meta/__init__.py:832-834`). Documented values from
`MetadataConstants`/`ViewBlobConstants`: `ReadOnly` (`meta_const.py:261`), `Editable`
(`blob.py:562`), `Hidden` (`blob.py:563`). `Mandatory` is referenced as a logical level
in `is_unconditionally_required`/`Required` handling but **not** as a literal Permission enum
member in these constant modules **(unverified as a `Permission` enum value)**.

## E15. FLOW_TYPE  (`class FLOW_TYPE` — `base_const.py:1263-1306`)
`Agent`(:1264), `Application`(:1265), `Case`(:1266), `Portal`(:1267), `CaseFlow`(:1268),
`CasePermission`(:1269), `CaseReport`(:1270), `Category`(:1271), `Channel`(:1272),
`Dataset`(:1273), `DatasetView`(:1274), `Integration`(:1275), `List`(:1276), `Process`(:1277),
`ProcessDocument`(:1278), `Project`(:1279), `ProjectFlow`(:1280), `ProjectView`(:1281),
`CaseView`(:1282), `Metric`(:1283), `CaseMetric`(:1284), `Report`(:1285), `Accounts`(:1286),
`User`(:1287), `ServiceAccount`(:1288), `Group`(:1289), `Chat`(:1290), `Team`(:1291),
`Community`(:1292), `Audit`(:1293), `Form`(:1294), `FormView`(:1295), `Page`(:1296),
`System`(:1297), `ProjectReport`(:1298), `AnalyticsView`(:1299), `AnalyticsTable`(:1300),
`AnalyticsChildTable`(:1301), `AnalyticsReport`(:1302), `FormReport`(:1303),
`ExternalData`(:1304), `DecisionTable`(:1305), `Connector`(:1306). (All `base_const.py`.)

## E16. Date/Time field attribute enums  (`date_time.py`)
- `LocaleFormat`: `DateFormat`(:103), `TimeFormat`(:104), `Date`(:105), `DateTimeFormat`(:106),
  `DecimalSeparator`(:107), `GroupSeparator`(:108).
- `DateRelativeRange`: `ThisWeek, ThisMonth, ThisQuarter, ThisYear, NextQuarter, Last7Days,
  Next7Days, Last14Days, Last30Days, Last60Days, Last90Days, Next6Hours, Next12Hours`
  (`date_time.py:112-124`).
- `DateRelativeValue`: `Today, Tomorrow, Yesterday, Now, Upcoming, Crossed`
  (`date_time.py:142-147`).
- `DateTimeMeta` storage sub-keys: `v`(:327), `td`(:328), `tz`(:329), `dv`(:330)
  (`meta_const.py`).

## E17. Geolocation attribute keys  (`class GeolocationMetadata` — `blob.py:484-503`)
`geometry`(:485), `properties`(:486), `type`(:487), `Point`(:488), `Address`(:489),
`Area`(:490), `City`(:491), `Country`(:492), `Latitude`(:493), `Longitude`(:494),
`ZipCode`(:495), `State`(:496), `coordinates`(:497), `Feature`(:498),
`UseCurrentLocation`(:503). GEO_ATTRIBUTES = [Address, Area, City, Country, ZipCode, State] (:499).

---

# MISSING FROM LIVE OBSERVATION
Attributes/relations that exist in source but are commonly absent from live metadata dumps
(the gap to watch for). All confirmed in source as above.

### Field-level (often not in live dumps)
- `ParentColumn`, `IsParentColumnHidden`, `Column` — visibility-hierarchy keys (`blob.py:326-327, 238`).
- `ParentColumnVisibility::Criteria` — parent-section conditional visibility (`blob.py:55`).
- `FieldValidation::Criteria` — validation criteria array (`blob.py:51`) (distinct from requirement/visibility).
- `Field::Constraint` + Constraint objects (`Type:"Unique"`, `Context`, `ErrorMessage`) (`meta/__init__.py:990, 1343-1351`).
- `Field::RefreshField`, `Field::Property`, `Field::Component`,
  `Field::AutofillGuideline`, `Field::AutofillInstruction` (`blob.py:97-102`).
- Autofill/aggregate cross-ref relations: `Autofill::QueryDefinition`, `AutoReset::QueryDefinition`,
  `RemoteLookup::QueryDefinition`, `Aggregate::QueryDefinition`,
  `SelfAggregateField::QueryDefinition`, `RHSField::Condition` (`meta/__init__.py:896-908`).
- `DatasourceType` (Select source resolution), `ReferredList` (`blob.py:357, 325`).
- `MinValue`/`MaxValue`/`IntervalSize` (Slider), `AllowHalf` (StarRating) (`blob.py:289, 409-411`).
- Camera/attachment config: `CaptureOnly`, `WatermarkConfig`, `IncludeTimestamp`, `IncludeLocation`,
  `ScanFromStorage`, `CanAutoFill`, `AllowEdit`, `AllowDraw`, `UseCurrentLocation`
  (`blob.py:283-287, 376-379, 503`).

### QueryDefinition / RemoteLookup (often abbreviated in dumps)
- `LHSRootModel`, `HiddenField`, the full `LookupField` `[{Id,Type}]` shape, `AutoFill`/`AutoReset`
  (`meta/__init__.py:1140, 1254, 1236, 1271, 1274`).
- RemoteLookup: `Method`, `ResultType`, `ResponseType`, `Trigger`, `Header::Property`,
  `Body::Property`, `RemoteLookup::Expression`, `XPATH::Expression`
  (`meta/__init__.py:1502-1534`).
- AggregateDefinition: `AggregateField`, `AggregateType`, `SortBy` (`meta/__init__.py:1307-1313`).

### Condition (often only base form in dumps)
- `RHSRootModel`, `LHSRootModel`, `Model`, `LHSOwnField`, `RHSOwnField` (parent/child & grid forms)
  (`meta/__init__.py:1374, 1409-1456`).
- Grid attributes: `LHSAttribute`, `RHSAttribute`, `LHSAttributeFieldType`
  (`meta/__init__.py:1488-1496`).
- `RHSParam`, `RHSType`, `Criteria` linkage (`meta/__init__.py:1385-1397`).

### Model (often not surfaced)
- `BaseInterface` (vs `BaseMetadata`), `_meta_version`, `_show_hidden_fields`, `Suspended`,
  `ReadOnly`, `FilterParam`, `SequenceNumber` list, `CustomComponent`
  (`meta/__init__.py:431, 423, 509, 506, 503, 485, 476, 460`).
- Full `Security` sub-object (esp. `AllowedFieldsByFlows`, `BlockedFlows`, `ExternalCommenterScope`)
  (`base_const.py:642-654`).
- `Appearance.Title.TitleFields`, `Appearance.CardFields` (`meta/__init__.py:584, 601-602`).
- All `Model::*` layout relations beyond `Model::Field`
  (`Model::Row`, `Model::Column`, `Model::Template`, `Model::Permission`, etc.) (`blob.py:108-122`).

### Property / SequenceNumber
- `ValueType`, `ValueField`, `Property::Expression`, and the `Padding`/`PrefixExpression`
  property-name convention (`meta/__init__.py:1542-1551, 1007, 1016`).
