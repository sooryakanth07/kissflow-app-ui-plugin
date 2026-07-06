# DELTA — Professional Services app: NEW model-side objects, attributes & enums

> **Source export:** `/Users/dinesh/Projects/kf-framework/ProfServAppMetadata/`
> (app `Professional_Services_Executive_Dashboard`, account-scoped; authored mostly by `flobot` / `Saran` / `Sharath`, 2023).
> **Diffed against catalogs:** `kf-author-plugin/reference/METADATA_ATTRIBUTES_model.md` (the Field/Model/QueryDefinition/Condition source-cited reference),
> `kf-author-plugin/reference/OBSERVED_OBJECTS.md` (the IT-Asset-Management live-API observed catalog),
> and `/Users/dinesh/Projects/kissflow-xg/AUTHORING_API_MAP.md`.
> **Source verified against:** `/Users/dinesh/Projects/kissflow-xg/` (the company's own server source). Citations are `path:line`.
> "data-only" = present in the export but no matching string constant / class found in the grepped source paths (presentation/serialization config persisted only in the blob).
>
> This is a DELTA: it documents what is NEW or under-documented relative to the two catalogs. Already-cataloged Field/Model/Condition/Criteria/QueryDefinition/Node/Expression attributes are NOT re-listed unless this app surfaces a new attribute or enum value on them.

---

## 0. Export folder format → object-model mapping  (for an importer/exporter)

Every authoring object is a **folder**. Within it, the object's own document is `flow/<id>.json` and its entity-graph blob is `metadata/<id>.json`. Sub-objects nest as named sub-folders. Both files are named `<id>.json` (id == folder name).

```
<objectType>/<ObjectId>/
    flow/<ObjectId>.json          # the "flow doc": identity, access (SharedWith/PageAccess),
                                  #   Security, Status, ChildTables, Type, _application_id, _doc_version,
                                  #   LastPublishedAt, + type-specific header keys (ViewType, Parent, ListItems…)
    metadata/<ObjectId>.json      # the entity-graph blob: flat map keyed by node Id,
                                  #   {Root, <id>:{Id,Kind,…}, …, PublishedAt, _meta_version}
                                  #   relations are arrays under "Parent::Child" keys
    <subObjectType>/<SubId>/{flow,metadata}/<SubId>.json   # nested sub-objects
```

| On-disk path | Object model | flow doc? | metadata blob? | Notes |
|---|---|---|---|---|
| `application/<App>/flow,metadata` | **Application** | yes | yes (nav graph) | metadata blob = Application→Navigation→Menu→SubMenu→FieldMapping→Property (NOT the pages) |
| `application/<App>/page/<Page>/flow,metadata` | **Page** | yes | yes | page-builder graph (documented in `METADATA_ATTRIBUTES_page.md`; out of scope here) |
| `form/<Form>/flow,metadata` | **Form** | yes | yes (Model/Field graph) | |
| `form/<Form>/formview/<View>/flow,metadata` | **FormView** ★new | yes | yes (view-def: BaseModel/Columns/Filter/Sort) | nested under its Form |
| `list/<List>/flow` | **List** ★new | yes | **none** | option list — flow doc only (no metadata blob) |
| `process/<Proc>/flow,metadata` | **Process** | yes | yes (Model/Field + ProcessDef/Activity/Resource) | |
| `process/<Proc>/report/<Rpt>/flow,metadata` | **Report** ★new blob | yes (thin) | yes (Report graph) | |
| `case/<Case>/flow,metadata` | **Case** ★new doc | yes | yes (Model/Field graph; `FlowType:"Case"`) | model blob holds NO Status/State/Priority |
| `case/<Case>/caseflow/<Cf>/metadata` | **CaseFlow / Status / State** ★new | **none** | yes only | the workflow (statuses, transitions via OutwardStatus, 4 fixed states) |
| `case/<Case>/casepermission/<Cp>/metadata` | **CasePermission / Permission** ★new | **none** | yes only | per-status column permissions |
| `case/<Case>/caseview/<View>/flow,metadata` | **CaseView** ★new | yes | yes (Kanban view-def) | board views |
| `case/<Case>/report/<Rpt>/flow,metadata` | **Report** ★new blob | yes (thin) | yes | same Report shape as process reports |
| `integration/<Int>/flow,metadata` | **Integration** ★new blob | yes (thin) | yes (Trigger/Action/FieldMapping/Property/Criteria/Condition graph) | |
| `customcomponent/<CC>/manifest/<CC>.json` | **CustomComponent** ★new | manifest only | n/a | single `manifest/<id>.json` (no flow/metadata split) |

**Relation-key convention** (in all metadata blobs): `"<ParentKind>::<ChildKind>": [childId, …]` is a one-to-many edge; children also carry a plain back-ref key `"<ParentKind>": "<parentId>"`. `"::"` is the cross-container delimiter (matches `meta/__init__.py:104`).

**Common flow-doc envelope** (shared by Application, Form, List, Process, Case, Integration, Report, FormView, CaseView): `_id, _created_at, _created_by{_id,Name,Kind}, _modified_at, _modified_by, Name, Description, Type, Icon, Status, ChildTables[{_id,Name}], ApprovalRule, _application_id, SharedWith[], PageAccess[], _doc_version` (+ `Security`, `LastPublishedAt` on most).

**Common metadata-blob envelope:** `{Root:<rootId>, <id>:{…}, …, PublishedAt:"…Z", _meta_version:"<numeric>"}`. (CaseFlow blobs also carry `force_delete_status`; Report blobs carry `_last_saved_at`.)

---

## 1. NEW object types / blob kinds

### 1.1 List  (option list) — `list/<List>/flow/<List>.json` (NO metadata blob)
Cataloged before only as a *field source* (`Select → ReferredList`) — never as a discrete flow object. It IS a flow type: `FLOW_TYPE.List="List"` (`base/base/constants/metadata/flow.py:552,612`).

| Attribute | Type/values | Example value | Example file |
|---|---|---|---|
| `Type` | `"List"` | `"List"` | `list/PS_Enquiry_Closure_Resolution_A00/flow/PS_Enquiry_Closure_Resolution_A00.json` |
| `ListItems` | string[] (the option values) | `["Not a right fit","Customer Denied","Project Confirmed","Suggestion / Advice Offered"]` | same |
| `ChildTables` | `[{_id,Name}]` (self-ref) | `[{"_id":"PS_Enquiry_…","Name":"PS Enquiry - …"}]` | same |
| `ApprovalRule` | null (all 15) | `null` | same |
| `Security` | `{AllowAllFlows, AllowedFlows}` | `{"AllowAllFlows":true,"AllowedFlows":[]}` | same |
| `PageAccess[]` | `{_id,Name,Kind,PageScore,Permission[],_created_*,_modified_*}` | `Kind:"User"`, `Permission:["Admin"]`, `PageScore:0` | same |
| `_application_id` | string | `"Professional_Services_Executive_Da_A00"` | same |
| `SharedWith` | array (empty) | `[]` | same |

Source: `ListItems` = `flow/utils/constants/route_constants.py:23` (`LIST_ITEMS`), service `flow/service/list_items_service.py:22`; caps `MAX_LIST_ITEMS_COUNT=250` (`flow/utils/constants/__init__.py:50`). `ChildTables`=`flow.py:23-24`. `ApprovalRule`=`flow.py:93`. `Security/AllowAllFlows/AllowedFlows`=`businessobject/core/server/metadata/UserCommon.py:151` + catalog `base_const.py:639,643`. `PageScore`=data-only. All 15 lists are structurally identical (differ only in `ListItems`); none has non-null ApprovalRule, non-empty AllowedFlows/SharedWith, or an Icon.

### 1.2 FormView — `form/<Form>/formview/<View>/{flow,metadata}`
NEW discrete object nested under a Form. Source-confirmed: `form/route/route_constants.py:3` (`View="FormView"`), `FLOW_TYPE.FormView` (`base_const.py:1295`), service `form/server/service/view_service.py`.

**flow doc** adds (vs the Form flow doc): `Type:"FormView"`; `Parent:{_id,Type:"Form",Name}` (back-link); `ViewType:"Gallery"`. Has no `ApprovalRule`/`Appearance`/`LastPublishedAt`.
Example: `form/Customer_Data_A00/formview/Customer_Master_View_A00/flow/Customer_Master_View_A00.json`.

**metadata blob** is a *view-definition* (not the Model graph):

| Attribute | Type/values | Example |
|---|---|---|
| `BaseModel` | string (source form id) | `"Customer_Data_A00"` |
| `AllColumns` | bool | `false` |
| `Columns[]` | per-field card-mapping (table below) | — |
| `Sort[]` | `[{Id,SortType}]` | `[]` here; fixture `{Id:<field>,SortType:"ASC"}` |
| `Filter` | AND/OR criteria tree | `{}` here; tree form `{AND:[{OR:[{LHSField,Operator,RHSType,RHSValue,RHSField,LHSAttribute,RHSAttribute}]}]}` |
| `QuickFilter[]` | `[{id,Name,Value:{AND:[…]}}]` | `[]` here |
| `Actions[]` | array | `[]` |
| `<ViewId>` self-object | `{Name,Kind:"FormView",FlowType:"FormView",Card_layout,Card_size,Card_type,Card_border}` | — |

`Columns[]` entry: `{Id (source field id), Name, Type, Model, ReadOnly, Required, IsInternal, IsSystemField, Widget:null, Width:int|null, MapTo, IsSecondary:bool|null, Decimalpoint?(Number), Kind:"Field" (some also carry lowercase `kind`)}`.
- `MapTo` enum (gallery card slot): `Title`, `Title caption`, `Sub title`, `Image`, `null`.
- Self-object `Card_*` enums are **data-only** (not in source): `Card_layout:"Matrix"`, `Card_size:"Medium"`, `Card_type:"Style 2"`, `Card_border:"Shadow"`.
Example: `form/Customer_Data_A00/formview/Customer_Master_View_A00/metadata/Customer_Master_View_A00.json`.

### 1.3 Case doc — `case/<Case>/flow/<Case>.json`
The flow doc for a Case adds case-only keys over the common envelope:

| Attribute | Type/values | Example | Source |
|---|---|---|---|
| `Type` | `"Case"` | `"Case"` | — |
| `ItemType` | string | `Enquiry`/`Project`/`Task` | `flow.py:78` |
| `Prefix` | string (item-number prefix) | `PS`/`PSP`/`TASK` | `flow.py:74` |
| `Priority` | `{Critical,High,Medium,Low}` each `{Name,Id,Sequence,Default?}` | `Low:{Sequence:1,Default:true}` | — |
| `_is_priority_enabled` | bool | `true` | `flow.py:76` |
| `_is_watcher_enabled` | bool | `true` | `flow.py:132` |
| `_disabled_category` | string[] | `[]` (Enquiry) / `["Done","ReOpened"]` (Projects/Tasks) | `flow.py:77` |
| `_default_workflow_id` | caseflow id | `Professional_Services_Enquiry_A00__A00` | `flow.py:79` |
| `CaseFlows` | caseflow id[] | `["Professional_Services_Enquiry_A00__A00"]` | `flow.py:104` |
| `_field_permission_mapping` | casepermission id | `Professional_Services_Enquiry_A00__A01` | `flow.py:80` |
| `Appearance` | `{Title:[{Type,Kind?,Id?,Value,IsSystemField?}], TitleConfig:{TitleFields,TitleTemplate}}` | — | catalog `Appearance` |
| `Security` | `{AllowAllFields,AllowAllFlows,AllowedFields,AllowedFlows}` | all `true/[]` | — |
Example: `case/Professional_Services_Enquiry_A00/flow/Professional_Services_Enquiry_A00.json`.
Priority enum (always 4): `Critical`(4) `High`(3) `Medium`(2) `Low`(1,Default). `Appearance.Title` token `Type`: `field`/`text`.

### 1.4 CaseFlow blob — `case/<Case>/caseflow/<Cf>/metadata/<Cf>.json`  (no flow doc)
Wrapper: `{Root, <CaseFlowId>:{…header…}, Status_*:{…}, State_*:{…}, PublishedAt, _meta_version, force_delete_status:""}`. `force_delete_status`: route `metadata/route/case_flow.py:93`.

**CaseFlow header** (`Kind:"CaseFlow"`, source `metadata/server/generator/model/case_model.py:432-444`): `Id, Name, Kind, Model, Type:"Case", FlowType:"CaseFlow", Description, CaseFlow::Status:[ordered status ids], CaseFlow::State:[ordered state ids]`. (`::Status`/`::State` = `metadata_blob.py:56-57`.)

**Status** (`Kind:"Status"`, source `case_model.py:535-559`):

| Attribute | Type/values | Example | Notes |
|---|---|---|---|
| `Name` | string | `Feasibility check`, `New`, `Resolved` | |
| `Category` | enum | `InProgress` | values below |
| `IsSystem` | bool | `false` / `true` (ReOpened) | |
| `OutwardStatus` | status id[] (allowed transitions OUT) | `["Status_0001_New","Status_0001_InProgress",…]` | `case.py:32`, `metadata_blob.py:329` |
| `EntryRule`/`ExitRule`/`Rule` | array | `[]` | `Status::Rule` rel `case_model.py:561-566` |
| `SLADisabled` | bool | `false` / `true` (Resolved,Closed) | |
| `SLABreachResources` | array | `[]` | present on active statuses |
| `ColorCode` | string | `""` | only on custom (non-system) statuses |
| `Resources` | array | `[]` | |
| *(source-only, not emitted here)* | `Type`(User/Subflow), `DestinationModel(/Type/Name)`, `Icon`, `CaseFlow` back-ref, `Status::ModelMapping`/`Status::Expression`/`Status::Rule` | — | subflow-only; `case_model.py:549-566` |

> **Transitions are modeled solely as each Status's `OutwardStatus` id-array** — there is no separate Transition/edge object in this export. `StartStatus`/`EndStatus`/`InwardStatus` are runtime constants (`case.py:28-30`) not serialized here.

**State** (`Kind:"State"`, fixed 4, all `IsSystem:true`; source `businessobject/core/server/metadata/SubitemBase.py:28-63`): `Id, Name, Category, IsSystem, IsDefaultState?, IsLastState?`. The four: `State_Not_Started`(NotStarted, default), `State_In_Progress`(InProgress), `State_On_Hold`(NotStarted), `State_Done`(Closed, last).
Example: `case/Professional_Services_Enquiry_A00/caseflow/Professional_Services_Enquiry_A00__A00/metadata/Professional_Services_Enquiry_A00__A00.json`.

### 1.5 CasePermission blob — `case/<Case>/casepermission/<Cp>/metadata/<Cp>.json`  (no flow doc)
Wrapper header (`Kind:"CasePermission"`, source `case_model.py:167-176`): `Id, Name, Kind, Model, Type:"Case", FlowType:"CasePermission", Description, CasePermission::Permission:[ids]` (`metadata_blob.py:58`).
**Permission** node (`Kind:"Permission"`, source `case_model.py:213-221`): `Id, Kind, Column (column id), Permission (Editable|ReadOnly|Hidden), Status (status id), CasePermission (back-ref)`. (`Model` back-ref is source-only.)
Example: `case/Professional_Services_Projects_A00/casepermission/Professional_Services_Projects_A00_A01/metadata/Professional_Services_Projects_A00_A01.json` (5 entries; Enquiry's casepermission has an empty `CasePermission::Permission:[]`).

### 1.6 CaseView blob — `case/<Case>/caseview/<View>/{flow,metadata}`
27 views total (each case: 1 user `Main_View` + 8 system: `_all,_assigned_to_me,_created_by_me,_critical,_due_this_week,_initiated_by_me,_overdue,_unassigned`).

**flow doc** adds: `Type:"CaseView"`, `ViewType:"Kanban"` (only value), `Parent:{_id,Type:"Case",Name}`, `_is_system:bool|null`, `SysConfig:{_is_shared:false}`. PageAccess `Permission:["Admin"]`.

**metadata blob** is FLAT (not a Kind-graph): `{Root, <viewId>:{…}}`. The view-config object:

| Attribute | Type/values | Example |
|---|---|---|
| `ViewType`/`Visualization` | `"Kanban"` | `"Kanban"` |
| `GroupBy` | `{Column}` (kanban swim-lane) | `{"Column":"_status_id"}` (all) |
| `Filter` | `{}` OR `{AND:[{OR:[<condition>…]}]}` | see below |
| `FilterType` | `Simple`/`Advance`/`Advanced` | `Advance` |
| `Sort` | array (always empty) | `[]` |
| `CaseId` | parent case id | `Professional_Services_Enquiry_A00` |
| `_last_saved_at`,`_is_shared`,`_is_system` | meta | — |

Filter condition object: `{Id?, LHSField, LHSAttribute, Operator, RHSType, RHSValue|RHSField}`. E.g. Overdue = `AND[OR[{_category PART_OF ["NotStarted","InProgress","ReOpened"]}], OR[{DueDate LESS_THAN "Now"}]]`; Assigned-to-me = `{AssignedTo EQUAL_TO RHSField:_current_user}`.
Source: caseview draft/softpublish `metadata/route/case_view.py:169,181`, `AUTHORING_API_MAP.md:151-153`. `ViewType:"Kanban"` literal = data-only.
Example: `case/Professional_Services_Enquiry_A00/caseview/Professional_Services_Enquiry_A00_overdue/metadata/Professional_Services_Enquiry_A00_overdue.json`.

### 1.7 Report blob — `<process|case>/<flow>/report/<Rpt>/{flow,metadata}`
**flow doc** (thin): `Type:"Report"`, `Parent:{_id,Type:"Process"|"Case",Name}`, `ReportType` (`ChartReport`|`TabularReport`), `ViewType` (visualization), `_is_system:bool` (system `_All_Items` reports), `ChildTableCount`, `StepCount`, PageAccess `Permission:["Admin"]`. Note: appearance/columns/filters are NOT here — they live in the metadata blob.

**metadata blob** (source `reportbase/reportcore/server/metadata/__init__.py`) — Kinds & key attrs:
- `Report` (root, `:218`): `Model, Type, ViewType, FilterType:"and", Appearance, Report::ReportField[], Report::Column[], Report::Value[], Report::Filter[], Report::Sort[]`.
- `ReportField` (`:808`): `FieldId, ModelId, AggregateFunction?(COUNT|SUM), ReportField::Column/Value/Sort[]`.
- `Column` (dimension, `:1109`): `{ReportField, Report}`.
- `Value` (measure, `:1201`): `{ReportField, Report}`.
- `Filter` (`:1252`, recursive): group `{Type:"Criteria", IsOR, Filter::Filter[], LHSField}` / condition `{Type:"Condition", LHSField, Operator, RHSType:"Value", RHSValue}`.
- `Sort` (`:1380`): `{ReportField, FieldId, Report}`.

`Appearance`: chart → `{ScaleType:"Linear", Labels:{XAxisLabel,YAxisLabel,DataLabel,Legend}, ColorPalette:["rgb(var(--lavender-blue))",…]}`; pivot → `{Total:{GrandTotal,ColumnTotal,RowTotal,ColumnSubtotal,RowSubtotal}, ValueCalculation:"Keep as is", HeatMap:"none"}`; tabular → `null`.
Example: `case/Professional_Services_Enquiry_A00/report/Active_Enquiries_by_Status_A00/metadata/Active_Enquiries_by_Status_A00.json`.

### 1.8 Integration blob — `integration/<Int>/{flow,metadata}`
**flow doc** (thin, NO Connectors/Entities — catalog §5's `Connectors[].Entities[]` shape is NOT in the on-disk export): `Type:"Integration"`, `IsActive:bool`, `NotificationPreference:{NotifyOnUpdate,NotifyOnFailure}`, PageAccess `Permission:["View","Admin"]`.

**metadata blob** = flat Kind-graph. Kinds (source-verified in `integration/engine/executor/`):
- `Integration` (root): `Integration::Trigger[], Integration::Action[]`.
- `Trigger`: `Type:"App", Name, Connector{_id,Name,TriggerId,TriggerName,Version,Logo,Status,WebsiteURL}, Connection{Name,_id}, IsInternalAuth, Output (sample item), IsTested, Trigger::FieldMapping[]`.
- `Action`: control (`Type:IfAction|YES|NO`, `IsBuiltIn:true`, `Connector{_id:"Control",ActionId:"IfAction"}`, `Action::Action[]`, `Action::Criteria[]`) OR external (`Type:"Create"`, `Connector{ActionId:"CreateItem"|"CreateAndSubmitItem"}`, `Action::FieldMapping[]`, `Output`, `IsTested`, `BlockNull?`).  `IfActionExecutor` `integration/engine/executor/if_action_executor.py:17`.
- `FieldMapping`: `Type(String|Object|Number|Date|Datetime), FieldId, Label, Name, IsRequired, IsDropdown?, AutoRefresh?, IsMultiValue?, IsVisible?, SelectedDropdown?, FieldMapping::Property[], FieldMapping::FieldMapping[]`.
- `Property`: `Name(LHSField|RHSField|…), Type(Value|Field), Field("context.<TriggerId>.<field>") | Value([…])`.
- `Criteria`: `{IsOR, Action, Criteria::Condition[]}`. `Condition`: `{Criteria, Condition::FieldMapping:[LHS,RHS], LHSType(string|boolean), Operator:"EQUAL_TO"}`. (`criteria_executor.py:18,56`.)
Example: `integration/Enquiry_to_Project_case_creation_A00/metadata/Enquiry_to_Project_case_creation_A00.json`.

### 1.9 Application nav blob — `application/<App>/metadata/<App>.json`
The app metadata blob is the **navigation graph** (NOT the pages). Root node `Application{FlowType:"Application", Name, Description, AppIcon:{Icon:{Color,Id}}, DefaultPage, Application::Navigation[]}`. Then `Navigation{Name, Default:bool, LastSavedAt, Navigation::Menu[]}` → `Menu{Name, VisibleTo:[AppRole ids], Menu::FieldMapping[] | Menu::SubMenu[]}` → `SubMenu{Name, VisibleTo, SubMenu::FieldMapping[]}` → `FieldMapping{Name:"Page", FieldMapping::Property[]}` → `Property{Type:"Page", Value:<pageId>}`. `FieldMapping`=`subflow.py:25`. Node Kinds Navigation/Menu/SubMenu/Property and `Property.Type:"Page"` = data-only.
The app **flow doc** adds `SysConfig.Theme.Colors.Custom[]{Id,Color(rgba),Name,Type:"Solid",IsDark,IsCustom}`, `Icon{Type:"Custom",Value:{<size>:{key,size,height,width,fileExtension,name}}}`, `DeployInfo:{}`, `BuildNumber:int`, `VersionNumber:"1.0"`, `LastPublishedAt`, `SharedWith[].Role/InheritedRole`. (`DeployInfo`=`flow.py:111`; `BuildNumber/VersionNumber`=`flow.py:113-114`; `SysConfig`=`flow.py:105`.)

### 1.10 CustomComponent manifest — `customcomponent/<CC>/manifest/<CC>.json`
Single manifest file (no flow/metadata split). Keys: `Name, Description, Layout:"Web", _application_id, Status, DraftManifest{…}, Manifest{…}, LastPublishedAt, _doc_version`. Manifest body: `{Source:"Zip", category:"custom", subcategory:"custom", visualization_type:"custom", layout:["Web"], manifest_version:1, name, template_id:"Custom", properties:{general:[]}, scripts:{web:"<blob path>/index.html"}, type:"External", version:"1.0.0"}`.
Example: `customcomponent/CC6cAIoZI9wB/manifest/CC6cAIoZI9wB.json` (Customer Feedback Carousel). Component referenced from a page via `Field::Component`/`ComponentId` (catalog `blob.py:414`).

---

## 2. NEW attributes on already-known objects

| Object | New attribute | Example value | Example file | In source? |
|---|---|---|---|---|
| **Model** (node) | `FlowType:"Case"` (catalog only showed `"Form"`) | `"Case"` | `case/Professional_Services_Tasks_A00/metadata/Professional_Services_Tasks_A00.json` | enum member `base_const.py:1266` (value newly observed on a Model) |
| **Model** (node) | `Model::ProcessDef` + `RootProcessDef` populated | `["ProcessDef_u4G3qt31mL"]` | `process/Professional_Services_Customer_Fee_A00/metadata/…json` | rel `blob.py:111`; `RootProcessDef` from `Model.py` stub |
| **Model** (node) | `Button::Row` | `["Row_aIy10T4TTq"]` | same process blob | data-only |
| **Field** | `CreatedAt` (ISO-8601 ms+Z, per-field create stamp; distinct from flow `_created_at`) | `"2022-10-13T11:05:05.799Z"` | `form/Customer_Data_A00/metadata/Customer_Data_A00.json` | data-only |
| **Field** | `Type:"Image"` used as a FieldType (catalog lists Image only as a Widget) | `"Image"` | same | Widget `meta_const.py:146`; as FieldType = data-only |
| **Field (Select)** | concrete `ReferredList` values pointing to **List** ids | `"PS_Enquiry_Region_A00"` | same | `blob.py:325` |
| **Column** (layout) | `Type:"Section"` with `Name` (section title) + `Start`/`End` grid spans (0–6) | `{Type:"Section",Name:"Customer master form",Start:0,End:6}` | same | layout-engine; `Start/End` data-only |
| **flow doc (all)** | `PageAccess[].PageScore` | `0` | every flow doc | data-only |
| **flow doc (all)** | `PageAccess[].Kind:"AppRole"` (alongside `User`) | `"AppRole"` | `application/.../flow/…json` | app_role service `base/base/constants/api.py:173-189` |
| **flow doc (all)** | `PageAccess[].LastAccessedAt` | `"2023-08-16T09:57:12"` | form/process flow docs | data-only |
| **flow doc** | `SharedWith[].Role` / `.InheritedRole` / `.Permission[]` | `Role:"Admin"`/`"Member"`/`"DataAdmin"`, `InheritedRole:null` | `form/Customer_Data_A00/flow/…json` | `AUTHORING_API_MAP.md:425`, `flow.py:367-374` |
| **Process flow doc** | `PublicFormSettings:{Token,_has_public_form,_public_form_enabled}` | `{Token:"Pf66eb7b6d-…",…:true}` | `process/.../flow/…json` | public-form feature |
| **Process flow doc** | `SubmissionLocked` | `false` | same | data-only |
| **Process flow doc** | `Appearance.CardFields[].Model:"ActivityInstance"` | `"ActivityInstance"` | same | DataType `datatypes.py:16` |
| **Integration flow doc** | `IsActive`, `NotificationPreference{NotifyOnUpdate,NotifyOnFailure}` | `false`, `{false,true}` | `integration/.../flow/…json` | data-only |
| **CaseView flow doc** | `_is_system`, `SysConfig{_is_shared}` | `true`, `{_is_shared:false}` | `case/.../caseview/.../flow/…json` | data-only |
| **Report flow doc** | `Parent{Type:"Process"\|"Case"}`, `_is_system`, `ChildTableCount`, `StepCount` | — | `process/.../report/.../flow/…json` | data-only |
| **Filter/Condition** (report+caseview) | `LHSAttribute`, `RHSType:"Field"` w/ `RHSField:"_current_user"` | `_current_user` | caseview `_assigned_to_me` | `_current_user` = `base_const.py:1159` |

### New workflow node Kinds in the Process metadata blob (undocumented in model catalog)
- **`ProcessDef`**: `{WorkflowType:"Sequence", Model, ProcessDef::Activity:[activity ids]}`.
- **`Activity`** (the step): `{NodeType, Name, ProcessDef, Activity::Resource:[ids], BaseMetadata?}`. `NodeType` enum (`process/engine/util/workflow_constants.py:114-122`): `StartEvent, EndEvent, UserTask, MultiUserTask, Parallel, SendBackToInitiator, GotoTask, Subflow` (only StartEvent/EndEvent/UserTask/SendBackToInitiator appear here). The synthetic `SendBackToInitiator` activity carries `BaseMetadata` → the Start activity.
- **`Resource`** (step assignee): `{ValueType:"AppRole", DisplayValue:"Manager", Value:"<roleId>", Activity}`. The role id matches `SharedWith[]._id`/`PageAccess[]._id` in the flow doc.
> There is no `Workflow`/`Step`/`Permission` Kind node — `Activity` is the step; step permissions are expressed at the flow-doc `PageAccess[].Permission` level.

---

## 3. NEW enum values (seen in this app, not in the catalog)

**Flow `Type`** (discrete objects): `List`, `FormView`, `CaseView`, `Report`, `Integration` — (catalog OBSERVED_OBJECTS only covered Application/Process/Case/Form/Dataset/Page). All are valid `FLOW_TYPE` members (`base_const.py:1276,1295,1282,1285,1275`).

**PageAccess / SharedWith Permission verbs:**
- Application: `ViewApp`, `ViewChild`, `Admin` (`flow/route/application.py:515,535`; `internal.py:446`).
- Form: `Share, Delete, View, Edit, ViewChild`, `Admin`.
- Process: `View, ViewAllReports, InitiateItems, CreateReports, ViewForm, ModifyItem, ViewMetrics, ViewProcessAdministration, DeleteItem, ViewChild`.
- Integration: `View, Admin`. Report/List/FormView/CaseView: `Admin`.
- `SharedWith[].Role`: `Admin`, `Member`, `DataAdmin`. `Kind`: `AppRole`, `User`.

**Status `Category`** (`case.py:16-22`): `NotStarted, InProgress, ReOpened, Done, Closed`. Custom-status-allowed = all except ReOpened (reserved).
**State `Category`** (observed on the 4 fixed states): `NotStarted, InProgress, Closed`.
**Status `Type`** (source-only, not emitted): `User, Subflow`.

**Permission level** (CasePermission `Permission`): `Editable, ReadOnly, Hidden` (confirms catalog E14; `Hidden`/`Editable`/`ReadOnly` all observed live).

**Priority** ids: `Critical, High, Medium, Low`.

**Activity `NodeType`** (`workflow_constants.py:114-122`): `StartEvent, EndEvent, UserTask, MultiUserTask, Parallel, SendBackToInitiator, GotoTask, Subflow`.
**Resource `ValueType`**: `AppRole` (User/Field/Initiator are platform options; only AppRole here).
**ProcessDef `WorkflowType`**: `Sequence`.

**ReportType** (app-wide): `ChartReport` (30), `TabularReport` (11).
**Report/View `ViewType`** (app-wide counts): `BarColumnChart`(18), `Tabular`(11), `PieChart`(4), `DoughnutChart`(4), `Pivot`(2), `BarRowChart`(1), `AutoChart`(1). Platform also supports `AreaChart, BarChart, BarStackedColumn/RowChart, HundredPercentBarStacked*, BubbleChart, ComposedChart, LineChart, ScatterChart, ComparisonCard, IconCard, KPICard, SimpleCard, ExportTabular` (`formreport/server/service/report_service.py` class registry).
**CaseView `ViewType`/`Visualization`**: `Kanban` (only value in export).
**FormView `ViewType`**: `Gallery`.

**Report `AggregateFunction`**: `COUNT, SUM`. **Report appearance**: `ScaleType:"Linear"`, `HeatMap:"none"`, `ValueCalculation:"Keep as is"`, `FilterType:"and"`.

**Integration enums**: Trigger `Type:"App"`; Action `Type:IfAction|YES|NO|Create`; FieldMapping `Type:String|Object|Number|Date|Datetime`; Property `Type:Value|Field`; Connector `ActionId:CreateItem|CreateAndSubmitItem|IfAction`, `TriggerId:StatusUpdated|ItemSubmitted`, `Status:Published|Public`; Condition `LHSType:string|boolean`.

**Condition/Filter Operators observed** (all in catalog E10): `EQUAL_TO, NOT_EQUAL_TO, GREATER_THAN, GREATER_THAN_OR_EQUAL_TO, LESS_THAN, LESS_THAN_OR_EQUAL_TO, PART_OF, EMPTY`. Relative date `RHSValue`: `ThisYear, Now` (catalog E16 `DateRelativeRange/Value`).

**FormView gallery enums** (data-only): `MapTo:Title|Title caption|Sub title|Image`; `Card_layout:Matrix`, `Card_size:Medium`, `Card_type:Style 2`, `Card_border:Shadow`; `Sort.SortType:ASC`.

**CustomComponent manifest enums**: `Source:Zip`, `type:External`, `template_id:Custom`, `Layout/layout:Web`.

---

## 4. Notes & caveats
- **Source repo present** at `/Users/dinesh/Projects/kissflow-xg` (not under kf-framework) — all `path:line` citations are from there; the report-blob Kinds are in `reportbase/reportcore/server/metadata/__init__.py`, caseflow/casepermission in `metadata/server/generator/model/case_model.py`, workflow node types in `process/engine/util/workflow_constants.py`.
- **Catalog §5 (Integration) and §6 (Report) in OBSERVED_OBJECTS.md describe the live-API list-item/read shapes, which differ from the on-disk export**: the export splits each into a thin `flow` doc + a `metadata` blob graph; the `Connectors[].Entities[]` form does not appear on disk.
- **Casing quirk**: FormView `Columns[]` entries inconsistently carry lowercase `kind` and/or `Kind:"Field"` — parse defensively.
- Items marked **data-only** are presentation/serialization config persisted only in the blob (no string constant located in the grepped source paths): `PageScore`, layout `Start`/`End`, Field `CreatedAt`, nav node Kinds, the `Card_*`/`MapTo` gallery config, `Kanban` literal, integration `IsActive`/`NotificationPreference`.
