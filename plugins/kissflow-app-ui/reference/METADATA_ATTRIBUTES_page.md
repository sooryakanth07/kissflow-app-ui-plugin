# Kissflow Metadata Attributes — Exhaustive Reference

> **Source of truth:** `/Users/dinesh/Projects/kissflow-xg` (authorized company source). Every attribute and enum value below is cited as `file:line` relative to that repo root. Citations verified directly were spot-checked against source; values marked **(unverified)** appear in type definitions or test fixtures but lack an explicit constant/factory confirmation in the focus files.
>
> **2026-06-25 source-verification pass:** several items previously flagged "(unverified)" are now confirmed against the real source tree (the earlier blocker — source not present — is resolved). Confirmations were found in `metadata/utils/page_builder/entity_factory.py`, `metadata/utils/constants/serializer_constants.py`, `metadata/migration/new_app_builder/mappings.py`, `metadata/config/axiom/context/page.md`, and **committed real page-export fixtures** under `metadata/tests/mock/metadata/` (incl. `…/draft/Page001.json`). See updated §6.4–§6.8 and §6.27 below. Items still genuinely absent from source: **FieldMapping `TypePicker`**, **`Theme.CustomColors`**, and **`Mandatory` as a `ViewPermission` member** (all remain unverified, with reasons noted).
>
> **Metadata is sacrosanct.** Do not invent attribute names. When in doubt, grep the cited file.
>
> Metadata is accessed in code via `.get("AttrName")` / `Kind::Child` relation arrays / resolved constants, so the **full attribute set = every distinct accessor key + every resolved constant value**.

