# Kissflow App — Observed Object Catalog (ground truth)

Structures captured from a real Kissflow app export via the live REST API. Each object below is a distinct metadata type with its own shape,
read endpoint, and (where applicable) authoring draft/publish flow. Field names use
Kissflow's `Parent::ChildType` adjacency convention inside draft blobs.

> Pairs with `AUTHORING_API_MAP.md` (endpoint + auth map, derived from the kissflow-xg
> source) and `APP_METADATA_MODEL.md` (the consolidated model + source cross-reference).

---

## 1. Application (container)
`GET /flow/2/{acct}/app/{appId}/info`
```
{ _id, Type:"Application", Status, Name, Description, BuildNumber, VersionNumber,
  _is_translation_enabled, Languages:[{_id, _is_language_enabled, PublishedAt?}],
  Theme:{ Colors:{}, CustomColors:[{Id, Color:"rgba(...)", Name, Type:"Solid", IsDark, IsCustom}] },
  Permissions:["Admin","ViewChild","ViewApp"], AppTemplate:{} }
```

## 2. App (session) Variables
`GET /application/2/{acct}/{appId}/variable/`
```
{ _id:"{appId}_session",
  SessionVariables:[ "<name>", ... ],
  "<VarName>":{ Name, Description, DataType:"Number"|"Text", DefaultValue, _created_at, _created_by },
  SysConfig:{ Json:{...limits}, ObjectList:{...}, StringList:{...} } }
```

## 3. Flow list items (Process / Case / Form / Dataset)
`GET /flow/2/{acct}/{process|case|form|dataset}/?page_number=1&page_size=300`
```
{ _id, Name, Description, Type:"Process"|"Case"|"Form"|"Dataset",
  Status:"Live"|"Draft"|"Archived", _application_id, LastPublishedAt, _created_at, _created_by, _modified_at }
```

## 4. Page list items
`GET /flow/2/{acct}/application/{appId}/page/`
```
{ _id, Name, Description, Type:"Page", Status, _application_id,
  InputParameters:[ { Id, Kind:"InputParameter", Name, DataType:"Text", IsRequired, DefaultValue? } ] }
```

## 5. Integration list items
`GET /flow/2/{acct}/integration`
```
{ _id, Name, Type:"Integration", Status, IsActive, SharedWith:[], PageAccess:[],
  Connectors:[ { _id, Name, Entities:[ { _id, Kind:"Trigger"|"Action", Name, Version } ] } ] }
```

## 6. Report / View (on a flow)
`GET /flow/2/{acct}/form/{flowId}/report/{reportId}`
```
{ _id, Type:"Report", Status, Name, ReportType:"ChartReport", ViewType:"BarColumnChart"|"PieChart"|...,
  ReportAppearance:{ ScaleType:"Linear", Labels:{XAxisLabel,YAxisLabel,DataLabel,Legend},
                     ColorPalette:["rgb(var(--lavender-blue))", ...] },
  Permissions:[], ParentPermissions:["Edit","View","Delete","Share"], ParentInfo:{Name} }
```

## 7. Field metadata (resolved — includes inherited system fields)
`GET /form|process|case/2/{acct}/{flowId}/fields`
```
[ { Id, Name, Type, IsSystemField:bool, Model:"FormBase"|"<model>", Widget, Required, IsInternal,
    SourceFlowId?, SourceFlowType?, Attributes?:[{Id,Name,Type}] } ]
```
Every FormBase inherits these **system fields** (do NOT author them): `_id, Name, _created_by,
_modified_by, _created_at, _modified_at, _is_deleted, _deleted_at, _deleted_by, _flow_name,
_application_id, _flow_type, _doc_version, _visited, _is_draft, _is_public_form, _expire_at`.
`User`-type fields carry `Attributes:[Status, FirstName, LastName, ProfilePicture]` and
`SourceFlowId:"UserAbstract"`.

---

## 8. FORM DRAFT BLOB — the authoring entity-graph  ★ core
`GET/PUT /metadata/2/{acct}/form/{flowId}/draft`  →  `POST …/publish`

A FLAT dict keyed by entity `Id`, with a `Root` pointer to the model, plus `PublishedAt`,
`_meta_version`, `CurrentVersion`. Parents reference children by id arrays named `Parent::Child`.

| Kind | Shape (key fields) |
|---|---|
| **Model** | `{Id, Name, Kind:"Model", FlowType:"Form", Description, Model::Row:[rowIds], Model::Field:[fieldIds], Model::Appearance:[ids]}` |
| **Row** | `{Id, Kind:"Row", Model OR Column:<parentId>, Row::Column:[colIds]}` |
| **Column** | `{Id, Kind:"Column", Type:"Section"\|"Field", Start, End, Name?, Row:<parent>, (Section→)Column::Row:[rowIds] / (Field→)Column::Field:[fieldId], IsHidden?}` Start/End = grid slots (0–6). |
| **Field** | `{Id, Kind:"Field", Type, CreatedAt, Model, Name, Column, Required?, <type-specific>, Field::QueryDefinition?, Field::Node?, Field::Expression?, RHSField::Condition?}` |
| **QueryDefinition** | (Reference/User) `{Id, Kind:"QueryDefinition", Field, LHSModel:<targetFlowId>, FlowType:"Form"\|"User", LookupField:[{Type,Name,Id}], HiddenField:[ids], SortBy:[{Field}]?, QueryDefinition::Criteria?:[ids]}` |
| **Criteria** | `{Id, Kind:"Criteria", QueryDefinition, Criteria::Condition:[condIds]}` |
| **Condition** | `{Id, Kind:"Condition", Criteria, LHSField, Operator:"EQUAL_TO", HasArguments, RHSType:"Field"\|"Value", RHSField? \| RHSValue?}` |
| **Expression** | `{Id, Kind:"Expression", ExpressionStr:"<formula>", Field, Expression::Node:[rootNodeId]}` |
| **Node** | `{Id, Kind:"Node", Type:"Function"\|"Static"\|"Field"\|"RefField", Value:<fn/operator/literal>, Expression?\|Node?:<parent>, Node::Node:[childIds]?, DataType, Category, Syntax?:"Chain", RefField?, RefModel?, Field?, FieldRefCount?}` |
| **Appearance / Style** | styling holders |

**Field type-specifics** (observed): `Text` (bare); `Currency` → `CurrencyTypes:["USD"]`;
`Select` → `ReferredList:"<listId>"`; `Date` / `DateTime` (bare); `User` → `Field::QueryDefinition`
with `LHSModel:"User", FlowType:"User", LookupField:[]`; `Reference` → `Field::QueryDefinition`
with `LHSModel:<formId>, LookupField:[{Type,Name,Id}], HiddenField` (+ optional `Criteria` filter).

**Expression examples** (the `ExpressionStr`, parsed into the Node tree):
- `now()` → single `Node{Type:Function, Value:"now", Category:"DateTime"}`
- `Asset_Category.CategoryName` → `GetValue(Field, RefField)` — a reference lookup
- `concatenate("ACO", initiatedat().day().toText(), …)` → nested `Function` nodes with `Syntax:"Chain"`

---

## 9. PAGE SCHEMA BLOB — the page builder entity-graph  ★ core
`GET/PUT /metadata/2/{acct}/application/{appId}/page/{pageId}/draft` (published: `…/schema`) → `POST …/publish`

Flat dict keyed by `Id`, `Root`→pageId, `PublishedAt`/`_meta_version`/`CurrentVersion`.

| Kind | Shape (key fields) |
|---|---|
| **Page** | `{Id, Kind:"Page", Name, Description, FlowType:"Page", Settings:{Background,Colour,Height,Width}, PageType:"Page", Page::Component:[], Page::Container:[], Page::InputParameter:[], Page::EventMapping:[], Page::VariableRef:[]}` |
| **Container** | `{Id, Kind:"Container", Type:"Body"\|"Container"\|"Component"\|"Layout"\|"Column", Name, Page, Container::Container:[], Container::Component:[], Container::FieldMapping:[], Container::Style:[], Container::EventMapping:[], Container::VariableRef:[]}` |
| **Component** | `{Id, Kind:"Component", Name, Script:{web:"general/card"\|"report/chart"\|"general/label"\|"report/pivot"}, Data:{category,subcategory,visualization_type, flow_id?,flow_type?,report_id?}, Container}` (legacy flat form also seen: `Scripts`, `ManifestParams`, `Height/Width/Row/Column`, `Component::FieldMapping`) |
| **FieldMapping** | `{Id, Kind:"FieldMapping", Name:"label"\|"count"\|"flow_id"\|"report_id"\|…, Type?:"Richtext"\|"TypePicker"\|"Hiddenproperty"\|"Object", Label?, Component\|Container, FieldMapping::Property:[]}` |
| **Property** | `{Id, Kind:"Property", Type:"Value"\|"Variable"\|"SimpleFilter"\|"Code"\|"Page"\|"FilterParam", Value?, FieldMapping\|EventMapping, Property::VariableRef?, Property::FieldMapping?}` |
| **EventMapping** | `{Id, Kind:"EventMapping", Type:"JSAction"\|"Redirection", Name:"on_load"\|"on_click", Page\|Component\|Container, EventMapping::Property:[]}` — JSAction Property `Type:"Code"`/`Value:<JS>`; Redirection Property `Type:"Page"`/`Value:<pageId>` (+ optional param FieldMappings) |
| **VariableRef** | `{Id, Kind:"VariableRef", Type:"ApplicationVariable", Name\|Variable:<appVarName>, Component\|Container, Page, Property}` |
| **Style** | `{Id, Kind:"Style", Container\|Appearance, Value:{ "<Dotted.Style.Key>":{value:"…"} \| {ref:"Color.White"} }}` |
| **InputParameter** | `{Id, Kind:"InputParameter", Name, DataType, IsRequired}` |

Component data is bound via `FieldMapping → Property`: a Property of `Type:"Value"` is a literal,
`Type:"Variable"` references an app variable (via `VariableRef`), `Type:"SimpleFilter"/"FilterParam"`
holds report filters. Report components set `flow_id`/`report_id`/`report_type` field-mappings.
On-load JS (`EventMapping` `Code`) calls `kf.api(...)` and `kf.app.setVariable(...)` to populate
the app variables the cards then read.

---

## Cross-cut: every flow also has
- **Views** (form view / list view / case board view / dataset view) — layout/columns/filters,
  authored via `…/{type}view/{viewId}/draft` → `softpublish`.
- **Process**: `Workflow.Step[]` (Activity: name, type, `Resource{ValueType:"AppRole",Value:roleId}` assignee, `Permission`).
- **Case**: `caseflow` (`Statuses`, `Transitions`) + `casepermission` (`Permission{Status,Column,Permission}`).
- **Roles** (`app_role`) referenced by `_id` from step/field/status permission blobs.