Sections:
1. [PAGE schema entities](#1-page-schema-entities)
2. [VIEW metadata](#2-view-metadata)
3. [WORKFLOW (process) & CASEFLOW (case)](#3-workflow-process--caseflow-case)
4. [PERMISSION model](#4-permission-model)
5. [APP-LEVEL documents](#5-app-level-documents)
6. [Enumerations (master list)](#6-enumerations-master-list)
7. [Missing from live observation](#7-missing-from-live-observation)

---

## 1. PAGE schema entities

Primary source: `metadata/server/generator/model/page_model.py` (60 KB). Constants: `metadata/utils/constants/page_model_constants.py`, `model_constants.py`, `serializer_constants.py`. Builders: `metadata/utils/page_builder/{entity_factory,transformer,reverse_transformer,widget_transformer}.py`.

### 1.1 Page

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique page identifier | page_model.py:1731 |
| Kind | "Page" | Entity type discriminator | page_model.py:183,191 |
| Name | string | Page name | page_model.py:107-108,185 |
| Description | string | Page description | page_model.py:110-111,186 |
| Application | string | Reference to parent application | page_model.py:187 |
| Settings | object `{}` | Page-level configuration settings | page_model.py:114,122-123,188 |
| FlowType | string | Flow type identifier | entity_factory.py:20 |
| _application_id | string | Application ID (internal) | entity_factory.py:24 |
| Page::Container | array<Container> | Child containers (incl. Body) | page_model.py:191 |
| Page::Variable | array<Variable> | Page-scoped variables | page_model.py:191 |
| Page::Popup | array<Popup> | Popup definitions | page_model.py:191 |
| Page::Component | array<Component> | All component references | page_model.py:176 |
| Page::VariableRef | array<VariableRef> | Variable references | serializer_constants.py:436 |

### 1.2 Container

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique container identifier | entity_factory.py:40 |
| Kind | "Container" | Entity type discriminator | page_model.py:782 |
| Type | enum (ContainerType) | Container classification — see §6.1 | page_model.py:502-503,762 |
| Name | string | Container name/label | page_model.py:505-508,764 |
| Container | string | Parent container ID (back-reference) | page_model.py:537,758 |
| isHidden | boolean | Visibility state | page_model.py:510-511,765 |
| IsSystem | boolean | System-generated flag | page_model.py:763 |
| LayoutType | enum (LayoutType: grid/flex) | Layout algorithm — see §6.2 | page_model.py:730-737,766 |
| LayoutConfig | object | Grid layout config (keys below) | page_model.py:705-720,768-778 |
| haveHeightLimit | boolean | Height constraint flag | page_model.py:739-743,767 |
| Tab | string | Tab back-reference | page_model.py:759 |
| Popup | string | Popup back-reference | page_model.py:760 |
| MasterDetail | string | MasterDetail back-reference | page_model.py:761 |
| Container::Container | array<Container> | Child containers | page_model.py:782 |
| Container::Component | array<Component> | Child components | page_model.py:522,782 |
| Container::Style | array<Style> | Style definitions | page_model.py:782 |
| Container::FieldMapping | array<FieldMapping> | Field mappings | page_model.py:661,782 |
| Container::EventMapping | array<EventMapping> | Event handlers | page_model.py:672,782 |
| Container::Criteria | array<Criteria> | Visibility criteria | page_model.py:675,782 |

**LayoutConfig keys** (page_model.py:769-777): `rowStart`, `rowEnd`, `colStart`, `colEnd`, `colSpan`, `rowSpan`, `minRowSpan`, `minColSpan` (all numbers).

### 1.3 Component

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string (required) | Unique component identifier | page_model.py:1105 |
| Kind | "Component" | Entity type discriminator | page_model.py:1114 |
| Name | string | Component/widget name | page_model.py:908-909,1109 |
| Container | string | Parent container ID (back-reference) | page_model.py:866-867,1106 |
| Page | string | Page ID (back-reference) | page_model.py:869-870,1107 |
| Script | object `{web: string}` | Script path definitions | page_model.py:1035-1037,1108 |
| Data | object (any) | Widget classification/metadata (keys below) | page_model.py:1055-1056,1110 |
| Type | string | Component type (e.g. Tab / MasterDetail) | page_model.py:888-892,1111 |
| Component::Tabs | array<Tabs> | Tab widget structure | page_model.py:1115 |
| Component::MasterDetail | array<MasterDetail> | Master-Detail widget structure | page_model.py:1115 |

**Data object keys** (page_model.py:1074-1084): `manifest_id` (string, widget type / ManifestParams id), `visualization_type` (string, visual rendering type), `category` (string, custom/standard), `_application_id` (string).

### 1.4 FieldMapping

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique field-mapping identifier | entity_factory.py:97 |
| Kind | "FieldMapping" | Entity type discriminator | entity_factory.py:98 |
| Name | string | Field/property name | page_model.py:1321-1322,1375 |
| Label | string | Display label | page_model.py:1327-1328,1376 |
| Type | enum (see §6.4) | Field type classification | page_model.py:1330-1331,1377 |
| Value | object (any) | Field value/data | page_model.py:1374 |
| Container | string | Parent container ID (back-ref) | page_model.py:1366,1370 |
| Popup | string | Parent popup ID (back-ref) | page_model.py:1366,1371 |
| Component | string | Parent component ID (back-ref) | page_model.py:1372 |
| Property | string | Property reference (back-ref) | page_model.py:1366,1373 |
| FieldMapping::Property | array<Property> | Child properties | page_model.py:1334,1367 |

### 1.5 Property

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique property identifier | entity_factory.py:115 |
| Kind | "Property" | Entity type discriminator | entity_factory.py:116 |
| Name | string | Property name | page_model.py:1457-1458 |
| Type | enum (PropertyTypes) | Property type — see §6.5 | page_model.py:1463-1464,1550 |
| Value | object (any) | Property value/data | page_model.py:1460-1461,1549 |
| FieldMapping | string | Parent FieldMapping ID (back-ref) | entity_factory.py:118 |
| EventMapping | string | Parent EventMapping ID (back-ref) | entity_factory.py:240; page_model.py:1529 |
| RHSValue | string | RHS condition reference (back-ref) | page_model.py:1530,1547 |
| Parameter | string | Parent Parameter ID (back-ref) | page_model.py:1531,1548 |
| Property::VariableRef | array<VariableRef> | Variable references | entity_factory.py:208 |
| Property::EventMapping | array<EventMapping> | Child event mappings | page_model.py:1534 |
| Property::FieldMapping | array<FieldMapping> | Child field mappings | page_model.py:1535 |
| Property::Criteria | array<Criteria> | Filter criteria | page_model.py:1539 |
| Property::Parameter | array<Parameter> | Parameters | page_model.py:1540 |

### 1.6 EventMapping

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique event-mapping identifier | entity_factory.py:222 |
| Kind | "EventMapping" | Entity type discriminator | entity_factory.py:223 |
| Name | enum (event name) | Event trigger (on_click/on_load…) — see §6.7 | page_model.py:1387-1388,1445 |
| Type | enum (event action) | Action type (JSAction/OpenPopup…) — see §6.6 | page_model.py:1393-1394,1446 |
| Label | string | Display label | page_model.py:1399-1400,1447 |
| Container | string | Parent container ID (back-ref) | page_model.py:1437,1441 |
| Popup | string | Parent popup ID (back-ref) | page_model.py:1437,1442 |
| Component | string | Parent component ID (back-ref) | page_model.py:1444 |
| Property | string | Property reference (back-ref) | page_model.py:1437,1444 |
| EventMapping::Property | array<Property> | Child properties | page_model.py:1402,1438 |

### 1.7 VariableRef

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique variable-reference identifier | entity_factory.py:185 |
| Kind | "VariableRef" | Entity type discriminator | entity_factory.py:189 |
| Variable | string | Variable name/identifier | page_model.py:1705-1706,1718 |
| Type | enum (VariableRefTypes) | Reference type — see §6.8 | page_model.py:1708-1709,1719 |
| Page | string | Page ID (back-ref) | page_model.py:1715,1720 |
| Container | string | Container ID (back-ref) | page_model.py:1715,1723 |
| Property | string | Property ID (back-ref) | page_model.py:1715,1722 |
| Popup | string | Popup ID (back-ref) | page_model.py:1715,1721 |

### 1.8 Style

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique style identifier | entity_factory.py:131 |
| Kind | "Style" | Entity type discriminator | entity_factory.py:133 |
| Name | string | Style name/identifier | page_model.py:1310 |
| Value | object `{}` | CSS/style properties map (keys: §6.9) | page_model.py:1253-1257,1309 |
| Container | string | Parent container ID (back-ref) | entity_factory.py:134; page_model.py:1307 |
| Popup | string | Parent popup ID (back-ref) | page_model.py:1262-1265,1308 |

### 1.9 InputParameter / Parameter

`InputParameter` is a `VariableRef.Type` value (see §6.8). The page-level **Parameter** entity (popup/event parameters):

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Unique parameter identifier | page_model.py:373 |
| Kind | "Parameter" | Entity type discriminator | page_model.py:373 |
| Name | string | Parameter name | page_model.py:378-379,427 |
| Description | string | Parameter description | page_model.py:381-382,431 |
| DataType | string | Parameter data type | page_model.py:384-385,429 |
| FieldType | string | Field/input type | page_model.py:387-388,430 |
| Type | string | Parameter type (e.g. Popup) | page_model.py:338,428 |
| Popup | string | Parent Popup ID (back-ref) | page_model.py:432 |
| Property | string | Property reference (back-ref) | page_model.py:433 |
| Parameter::Property | array<Property> | Child properties | page_model.py:437 |

### 1.10 Supporting page entities

**Variable** (page-scoped): Id (entity_factory.py:145), Kind="Variable" (entity_factory.py:146), Name (page_model.py:199-200,240), Description (page_model.py:202-203,241), DefaultValue (page_model.py:205-206,242), DataType (page_model.py:208-209,243), Page back-ref (page_model.py:244), Schema `{}` (page_model.py:211-212,245).

**Popup**: Id (entity_factory.py:250), Kind="Popup" (entity_factory.py:252), Name (page_model.py:266-267,358), Script `{web}` (page_model.py:347-348,357), Page back-ref (page_model.py:356); relation arrays Popup::Container / Popup::Style / Popup::FieldMapping / Popup::EventMapping / Popup::Parameter (page_model.py:361).

**Tabs**: Id (entity_factory.py:280), Kind="Tabs" (page_model.py:1164), Component back-ref (entity_factory.py:285; page_model.py:1165), DefaultTab (page_model.py:1153-1157,1163), Tabs::Tab (entity_factory.py:286).

**Tab**: Id (entity_factory.py:294), Kind="Tab" (entity_factory.py:1214), Name (entity_factory.py:299,1210), hasBadge (entity_factory.py:300,1211), Tabs back-ref (entity_factory.py:301,1215), Tab::Container (entity_factory.py:302,1214).

**MasterDetail**: Id (entity_factory.py:1227), Kind="MasterDetail" (page_model.py:1243), Component back-ref (page_model.py:1243), MasterDetail::Container (page_model.py:1245).

**Criteria**: Id (entity_factory.py:308), Kind="Criteria" (page_model.py:1598), isHidden (page_model.py:1560-1564,1591), IsOR (page_model.py:1582-1586,1592), Property back-ref (page_model.py:1593), Container back-ref (page_model.py:1595,1599), Criteria::Condition (page_model.py:1566-1568,1598).

**Condition**: Id (entity_factory.py:322), Kind="Condition" (page_model.py:1697), LHSVariable (page_model.py:1622-1623,1684), LHSType (page_model.py:1628-1629,1686), LHSDataType (page_model.py:1631-1632,1687), LHSModelId (page_model.py:1625-1626,1685), Operator (page_model.py:1646-1647,1683), RHSType (page_model.py:1634-1635,1688), RHSVariable (page_model.py:1643-1644,1689), RHSValue (page_model.py:1640-1641,1690), RHSModelId (page_model.py:1637-1638,1691), HasArguments (page_model.py:1649-1650,1694), Criteria back-ref (page_model.py:1697).

---

## 2. VIEW metadata

A view "draft blob" stores its config under a `Root` key. Helpers: `metadata/server/generator/view_helpers.py`, `form_view.py`. Routes: `metadata/route/{form_view,case_view,dataset_view,project_view}.py`. Filter/operator constants: `base/base/constants/__init__.py`.

### 2.1 Common view-blob envelope

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| BaseModel | string | Parent form/case/dataset ID | view_helpers.py:47; route/form_view.py:68 |
| Id | string | View ID | view_helpers.py:46 |
| Root | string | Root model ID (e.g. List_01 / Kanban_01) | view_helpers.py:48 |
| Name | string | View name | view_helpers.py:61 |
| [Root].Name | string | View name (inside view config) | view_helpers.py:73-74 |
| [Root].Description | string (optional) | View description | view_helpers.py:79,91 |
| [Root].Columns | array<Column> | Displayed fields | server/generator/form_view.py:22,42; view_helpers.py:103-110 |
| [Root].AllColumns | boolean | Show-all vs selected columns | server/generator/form_view.py:21; view_helpers.py:265-285 |
| [Root].Sort | array<Sort> | Sort config — see §2.5 | server/generator/form_view.py:22 |
| [Root].Filter | object | Filter config — see §2.5 | server/generator/form_view.py:23 |
| [Root].QuickFilter | array | Quick-filter config | server/generator/form_view.py:24 |
| [Root].FilterParam | object | Filter parameters | server/generator/form_view.py:26 |
| [Root].Styles | object | Appearance/styling | server/generator/form_view.py:27 |

### 2.2 Form / Dataset View — Column object

(Dataset views share the Form-view Column structure.)

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Id | string | Field ID from parent model | view_helpers.py:124,171 |
| Name | string | Column display name | view_helpers.py:172 |
| Type | string | Field type (Text/Number/DateTime/User…) | view_helpers.py:173 |
| IsSystemField | boolean | System field flag | view_helpers.py:174 |
| IsInternal | boolean | Internal field flag | view_helpers.py:175 |
| Model | string | Model/view ID | view_helpers.py:176 |
| Kind | "Field" | Discriminator | view_helpers.py:177 |
| ReadOnly | boolean | Column read-only | view_helpers.py:178 |
| Required | boolean | Field required | view_helpers.py:179 |
| Widget | object\|null | Widget config | view_helpers.py:180 |
| MapTo | string\|null | Gallery card slot — see §6.13 | view_helpers.py:181,535 |
| IsSecondary | boolean\|null | Secondary field flag | view_helpers.py:182 |
| Width | int\|null | Column width (px) | view_helpers.py:186-188 |

**Gallery-view extras**: `[Root].Card_layout` (view_helpers.py:296-319), `[Root].Card_size` (view_helpers.py:321-344), `[Root].Card_type` (view_helpers.py:346-370), `[Root].Card_border` (view_helpers.py:372-392). Enum values in §6.10-§6.13.

### 2.3 Case View

Envelope adds `[Root].Visualization` (List/Kanban/Matrix/Timeline), `[Root].GroupBy` object, `[Root].Model`, `[Root].IncludeSubitem`. (route/case_view.py:147-149; service `case_view_service.py:66-79`.)

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| [Root].Visualization | enum (BoardViewType) | View type — §6.10 | case_view_service.py:66 |
| [Root].GroupBy | object | Grouping config (shape varies by view) | case_view_service.py:68-79; route/case_view.py:147 |
| [Root].Model | string | Application/model ID | view_helpers.py:891 |
| [Root].IncludeSubitem | boolean (optional) | Include sub-items | route/case_view.py:149 |
| [Root].Sort | array<Sort> | Sort | view_helpers.py:950-957 |
| [Root].Filter | object | Filter | view_helpers.py:959-966 |
| [Root].Columns | array | Columns (Kanban/Matrix carry only `{Id}`) | view_helpers.py:978-987,1115-1134 |

**GroupBy by view type** (case_view_service.py:69-75):
- LIST → `{}` (74); KANBAN → `{Column: "_status_id"}` (69); MATRIX → `{Column: "_status_id", Row: "_assigned_to"}` (70-72); TIMELINE → `{}` (75).
- Matrix GroupBy keys: `Row` (view_helpers.py:1204-1237), `Column` (view_helpers.py:1214-1252).

Case-view default columns (base/base/constants/metadata/case.py:174-192): `_item_id`, `Name`, `AssignedTo`, `DueDate`, `_start_date`, `_priority_name`, `_status_name`.

### 2.4 Project View

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| ViewType | enum (List/Kanban/Matrix) | View type | service project_view_service.py:31; route/project_view.py |
| ProjectId | string | Parent project ID | project_view_service.py:32 |
| LastSavedAt | string (ISO) | Last save timestamp | project_view_service.py:33 |
| GroupBy | object | Grouping (LIST→`{}`; MATRIX→`{Row:[{Id:"AssignedTo"}]}`) | project_view_service.py:34-41 |
| Filter | object | Filter (sanitized) | project_view_service.py:107-108 |

### 2.5 Shared Sort & Filter

**Sort** array element: `Column` (field ID) + `Order` (asc/desc). e.g. `[{"Column":"_created_at","Order":"desc"}]` (test_view_helpers.py:87). See §6.14.

**Filter** keys (base/base/constants/__init__.py): `LHSField` (365), `LHSOwnField` (366), `Operator` (367), `OperatorLabel` (368), `RHSType` (369; Value/Field/FilterParam 384-386), `RHSValue` (370), `RHSField` (371), `RHSParam` (372), nested `Filter` (374), logical `AND` (361) / `OR` (362). Operators enum in §6.15.

---

## 3. WORKFLOW (process) & CASEFLOW (case)

Process model: `metadata/server/generator/model/process_model.py`, `subflow_model.py`, `criteria_model.py`. Workflow constants: `base/base/util/workflow_constants.py` (TaskTypes), `process/engine/util/workflow_constants.py` (ResourceValueType). Case model: `case_model.py`.

### 3.1 ProcessDef (Workflow)

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Name | string | Process definition name | process_model.py:461 |
| Model | ref<Model> | Parent FormModel | process_model.py:462 |
| Activity | ref<Activity> | Parent activity (sub-process) | process_model.py:463 |
| WorkflowType | string | Sequence type (e.g. "Sequence") | process_model.py:464 |
| IsSuspended | boolean | Suspended flag | process_model.py:465 |
| SuspendedAt | string | Suspension timestamp | process_model.py:466 |

Relations: one-to-many Activity, Expression (process_model.py:450); many-to-one Model, Activity (process_model.py:452-456).

### 3.2 Activity / Step

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| ProcessDef | ref<ProcessDef> (required) | Parent process | process_model.py:629 |
| NodeType | enum (TaskTypes) | Activity type — §6.16 | process_model.py:630 |
| Name | string (required) | Activity name | process_model.py:631 |
| Description | string | Activity description | process_model.py:632 |
| Goto | ref<Activity> | Next activity | process_model.py:633 |
| Permission | ref<Permission> | Activity permission | process_model.py:634 |
| AssignmentRule | string | Any/RoundRobin/LeastLoaded | process_model.py:635 |
| ApproverCount | number | Count of approvers | process_model.py:636 |
| ApproverUnit | string | Unit for approver count | process_model.py:637 |
| IsSuspended | boolean | Suspended status | process_model.py:638 |
| IsEmailActionEnabled | boolean | Email action enabled | process_model.py:639 |
| SuspendedAt | string | Suspension timestamp | process_model.py:640 |
| EnforcePreviousApprover | boolean | Force previous approver | process_model.py:641 |
| IsSelfPickEnabled | boolean | Self-pick enabled | process_model.py:642 |
| DestinationModelName | string | Destination model name | process_model.py:643 |
| SendBackAssignmentType | enum (InitialAssignees/Approvers) | Send-back target | process_model.py:644-650 |
| BaseMetadata | string | Base metadata reference | process_model.py:651 |

Relations: one-to-many ProcessDef, Resource, Permission, Appearance, SLA, Expression, SendBackActivity, ModelMapping (process_model.py:605-617); many-to-one ProcessDef, Goto (process_model.py:620-625).

### 3.3 Resource (assignee / notification recipient)

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Activity | ref<Activity> | Parent activity (assignee context) | process_model.py:792 |
| SLABreach | ref<Activity> | Parent for SLA-breach notification | process_model.py:793 |
| Field | ref<Field> | Field dependency | process_model.py:794 |
| RestrictReassign | ref<RestrictReassign> | Reassignment restriction | process_model.py:795 |
| Value | string | Resource ID/value | process_model.py:796 |
| ValueType | enum (ResourceValueType, required) | Resource kind — §6.17 | process_model.py:797 |
| DisplayValue | string | Display name | process_model.py:798 |

### 3.4 Activity::Permission

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Activity | ref<Activity> (required) | Parent activity | process_model.py:695 |
| Column | ref<Column> (required) | Column being controlled | process_model.py:696 |
| Permission | enum (Editable/ReadOnly/Hidden) | Permission level — §6.20 | process_model.py:697 |
| Label | string | Button label | process_model.py:698 |
| IsSendbackEnabled | boolean | Send-back enabled | process_model.py:699 |

Relations: one-to-many Criteria, RefreshField, SendBackActivity, RestrictReassign (process_model.py:679-686); many-to-one Activity, Column (process_model.py:687-692).

### 3.5 SLA & Notify

**SLA**: Activity ref (process_model.py:820), ActivityDefaultSLA ref (821), Value number (822), Unit string Minutes/Hrs/Days (823). One-to-many Notify, Expression, Criteria (811).

**Notify**: SLA ref (required, 845), Type Notify/Escalate (846), When before/after (847), Unit (848), Value (849), ValueType User/Group/Field/Expression (850), To recipient ID (851), Field ref (852).

### 3.6 Transition / Condition (Criteria)

`Criteria`: IsOR boolean (criteria_model.py:53-60); parents Permission/SLA (process_model.py:335). `Condition`: Operator (criteria_model.py:94-101), RHSType Value/Field (112-119), RHSValue (121-128), RHSField (130-137), LHSField (139-146), HasArguments (148-155). Operators enum §6.18.

### 3.7 Subflow ModelMapping / FieldMapping

**ModelMapping** (subflow_model.py:174-184): LHSModel, LHSRootModel, LHSModelType (Case/Process), RHSModel, RHSRootModel, RHSModelType (Case/Process/null); Activity back-ref (process_model.py:876).

**FieldMapping** (subflow_model.py:57-64): ModelMapping ref, LHSField ref (required), RHSType (Field/Value/Expression, required), RHSFieldModel, RHSField ref, RHSValue, IsRHSSystemField, IsLHSSystemField.

### 3.8 CaseFlow (Status workflow)

**CaseFlow** (case_model.py:435-440): Description, FlowType, Id, Model ref, Name, Type. One-to-many Status, State (432).

**CaseStatus** (case_model.py:544-561): Name, Description, Category (NotStarted/InProgress/Completed), IsSystem, OutwardStatus list, ColorCode, DestinationModel, DestinationModelType, DestinationModelName, Icon, Resources list, EntryRule list, ExitRule list, Rule list, SLADisabled, CaseFlow ref, SLABreachResources list, Type (User/Subflow). Relations one-to-many ModelMapping, Expression, Rule (564-570).

**CaseRule** (case_model.py:612): Status ref. One-to-many Criteria, Action (subflow_model.py:229).
**CaseCondition** (case_model.py:641-643): LHSField, RHSField, RHSValue.
**CaseAction** (subflow_model.py:252-256): Rule ref, ActionType, ModelId, ModelType, ActionParams list.

### 3.9 Case Permission

**CasePermission** container (case_model.py:174-176): Name (required), Type (User/Subflow), FlowType. One-to-many Permission (171).

**Permission** (case column permission) (case_model.py:216-220):

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| CasePermission | string | Parent container ID | case_model.py:216 |
| Column | string | Column ID | case_model.py:217 |
| Permission | enum (Editable/ReadOnly/Hidden) | Permission level | case_model.py:218 |
| Status | string | Status ID | case_model.py:219 |
| Model | ref<Model> | Model reference | case_model.py:220 |

---

## 4. PERMISSION model

### 4.1 Permission object shapes (where the `{Status, Column, Permission}` shape appears)

- **Case column permission** — `{CasePermission, Column, Permission, Status, Model}` — case_model.py:216-220.
- **Process Activity::Permission** — `{Activity, Column, Permission, Label, IsSendbackEnabled}` — process_model.py:695-699.
- **Form-view / case-view `Model::Permission`** — field-level permission within a view model definition; resolved against `VIEW_MODEL_DEFINITION` at runtime (metadata blob `Model::Permission`, `Field::Permission`).

### 4.2 Permission levels (field/column visibility) — §6.20

`businessobject/core/utils/constant/view_constant.py` → class `ViewPermission`: `READONLY = "ReadOnly"`, `EDITABLE = "Editable"`, `HIDDEN = "Hidden"`. Mirrored in `case/constant/constants.py` classes `StatusFieldVisibility` (1202-1204) and `ViewFieldVisibility` (1455-1457). Note: **Mandatory** is a form-field requiredness concept, not a member of `ViewPermission` — **confirmed-absent (2026-06-25)**: no `"Mandatory"` string appears in any `ViewPermission`/`StatusFieldVisibility`/`ViewFieldVisibility` class; the only "MANDATORY" hits repo-wide are the English word in axiom prompt/schema text (`config/axiom/schema/app_copilot_schema.py`, `…/prompt/app_copilot_prompts.py`). Stays **(unverified)** as a permission member.

### 4.3 Action / capability permissions (`base/base/auth/permissions.py`)

**Permissions (base, lines 10-20):** ADMIN="Admin", VIEW="View", ASSIGNEE="Assignee", PARTICIPATED="Participated", VIEW_CHILD="ViewChild", IMPERSONATOR="Impersonator", WALL_VIEW="WallView", TEAM_READ_ONLY="TeamReadOnly", READONLY="ReadOnly", EXTERNAL_COMMENTER="ExternalCommenter". `SYSTEM_PERMISSIONS` = [ASSIGNEE, PARTICIPATED, VIEW_CHILD, WALL_VIEW, TEAM_READ_ONLY, IMPERSONATOR, EXTERNAL_COMMENTER] (lines 21-29).

**CasePermissions (lines 32-107):** ManageGeneralSettings, ViewGeneralSettings, ViewShareSettings, ManageShareSettings, ManageNotifications, ViewNotifications, ViewCaseHome, ManageCustomFilters, ViewAuditLog, ManageBulkActions, BulkDelete, CreateNote, ViewNotes, EditNote, DeleteNote, ViewItemTransition, ViewItemActivity, CreateItem, ModifyItem, ModifyPriority, ModifyRequester, ModifyDueDate, ModifyStartDate, ModifyAssignee, MoveItem, DeleteItem, GetItem, GetAllItem, GetAssignedItem, GetInitiatedItem, AssignableUser, DeleteCaseSystem, DuplicateCaseSystem, ArchiveCaseSystem, ModifyFormWizard, ManageReports, ShareReports, ViewReports, ModifyStatusSettings, ViewStatusSettings, ExportCase, AddWatcher, RemoveWatcher, ViewWatchers, CreateSubitem, DeleteSubitem, GetSubitems, GetSubitem, UpdateSubitem, MoveSubitem, ConvertSubitemToItem, ConvertItemToSubitem, ChangeSubitemParent, GetSubitemPreference, CreateSubitemPreference, ViewSubitemActivity, ViewMetrics, ManageMetrics, MetricActions, ViewMetricItems, CreateViews, AccessViews, EditViews, ShareViews, DeleteViews, ManageViews, BulkItemCreate, BulkSubitemCreate, ItemPrint, SubitemPrint, ManageAttachment, ApplyFilterToSubitem, ArchiveItem, CaseViewAccess.

**ProcessPermissions (lines 132-154):** EditProcess, PublishProcess, InitiateItems, CreateReports, ManageReports, EditReports, AccessProcess, ShareReports, DeleteReports, ViewAllReports, ViewForm, ViewMetrics, ViewProcessAdministration, ModifyItem, DeleteItem, CreateComments, EditComments, DeleteComments, ViewComments, Admin, ProcessAdmin, GeneratePdfDocument.

**ProjectPermissions (lines 113-130):** AccessProject, ManageProject, ManageProjectMembers, ManageView, AccessView, ManageReport, ManageReportShare, ManageSubProject, AccessSubProject, CreateItem, ModifyItem, DeleteItem, CreateNote, EditNote, DeleteNote, CreateReport.

**DatasetPermissions (183-186):** Edit, Share, ReadOnly. **FormPermissions (243-249):** Edit, Delete, Share, ReadOnly, InitiateItems, ViewAllReports. **ApplicationPermissions (227-236):** ViewApp, Edit, Share, EditApp, TestApp. **TeamPermission (199-207):** Moderator, Member, ManagePost, ManageComment, ManageReaction, ManageReply, Edit, WallFollower. **DecisionTablePermissions (271-272):** RuleEdit.

### 4.4 Role definitions (`base/base/auth/roles.py`)

`*RoleDefinition` dicts map a role → `{implicit_permissions, applicable_permissions}`:

| Role definition | Roles & key grants | file:line |
|---|---|---|
| ProcessRoleDefinition | ADMIN→ProcessPermissions.ADMIN; MEMBER→VIEW,INITIATE_ITEMS,EDIT_PROCESS,MANAGE_REPORTS…; ProcessDeveloper→+PUBLISH_PROCESS; ReportAdmin; DataAdmin | roles.py:174-271 |
| CaseRoleDefinition | ADMIN, MEMBER (≈47 perms), INITIATOR, RESTRICTEDMEMBER, VIEWER | roles.py:343-535 |
| CaseViewRoleDefinition | ADMIN, MEMBER (≈29 perms), VIEWER | roles.py:541-639 |
| FormRoleDefinition | ADMIN→FormPermissions.ADMIN; MEMBER→VIEW,EDIT,SHARE(+DELETE); INITIATOR→READONLY,INITIATE_ITEMS; VIEWER→READONLY | roles.py:768-793 |
| ProjectRoleDefinition | ADMIN→ProjectPermissions.ADMIN; MEMBER (10 perms +manage) | roles.py:292-322 |
| DatasetRoleDefinition | ADMIN; MEMBER→READONLY,EDIT,SHARE; VIEWER→READONLY | roles.py:652-675 |

---

## 5. APP-LEVEL documents

Application model: `metadata/server/generator/model/application_model.py`. Flow constants: `base/base/constants/metadata/flow.py`. App variables: `base/base/constants/metadata/application_variables.py` + `application/schema/app_variable.py`. Integration: `integration/.../metadata_constant.py`. Report appearance: `metadata/server/generator/model/report_model.py`.

### 5.1 Application document

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Name | string | Application name | application_model.py:54 |
| Description | string | Application description | application_model.py:57-58 |
| DefaultPage | string | Default page ID | application_model.py:101 |
| FlowType | string | App type (APPLICATION/PORTAL) | application_model.py:158 |
| BuildNumber | int | Build version number | flow.py:113 |
| VersionNumber | string | Version number | flow.py:114 |
| DeployInfo | object | Deployment info | flow.py:111 |
| AppTemplate | string | Application template reference | flow.py:137 |
| Permissions | object | App-level permissions | flow.py:95-96 |
| Settings | object | App-wide settings | flow.py:139 |
| Theme | object | Theme config (see §5.2) | accounts.py:440-442 |
| Languages | array | Supported languages | flow.py:652 |
| _is_translation_enabled | boolean | Translation feature flag | flow.py:651 |
| _metadata_version | string | Metadata version | flow.py:107 |
| _last_saved_at | timestamp | Last save | application_model.py:178 |
| LastPublishedAt / LastPublishedBy | timestamp / string | Publication audit | flow.py:60-61 |
| CreatedAt/CreatedBy/ModifiedAt/ModifiedBy | SystemMeta | Audit metadata | flow.py:150-151 |
| Status | string | App status | flow.py:64 |
| Categories | array | App categories | flow.py:63 |
| Visibility | string | Visibility setting | flow.py:70 |
| Appearance | object | UI appearance (see §5.5) | report_model.py:112-137 |

### 5.2 Theme

`Theme.Colors` (accounts.py:440), `Theme.Font` (441), `Theme.ApplyBackground` (442). Color ref `Color.Primary.500` (accounts.py:526-527). `Theme.CustomColors[...]` — **(unverified — confirmed-absent 2026-06-25)**: grep for `CustomColors` across the entire `/Users/dinesh/Projects/kissflow-xg` tree returns ZERO hits. No source backing; do not rely on this attribute name.

### 5.3 App Variables document

| Attribute | Type/values | Meaning | file:line |
|---|---|---|---|
| Name | string (required, unique) | Variable name | app_variable.py:15; app_variable_service.py:72 |
| Description | string | Description | app_variable.py:16 |
| DataType | enum (VariableTypes, required) | Data type — §6.21 | app_variable.py:17; application_variables.py:30 |
| DefaultValue | any | Default value | app_variable.py:18 |
| Schema | object | JSON schema (Json/ObjectList/StringList) | application_variables.py:9; app_variable_service.py:95-97 |
| CreatedAt / CreatedBy | timestamp / string | Audit | app_variable_service.py:87-88 |
| SessionVariables | array | Active session variable names | application_variables.py:10 |
| SysConfig | object | Per-type limits — §6.22 | application_variables.py:12; app_variable_service.py:39-42 |

### 5.4 Integration document (Connector / Trigger / Action)

**Connector** (metadata_constant.py): Id (6), Name (7), Kind="Connector" (8), Type (9), Version (connector_base_model.py:21), Organization (24), Authentication (147), AuthType (208; enum §6.25), Action[] (14), Trigger[] (15), Logo (209), IsBuiltIn (17), IsTested (18), IsActive (19).

**Action** (metadata_constant.py): ActionId (25), Name (7), Kind (8; type enum §6.23), Connector (27), Connection (28), Property[] (29), InputFields (159), OutputFields (160), SampleOutput (163), Expression (30), IsAsync (219).

**Trigger** (metadata_constant.py): TriggerId (trigger_model.py:17), Name (7), Kind (8; type enum §6.24), Connector (27), Connection (28), InputFields (159), OutputFields (160), TriggerRequestConfiguration (182), Subscribe (183), Unsubscribe (184), WebhookVerification (210), PollingConfiguration (220), Token (64).

**Field/Property** (metadata_constant.py): Id (185), Name (7), Label (165), Type (70-77; enum §6.26), IsRequired (166), IsDropdown (170), IsVisible (113), IsMultiValue (100), IsDynamicField (167), Dropdown (173), AuthRequest (150).

### 5.5 Report / View appearance (report_model.py:112-137)

`Appearance.ColorPalette` (114), `Appearance.Labels.{DataLabel,Legend,XAxisLabel,YAxisLabel}` (117-120), `Appearance.ScaleType` (123), `Appearance.HeatMap` (124), `Appearance.Total.{ColumnSubtotal,ColumnTotal,GrandTotal,RowSubtotal,RowTotal}` (127-131), `Appearance.ValueCalculation` (134), `Appearance.DrilldownEnabled` (135).

---

## 6. Enumerations (master list)

### 6.1 ContainerType — `page_model_constants.py:73-80`
`Container`(74), `Body`(75), `Tab`(76), `Popup`(77), `MasterDetail`(78), `Column`(79), `Layout`(80). Also `Component` used as a wrapper type (page_model.py:461).

### 6.2 LayoutType — `page_model_constants.py:83-85`
`grid`(84), `flex`(85).

### 6.4 FieldMapping.Type
`Value` (entity_factory.py:117), `Variable` (entity_factory.py:206), `FilterParam` (widget_transformer.py:653,852), `Code` (entity_factory.py:239), `Popup` (entity_factory.py:270), `Richtext` (test_024_integration_serializer.py:138; serializer_constants.py:366). `Object` (widget_transformer.py:648,849 — FieldMapping for `filterParameters`; real export fixtures). `Hiddenproperty` (fixture `metadata/tests/mock/metadata/draft/Page001.json:827`). `TooltipPositionPicker` (fixture `draft/Page001.json:1401`). Also export-confirmed: `Style` (fixture `draft/migration_test_page_A00.json:224`), `Icon` (widget_transformer.py:146; fixture `Draft_General_Widgets_Page_A00.json:267`), `Toggle` (fixture `draft/Page001.json:1312`), `Dropdown` (fixture `draft/Page001.json:165`). `TypePicker` — **(unverified: ZERO hits repo-wide — no constant and not in any fixture)**.

### 6.5 PropertyTypes — `page_model_constants.py:88-94`
`Page`(89), `SimpleFilter`(90), `FilterParam`(91), `Object`(92), `Value`(93), `Variable`(94). `Code` — **CONFIRMED** `entity_factory.create_code_property` emits `Type:"Code"` (entity_factory.py:239), read at reverse_transformer.py:720; fixture `draft/Page001.json` has `"Type":"Code"`. `Popup` — **CONFIRMED** `entity_factory.create_popup_property` emits `Type:"Popup"` (entity_factory.py:270), read at reverse_transformer.py:723; fixture `draft/Page001.json` has `"Type":"Popup"`.

### 6.6 EventMapping.Type — `widget_transformer.py`
`JSAction`(116,186), `OpenPopup`(131,343). `Redirection` — **CONFIRMED** as a real EventMapping.Type value: authoring doc `metadata/config/axiom/context/page.md:924,1234,1237` and `base/base/constants/metadata/notification.py:104`; also in fixture (`Draft_…`/`Schema_…` page exports). (Not present in the ProfServ export, but real in source.)

### 6.7 EventMapping.Name — `widget_transformer.py`
`on_click`(116,131), `on_load`(186). `on_submit` — **CONFIRMED** in real export fixture `metadata/tests/mock/metadata/Draft_Add_menu_list_A00.json`. `on_change` — **CONFIRMED** as a real value in `base/base/util/notification_metadata.py:2914` and fixture `draft/Page001.json:1973`. (Also real, beyond §6.7: `on_discard` — fixture `Schema_Process_Views_Page_A00.json`.) NOTE: `on_close` and `on_tab_change` (claimed in DELTA_ProfServ_page.md) have **ZERO source hits** — no constant, no fixture, not in page.md — treat as **(unverified / unbacked)**.

### 6.8 VariableRefTypes — `model_constants.py:167-170`
`InputParameter`(168), `ApplicationVariable`(169), `EventParameter`(170). `DatasourceParameter` (entity_factory.py:182). `PageVariable` — **CONFIRMED** as a real VariableRef.Type: authoring doc `metadata/config/axiom/context/page.md:181-182,1266,1279-1282` and real export fixture `metadata/tests/mock/metadata/draft/Page001.json` (`"Type":"PageVariable"`).

### 6.9 Style.Value keys — `page_model_constants.py:4-62`
Flex: flex, flexWrap, flexDirection, rowGap, columnGap. Alignment: alignItems, justifyContent, alignContent, overflow. Padding: paddingBlockStart/End, paddingInlineStart/End, padding. Margin: marginBlockStart/End, marginInlineStart/End, margin. Border: borderStyle, borderColor, borderBlockStartWidth, borderBlockEndWidth, borderInlineStartWidth, borderInlineEndWidth, border. Radius: borderStartStartRadius, borderStartEndRadius, borderEndStartRadius, borderEndEndRadius. Sizing: width, height, maxWidth, minWidth, minHeight, maxHeight, boxSizing. Misc: display, outline, outlineOffset, boxShadow, position, background, backgroundSize, cursor, fontStyle, fontWeight, textDecorationLine.

### 6.10 BoardViewType (case/project) — `base/base/constants/metadata/flow.py:551-555`
`List`(552), `Kanban`(553), `Matrix`(554), `Timeline`(555).

### 6.10b FormViewType — `flow.py:611-616`
`List`(612), `Kanban`(613), `Matrix`(614), `Grid`(615), `Table`(616).

### 6.11 Card_layout (gallery) — `view_helpers.py:303` — Matrix / Horizontal / Vertical.
### 6.12 Card_size — `view_helpers.py:328` — Small / Medium / Large / Extra large.
### 6.12b Card_type — `view_helpers.py:365` — Style 1…Style 6.
### 6.13 MapTo (gallery card slots) — `view_helpers.py:516,535` — "Title caption" / "Title" / "Subtitle" / "Image" / null.

### 6.14 Sort Order — `test_view_helpers.py:87` — `asc` / `desc`.

### 6.15 Filter OPERATORS — `base/base/constants/__init__.py:345-358`
`=`(345), `!=`(346), `>`(347), `<`(348), `>=`(349), `<=`(350), `in`(351), `not in`(352), `contains`(353), `not contains`(354), `between`(355), `~`(356), `EMPTY`(357), `NOT_EMPTY`(358).

### 6.16 Activity NodeType (TaskTypes) — `base/base/util/workflow_constants.py:38-46`
`StartEvent`(39), `MultiUserTask`(40), `Parallel`(41), `UserTask`(42), `EndEvent`(43), `SendBackToInitiator`(44), `GotoTask`(GoTo=45), `Subflow`(46).

### 6.17 ResourceValueType — `process/engine/util/workflow_constants.py:219-228`
`User`, `Group`, `AppRole`(222), `ServiceAccount`(223), `Field`, `Expression`, `FlowDataset`(226), `FlowForm`, `FlowUser`, `FlowTable`.

### 6.18 Condition operators (workflow) — `base/base/constants/__init__.py`
EQUAL_TO, NOT_EQUAL_TO, GREATER_THAN, GREATER_THAN_OR_EQUAL_TO, LESS_THAN, LESS_THAN_OR_EQUAL_TO, CONTAINS, NOT_CONTAINS, PART_OF, NOT_PART_OF, BETWEEN, EMPTY, NOT_EMPTY (see §6.15 symbols).

### 6.19 SendBackAssignmentType — `process_model.py:644-650` — InitialAssignees / Approvers.

### 6.20 Permission levels (ViewPermission) — `businessobject/core/utils/constant/view_constant.py`
`ReadOnly`, `Editable`, `Hidden`. (Also case/constant/constants.py StatusFieldVisibility 1202-1204; ViewFieldVisibility 1455-1457.) `Mandatory` — **(unverified — confirmed-absent 2026-06-25)**: not a member of any visibility/permission class; only appears as the English word in axiom prompts. Field requiredness is modeled elsewhere (form-field `IsRequired`/`Required`), not via this enum.

### 6.21 App-variable VariableTypes — `base/base/constants/metadata/application_variables.py:30-37`
`Number`(31), `Text`(32), `DateTime`(33), `Boolean`(34), `Json`(35), `ObjectList`(36), `StringList`(37).

### 6.22 Variable SysConfig limit keys — `application_variables.py:17-27`
MaxRootObjectKeys, MaxRootArrayItems, MaxNestedObjectKeysLevel1/2/3, MaxArrayItems, MaxArrayItemObjectKeys (defaults at lines 42-61).

### 6.23 Integration Action types — `metadata_constant.py`
IfAction, ForAction, DelayAction, ConditionalAllPathsAction, ConditionalFirstPathAction, FileDownload (lines 22-55).

### 6.24 Integration Trigger types — `metadata_constant.py:58-67`
Webhook, Scheduler, PrivateWebhook, PublicWebhook, POLLING, QueueTrigger, CustomTrigger.

### 6.25 Integration AuthType — `metadata_constant.py:142-200`
NoAuth, OAuth2, OAuth1, BasicAuth, CustomAuth, UserToken.

### 6.26 Integration Field types — `metadata_constant.py:70-77`
String, Password, Text, Integer, Number, Boolean, DateTime.

### 6.27 Case Status Category — `case_model.py:408,428`
`NotStarted` / `InProgress` / `Completed` — **CONFIRMED** as string constants: `base/base/constants/subflow.py:23-24` (`IN_PROGRESS="InProgress"`, `COMPLETED="Completed"`), `base/base/constants/big_data_constant.py:38` (`NOT_STARTED="NotStarted"`), `case/constant/constants.py:1187` (`COMPLETED="Completed"`); used as `_category` values in `case/config/default_items.py:106` (`"_category":"InProgress"`) and lines 30/41/92 (`NotStarted`).

---

## 7. Missing from live observation

Source attributes present in the repo but **not observed in the live JSON dumps** that the plugin reference was built from (candidate additions / things to confirm against a real export):

- **Page**: `Page::VariableRef` relation array (serializer_constants.py:436); `_application_id` / `FlowType` envelope keys (entity_factory.py:20,24).
- **Container**: `IsSystem` (763), `haveHeightLimit` (767), full `LayoutConfig` 8-key shape (769-777), `Tab`/`Popup`/`MasterDetail` back-refs (759-761).
- **Component**: `Data.visualization_type` and `Data.category` (page_model.py:1074-1084) — rarely seen in dumps.
- **FieldMapping/Property/EventMapping** unverified enum members (§6.4, §6.5, §6.6, §6.7): **NOW CONFIRMED (2026-06-25)** against real page-export fixtures + builder source — `Object`, `Hiddenproperty`, `TooltipPositionPicker`, `Style`, `Icon`, `Toggle`, `Dropdown` (FieldMapping); `Code`, `Popup` (Property); `Redirection` (EventMapping.Type); `on_change`, `on_submit`, `on_discard` (EventMapping.Name). **Still unbacked:** FieldMapping `TypePicker` (zero hits); EventMapping names `on_close` / `on_tab_change` (claimed in the ProfServ delta but zero hits anywhere). See §6.4/§6.6/§6.7.
- **VariableRef**: `PageVariable` type — **CONFIRMED** (page.md:181; fixture `draft/Page001.json`).
- **View**: `QuickFilter`, `FilterParam`, `Styles` on dataset views; Gallery `Card_*` keys; case `IncludeSubitem`.
- **Process Activity**: `EnforcePreviousApprover`, `IsSelfPickEnabled`, `IsEmailActionEnabled`, `SendBackAssignmentType`, `BaseMetadata` — uncommon in simple-workflow dumps.
- **CaseStatus**: `EntryRule`, `ExitRule`, `SLABreachResources`, `SLADisabled`, `Icon`, `OutwardStatus`.
- **Permission**: `Mandatory` level (**unverified — confirmed-absent 2026-06-25**, not a ViewPermission member; only the English word in axiom prompts); `Activity::Permission.IsSendbackEnabled` + child `RefreshField`/`RestrictReassign`.
- **Application**: `Theme.CustomColors[...]` (**unverified — confirmed-absent 2026-06-25**, ZERO repo-wide hits), `DeployInfo` internal shape, `Permissions` object internal shape, `Settings` internal shape — all opaque in source focus files.
- **App variable**: `SysConfig` per-type limit block (rarely present in dumps unless a complex variable is defined).
- **Integration**: full Connector/Trigger/Action/Field shape — integration docs are usually absent from page/app dumps entirely.

> **Note on line-number drift**: a small number of citations in §3 (Resource/Notify/SLA attribute lines) and §5 (integration `metadata_constant.py` enum lines) were reported by extraction agents and not all individually re-opened; the **class locations and enum value strings were verified**, but exact line offsets within those classes may drift by a few lines. The core/page/view/permission enums in §6.1, §6.2, §6.5, §6.8, §6.10, §6.15, §6.16, §6.17, §6.20, §6.21 were re-verified directly against source.
