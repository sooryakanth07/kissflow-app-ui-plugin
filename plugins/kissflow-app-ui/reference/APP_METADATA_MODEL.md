# Kissflow — Total App Metadata Model (source-verified)

The consolidated model of everything that constitutes a Kissflow application, cross-referenced
against the source at `/Users/dinesh/Projects/kissflow-xg/`. Every source claim cites `file:line`.

Pairs with:
- `OBSERVED_OBJECTS.md` — live ground-truth object structures (from a real Kissflow app export).
- `AUTHORING_API_MAP.md` — endpoint + auth + expression + permission map (derived from source).

Verification basis: live structures captured via REST were each located in source. Three exploration
passes confirmed (1) the metadata model classes + relation-key constants, (2) the expression engine +
QueryDefinition/operators, (3) the page-schema entity graph + app/integration/report/theme shapes.

> Convention: blob entities use the `Parent::ChildType` adjacency key (e.g. `Model::Field`), each
> resolving to a constant in `base/base/constants/metadata/metadata_blob.py` (`OneToMany` class @ :37,
> `BlobConstants` @ :188). Entities are flat top-level dict entries keyed by `Id`, joined by id-array
> references — not nested inline.

---

## 1. The App Metadata Tree (containment hierarchy)

```
Application  (flow doc; Type:"Application")                       flow doc + metadata app blob
├── Identity            Name, Description, Status, _id, Type
├── Versioning          BuildNumber, VersionNumber                     flow.py:325,336 / :113-114
├── Theme               Colors{}, CustomColors[{Id,Color,Name,Type,IsDark,IsCustom}]
│                                                                       flow/utils/constants/__init__.py:459
├── Languages / i18n    _is_translation_enabled, Languages[{_id,_is_language_enabled,PublishedAt?}]
│                                                                       flow.py:651-653 (TranslationSettings)
├── AppTemplate{}                                                       flow.py:137 / app_template_schema.py:123
├── Permissions[]       capability list on the container ("Admin","ViewApp",...)
│
├── App (session) Variables   {appId}_session doc                       application/services/app_variable_service.py:71-103
│   ├── SessionVariables[]                                              base/.../application_variables.py:10
│   ├── <VarName>{Name,Description,DataType,DefaultValue,_created_*}     application/schema/app_variable.py:11-19
│   │       DataType ∈ Number|Text|DateTime|Boolean|Json|ObjectList|StringList  application_variables.py:30-39
│   └── SysConfig{Json,ObjectList,StringList}
│
├── Flows  (Process | Case | Form | Dataset)   each = flow shell + metadata MODEL blob
│   │   list item: {_id,Name,Description,Type,Status,_application_id,LastPublishedAt,...}
│   │
│   ├── MODEL  (the FORM DRAFT BLOB — flat dict, Root→model)            metadata draft endpoint
│   │   ├── Model      {Kind:"Model",FlowType,Model::Field[],Model::Row[],Model::Appearance[]}
│   │   │                                                                Model::Field=metadata_blob.py:109, Model::Row=:108
│   │   ├── Layout     Row{Row::Column[]} → Column{Type:Section|Field, Start,End,
│   │   │              (Section)Column::Row[] | (Field)Column::Field[fieldId]}
│   │   │                                                                Row::Column=:45, Column::Field=:65
│   │   ├── Field      {Kind:"Field",Id,Name,Type,DBType,Widget,Required,DefaultValue,
│   │   │              IsHidden,Decimalpoint,MinValue,MaxValue, <type-specific>}   class Field @ __init__.py:726
│   │   │      type-specific keys: CurrencyTypes(:290) | ReferredList(:325) |
│   │   │                          LookupField(:383)/HiddenField(:429)/SortBy(:385) |
│   │   │                          SourceFlowId/SourceFlowType/Attributes (synthesized __init__.py:1047-1052)
│   │   │      computed-field test: Field.is_computed_field() @ __init__.py:848
│   │   │      ├── Field::Expression[exprId]    → Expression                  :96 / class @ __init__.py:1062
│   │   │      │      Expression{ExpressionStr, Expression::Node[rootNodeId]}  ExpressionStr=:423, Expression::Node=:46
│   │   │      │      └── Node{Type,Value,Category,DataType,Syntax,            class @ __init__.py:1076
│   │   │      │             Field/RefModel/RefField/LookUpPath, Node::Node[]}
│   │   │      │             Type ∈ Function|Static|Field|AggregateFunction|  NodeType @ engine/__init__.py:1-7
│   │   │      │                    AggregateField|FetchField
│   │   │      ├── Field::QueryDefinition[qdId]  → QueryDefinition (lookup/User) :93 / class @ __init__.py:1134
│   │   │      │      └── QueryDefinition::Criteria[] → Criteria → Condition    QD_CRITERIA=:50
│   │   │      ├── Aggregate::QueryDefinition[]   → AggregateDefinition         class @ __init__.py:1305
│   │   │      ├── Field::Constraint[]            → Constraint{Type:"unique",…} :99 / class @ __init__.py:1343
│   │   │      ├── FieldValidation::Criteria[]    → Criteria → Condition        :51
│   │   │      ├── FieldRequirement::Criteria[]   → conditional required        :52
│   │   │      └── ColumnVisibility::Criteria[]   → conditional visibility      :54
│   │   ├── Criteria   {Kind:"Criteria",Criteria::Condition[],IsOR}        class @ __init__.py:1316
│   │   └── Condition  {Kind:"Condition",LHSField,Operator,RHSType,         class @ __init__.py:1354
│   │                  RHSValue|RHSField|RHSParam,ErrorMessage}
│   │                  Operator ∈ OPERATORS (EQUAL_TO,…)  base/.../__init__.py:1113-1161
│   │                  RHSType ∈ Value|Field|FilterParam   base/.../__init__.py:1202-1205
│   │
│   ├── Views   (formview | listview | caseview/board | datasetview)    metadata view draft → softpublish
│   │       layout/columns/filters + Model::Permission[] → Permission{Column,Permission}  Model::Permission=:120
│   ├── Workflow (Process)   Activity[] steps                            class Activity / process generator
│   │       Activity{NodeType,Activity::Resource[],Activity::Permission[]} workflow_constants.py:38-46
│   │       Resource{ValueType:"AppRole",Value:<roleId>,DisplayValue}     generator/process.py:104-112
│   │       Permission{Column,Permission:Editable|ReadOnly|Hidden|Mandatory} process.py:125-135
│   ├── Caseflow (Case)      {Statuses, Transitions}                     caseflow draft/publish
│   └── Permissions
│       ├── Form-view perms    Model::Permission → Permission{Column,Permission}  view_serializer.py:42-138
│       └── Case perms         CasePermission{CasePermission::Permission[]}        case_model.py:161-223
│                              Permission{Status,Column,Permission,Model}          CasePermission::Permission=:58
│
├── Pages   (page shell + PAGE SCHEMA BLOB)                             metadata page draft → publish
│   │   list item: {_id,Name,Type:"Page",Status,InputParameters[{Id,Kind:"InputParameter",Name,DataType,…}]}
│   ├── Page       {Kind:"Page",Settings,PageType,                       generator/model/page_model.py:99-191
│   │              Page::Container[],Page::Component[],Page::Variable[],Page::Popup[]}
│   ├── Container  {Kind:"Container",Type,Name,                          page_model.py:440-792
│   │              Container::Container[],Container::Component[],Container::FieldMapping[],
│   │              Container::Style[],Container::EventMapping[],Container::VariableRef[]}
│   │              Type ∈ Body|Container|Component|Layout|Column|Tab|Popup|MasterDetail  ContainerType @ page_model_constants.py:73-80
│   ├── Component  {Kind:"Component",Script{web:"view/list"|…},Data{…},Page|Container}  page_model.py:858-1115
│   ├── FieldMapping {Kind:"FieldMapping",Name,Type?,Label?,             page_model.py:1316-1379
│   │                Component|Container,FieldMapping::Property[]}        FieldMapping::Property=page_model.py:1367
│   ├── Property   {Kind:"Property",Type,Value?,                         page_model.py:1452-1552
│   │              Property::VariableRef[],Property::FieldMapping[]}      :1536 / :1537
│   │              Type ∈ Page|SimpleFilter|FilterParam|Object|Value|Variable  PropertyTypes @ page_model_constants.py:88
│   │                     (+ "Code" — free-form, page.md:1239; not an enum constant)
│   ├── EventMapping {Kind:"EventMapping",Type,Name,                     page_model.py:1382-1449
│   │                EventMapping::Property[]}                           EventMapping::Property=page_model.py:1438
│   │                Type ∈ Redirection|JSAction|OpenPopup (free-form)   page.md:924-1239
│   ├── VariableRef {Kind:"VariableRef",Type:"ApplicationVariable",      page_model.py:1700-1725
│   │               Name|Variable:<appVar>,…}
│   ├── Style      {Kind:"Style",Container|Appearance,Value{…}}          page_model.py:1248-1313
│   └── InputParameter {Kind:"InputParameter",Name,DataType,IsRequired,DefaultValue}  (stored in SysConfig.InputParameters)
│
├── Integrations  list item {_id,Name,Type:"Integration",IsActive,       integration/.../kissflow_integration.json
│   │              SharedWith[],PageAccess[],Connectors[]}
│   └── Connector → Entities[{_id,Kind:"Trigger"|"Action",Name,Version}]  Integration::Trigger / Integration::Action
│
├── Reports / Views (on a flow)  {Type:"Report",ReportType,ViewType,     formreport/.../report_service.py
│              ReportAppearance{ScaleType,Labels,ColorPalette},Permissions,ParentPermissions}
│
├── Roles  (app_role)  {_id,Name,Description,Preference,_application_id,  user/route/app_role.py
│              Users[],Groups[],ServiceAccounts[]}  referenced by _id as Kind:"AppRole"  flow.py:385-392
│
├── Custom Components  {Name,Description,Layout,Category,_application_id}  application/route/custom_component.py:1196
│
└── Resource Library  {Name,Type,ParentId,ContentType,Size,BlobPath}      application/route/resource_manager.py:203
```

---

## 2. Per-Object Table

`Read endpoint` / `Author endpoint` are from `AUTHORING_API_MAP.md`. `acct`=account_id.
Read paths use `/flow/2/…` or `/metadata/2/…`; author paths are draft/publish where noted.

| Object | Observed structure (key fields) | Source definition (file:line / class) | Read endpoint | Author endpoint | Notes / discrepancies |
|---|---|---|---|---|---|
| **Application** | `_id,Type:"Application",Status,Name,Description,BuildNumber,VersionNumber,_is_translation_enabled,Languages[],Theme{Colors,CustomColors},Permissions[],AppTemplate{}` | flow doc constants: `flow.py:113-114,325,336` (Build/Version), `flow.py:651-653` `TranslationSettings`, `flow.py:137` AppTemplate; `flow/utils/constants/__init__.py:459` CustomColors; create rbac `flow/route/application.py:1060` | `GET /flow/2/{acct}/app/{appId}/info` | `POST /flow/2/{acct}/application/` (shell, rbac User); `PUT …/application/{id}/draft`+`/publish` (metadata, rbac Admin) | App container fields live on the **flow doc**, NOT in `metadata/.../application_model.py` (that holds Name/Description/DefaultPage/Navigation only). Theme/Languages/Build are flow-doc keys. |
| **App (session) Variable** | `{appId}_session` doc: `SessionVariables[], <VarName>{Name,Description,DataType,DefaultValue,_created_*}, SysConfig{Json,ObjectList,StringList}` | `application/services/app_variable_service.py:71-103`; schema `application/schema/app_variable.py:11-19`; DataType enum `base/.../application_variables.py:30-39`; SessionVariables `:10` | `GET /application/2/{acct}/{appId}/variable/` | `POST/PUT/DELETE /application/2/{acct}/{appId}/variable/[<name>]` (NOT access-key) | Observed DataType only Number/Text live; source supports DateTime/Boolean/Json/ObjectList/StringList too. |
| **Flow list item** (Process/Case/Form/Dataset) | `{_id,Name,Description,Type,Status,_application_id,LastPublishedAt,_created_*,_modified_at}` | flow shell create: `flow/route/form.py:889`, `process.py:1923`, `case.py` CREATE, `dataset.py:1073` | `GET /flow/2/{acct}/{type}/?page_number&page_size` | `POST /flow/2/{acct}/{type}/` (**access-key**: `form.py:91-93`) | Matches. Shell-create is the access-key-reachable entry point. |
| **Page list item** | `{_id,Name,Type:"Page",Status,_application_id,InputParameters[{Id,Kind:"InputParameter",Name,DataType,IsRequired,DefaultValue?}]}` | shell `flow/route/page.py:220`; InputParameters stored in `SysConfig.InputParameters` | `GET /flow/2/{acct}/application/{appId}/page/` | `POST /flow/2/{acct}/application/{appId}/page/` (rbac only) | InputParameter is NOT a separate top-level blob `Kind` with a `Page::InputParameter` relation — it lives inside `SysConfig.InputParameters` on the page doc. |
| **Integration list item** | `{_id,Name,Type:"Integration",IsActive,SharedWith[],PageAccess[],Connectors[{_id,Name,Entities[{_id,Kind:"Trigger"\|"Action",Name,Version}]}]}` | fixture `integration/.../kissflow_integration.json`; rel keys `Integration::Trigger`/`Integration::Action`; model bootstrap `metadata/route/internal.py:1258` | `GET /flow/2/{acct}/integration` | internal model create only (`internal.py:1258`); no public author route | Observed nests `Entities` under `Connectors[]`; source stores Trigger/Action lists with a `Connector{Kind:"Connector"}` sub-object — same data, presentation differs. |
| **Report / View** | `{_id,Type:"Report",ReportType:"ChartReport",ViewType:"BarColumnChart"\|"PieChart",ReportAppearance{ScaleType,Labels,ColorPalette},Permissions,ParentPermissions,ParentInfo}` | service classes `formreport/server/service/report_service.py` (`FormBarColumnChartReportService`,`FormPieChartReportService`), `chart_report_service.py`; `ReportType.DRILLDOWN` `reportbase/reportcore/utils/constants.py:153` | `GET /flow/2/{acct}/form/{flowId}/report/{reportId}` | (report authoring not in this map) | `ViewType`/`ReportAppearance`/`ColorPalette` exist as **service-class behavior + runtime JSON**, not as named enum constants. ReportType enum found; appearance keys are free-form. |
| **Field metadata (resolved)** | `[{Id,Name,Type,IsSystemField,Model,Widget,Required,IsInternal,SourceFlowId?,SourceFlowType?,Attributes?}]` + system fields; User → `Attributes:[Status,FirstName,LastName,ProfilePicture]`, `SourceFlowId:"UserAbstract"` | `Field` class `__init__.py:726`; User/Reference synthesis `__init__.py:1047-1052` (`SourceFlowId=lhs_model_id`, `SourceFlowType`, `Attributes`) | `GET /{form\|process\|case}/2/{acct}/{flowId}/fields` | (no dedicated create-field route — authored in draft blob) | Matches exactly. `SourceFlowId`/`SourceFlowType`/`Attributes` are computed at read-time from the field's QueryDefinition, not stored verbatim. |
| **Model** (form draft) | `{Kind:"Model",FlowType,Model::Field[],Model::Row[],Model::Appearance[]}` | `Model::Field`=`metadata_blob.py:109`, `Model::Row`=`:108` | `GET /metadata/2/{acct}/form/{flowId}/draft` (`/schema` published) | `PUT …/draft` (`X-Api-Key`) → `POST …/publish`; default create internal `metadata/route/internal.py:1318` | Matches. Model bootstrap is INTERNAL (`/metadata/kfv2/…`), hence 404 for access-key create. |
| **Row / Column (Layout)** | `Row{Row::Column[]}`; `Column{Type:Section\|Field,Start,End,Column::Row[]\|Column::Field[]}` | `Row::Column`=`:45`, `Column::Field`=`:65` | (in draft blob) | (in draft blob) | Matches. Start/End = grid slots 0–6. |
| **Field** (draft) | `{Kind:"Field",Id,Name,Type,DBType,Widget,Required,DefaultValue,IsHidden,Decimalpoint,MinValue,MaxValue,<type-specific>}` | class `Field` `__init__.py:726`; `Required`=`:282`, `MinValue/MaxValue`=`:410-411`; Type enums `base/.../metadata/__init__.py:72` `FieldType` + `metadata/utils/constants/model_constants.py:1-62` `FieldTypes` | (in draft blob) | `PUT …/draft` → publish | Two Type enums exist: canonical `FieldType` (base) + extended `FieldTypes` (metadata module, adds RichText/StarRating/Signature/Scanner/Grid/etc.). |
| **QueryDefinition** | `{Kind:"QueryDefinition",Field,LHSModel,FlowType,LookupField[{Type,Name,Id}],HiddenField[],SortBy[],QueryDefinition::Criteria?[]}` | class `QueryDefinition` `__init__.py:1134`; keys `LookupField`=`:383`,`HiddenField`=`:429`,`SortBy`=`:385`,`ReferredList`=`:325`; `QD_CRITERIA`=`:50` | (in draft blob) | (in draft blob) | Matches. `Field::QueryDefinition` rel = `:93`. |
| **Criteria** | `{Kind:"Criteria",QueryDefinition,Criteria::Condition[],IsOR}` | class `Criteria` `__init__.py:1316`; typed subclasses `VisibilityCondition` `:1425`, `RequirementCondition` `:1440` | (in draft blob) | (in draft blob) | Matches; `IsOR` flag drives AND/OR. |
| **Condition** | `{Kind:"Condition",Criteria,LHSField,Operator:"EQUAL_TO",HasArguments,RHSType,RHSField\|RHSValue}` | class `Condition` `__init__.py:1354`; `OPERATORS` `base/.../__init__.py:1113-1161`; `RHSType` `:1202-1205`; validators `condition_evaluator.py:270-327` | (in draft blob) | (in draft blob) | Matches. RHSType ∈ Value\|Field\|FilterParam. |
| **Expression** | `{Kind:"Expression",ExpressionStr,Field,Expression::Node[rootNodeId]}` | class `Expression` `__init__.py:1062`; `ExpressionStr`=`:423`, `Expression::Node`=`:46`; root = first node `__init__.py:1072` | (in draft blob) | `PUT …/draft`→publish; validate `POST /form/2/{acct}/{flowId}/expression/{exprId}/execute` (`expression.py:13`) | Matches. Verified vs fixture `PurchaseRequest.json` (`Expression{ExpressionStr:"Price*Qty"}`). |
| **Node** | `{Kind:"Node",Type:Function\|Static\|Field\|RefField,Value,Category,DataType,Syntax?,RefField?,RefModel?,Field?,Node::Node[]}` | class `Node` `__init__.py:1076`; `NodeType` `engine/__init__.py:1-7` (Function\|Static\|Field\|AggregateFunction\|AggregateField\|FetchField); engine `expression_engine.py:31`; functions `function/function_definition.py:1-217` | (in draft blob) | (in draft blob) | DISCREPANCY (naming): observed `Type:"RefField"` is not a `NodeType` enum member; source enum has `FetchField`/`AggregateField`. `RefField`/`RefModel` are **keys on a Field-type Node** (`Node.get_field` cross-ref `__init__.py:1090`), not a distinct node Type. `Syntax` ∈ Infix/Chain are free-form strings (verified in `PurchaseRequest.json:213` "Infix"), not an enum. |
| **Page** | `{Kind:"Page",Settings,PageType,Page::Component[],Page::Container[],Page::InputParameter?,Page::EventMapping?,Page::VariableRef[]}` | `page_model.py:99-191` (`Page::Container`,`Page::Component`,`Page::Variable`,`Page::Popup`); `Page::Component`/`Page::VariableRef` also `serializer_constants.py:434/436` | `GET /metadata/2/{acct}/application/{appId}/page/{pageId}/draft` (`/schema` published) | `PUT …/draft`→`POST …/publish`; AI gen `POST …/flow_builder/application/{appId}/page/create` (**access-key**, `flow_builder.py:784`) | `Page::EventMapping` and `Page::InputParameter` not found as page-model relations: events attach via Container/Component; InputParameters live in `SysConfig`. |
| **Container** | `{Kind:"Container",Type,Name,Container::Container[],Container::Component[],Container::FieldMapping[],Container::Style[],Container::EventMapping[],Container::VariableRef[]}` | `page_model.py:440-792` (rel keys :783-788); `ContainerType` `page_model_constants.py:73-80` | (in page blob) | (in page blob) | Matches. Type ∈ Body\|Container\|Component\|Layout\|Column(+Tab/Popup/MasterDetail). |
| **Component** | `{Kind:"Component",Script{web:"view/list"\|"general/card"\|"report/chart"\|…},Data{category,…,flow_id?,report_id?},Component\|Container}` | `page_model.py:858-1115` | (in page blob) | (in page blob) | Components attach under `Page::Component[]` OR `Container::Component[]` (both seen in mock `Draft_Test_Page_A00.json`). `Component::FieldMapping` not a model relation — field mappings hang off the Container/Component via `Container::FieldMapping`. |
| **FieldMapping** | `{Kind:"FieldMapping",Name,Type?,Label?,Component\|Container,FieldMapping::Property[]}` | `page_model.py:1316-1379`; `FieldMapping::Property`=`page_model.py:1367` | (in page blob) | (in page blob) | Matches. |
| **Property** | `{Kind:"Property",Type:Value\|Variable\|SimpleFilter\|Code\|Page\|FilterParam,Value?,FieldMapping\|EventMapping,Property::VariableRef[],Property::FieldMapping[]}` | `page_model.py:1452-1552`; `PropertyTypes` `page_model_constants.py:88-94`; `Property::VariableRef`=`:1536`,`Property::FieldMapping`=`:1537` | (in page blob) | (in page blob) | DISCREPANCY: `PropertyTypes` enum has Page/SimpleFilter/FilterParam/Object/Value/Variable. `"Code"` is observed live + documented (`page.md:1239`) but is NOT in the enum — handled as a free-form string. |
| **EventMapping** | `{Kind:"EventMapping",Type:JSAction\|Redirection,Name:on_load\|on_click,Page\|Component\|Container,EventMapping::Property[]}` | `page_model.py:1382-1449`; `EventMapping::Property`=`page_model.py:1438`; types documented `page.md:924-1239` | (in page blob) | (in page blob) | `JSAction`/`Redirection`/`OpenPopup` are free-form `Type` strings (no Python enum). JSAction→Property`{Type:"Code",Value:<JS>}`; Redirection→Property`{Type:"Page",Value:<pageId>}`. |
| **VariableRef** | `{Kind:"VariableRef",Type:"ApplicationVariable",Name\|Variable:<appVar>,…}` | `page_model.py:1700-1725` | (in page blob) | (in page blob) | Matches. |
| **Style** | `{Kind:"Style",Container\|Appearance,Value{…}}` | `page_model.py:1248-1313` | (in page blob) | (in page blob) | Matches. |
| **Process Activity (step)** | `Activity{NodeType,Activity::Resource[],Activity::Permission[]}`; Resource`{ValueType:"AppRole",Value:<roleId>}`; Permission`{Column,Permission}` | `NodeType` `workflow_constants.py:38-46`; built `metadata/server/generator/process.py:104-135` | `GET /metadata/2/{acct}/process/{id}/draft` | `PUT …/process/{id}/draft`→publish | Matches (verified vs `generator/process.py`). |
| **Caseflow / Statuses** | `{Statuses,Transitions}`; `CaseStatus` via `CaseFlow::Status` | `case_model.py:324-657`; `CaseFlow::Status`=`metadata_blob.py:56` | `GET …/case/{id}/caseflow/{cfId}/draft` | `PUT …/caseflow/{cfId}/draft`→publish | Matches. |
| **CasePermission** | `CasePermission{Type:User\|Subflow,CasePermission::Permission[]}`; Permission`{Status,Column,Permission,Model}` | `case_model.py:161-223`; rel `CasePermission::Permission`=`:58`; serializer `case_serializer.py:85-189` | (case permission draft) | `PUT /case/2/{acct}/{caseId}/case-permission/{cpId}` (`case_permission.py:19,182`) | Matches. Maps (Status × Column) → level; Hidden wins. |
| **Form-view Permission** | `Permission{Column,Permission:Editable\|ReadOnly\|Hidden}` under `Model::Permission` | `Model::Permission`=`metadata_blob.py:120`; `Column`=`:238`,`Permission`=`:210`; serializer `view_serializer.py:42-138` | (form-view draft) | `PUT …/formview/{viewId}/draft`→softpublish | Matches. Visibility enum `Editable\|ReadOnly\|Hidden` (`case/constant/constants.py:1199-1204,1452-1457`); process adds `Mandatory`. |
| **Role (app_role)** | `{_id,Name,Description,Preference,_application_id,Users[],Groups[],ServiceAccounts[]}` | `user/route/app_role.py:611`; `Kind` ∈ User\|Group\|AppRole `flow.py:385-392`; member entry `flow.py:367-374`; capability enums `base/base/auth/permissions.py` | `GET /app_role/2/{acct}/…` | `POST/PUT/DELETE /app_role/2/{acct}/[<id>]` (**access-key** via `X-Api-Key`) | Matches. Role referenced by `_id`; capability perms come from `*RoleDefinition` `roles.py:174-1030`. |
| **Custom Component** | `{Name,Description,Layout,Category,_application_id}` | `application/route/custom_component.py:1196` | `GET /application/2/{acct}/{appId}/component/custom/…` | `POST …/component/custom/` (**access-key**) | Matches. |

---

## 3. Comparison Findings (live-observed vs source)

### Strong matches (observed structure confirmed in source)
- **Entire form-draft entity graph** — Model/Row/Column/Field/QueryDefinition/Criteria/Condition/Expression/Node
  all map 1:1 to classes in `businessobject/core/server/metadata/__init__.py` (726, 1134, 1316, 1354, 1062, 1076)
  and relation-key constants in `metadata_blob.py` (`Model::Field`:109, `Row::Column`:45, `Column::Field`:65,
  `Field::Expression`:96, `Expression::Node`:46, `Field::QueryDefinition`:93, `QD::Criteria`:50, `Field::Constraint`:99).
- **Field type-specific keys** — `CurrencyTypes`(:290), `ReferredList`(:325), `LookupField`(:383), `HiddenField`(:429),
  `SortBy`(:385) all present.
- **Resolved-field synthesis** — observed `SourceFlowId`/`SourceFlowType`/`Attributes` on User/Reference fields
  are computed at read-time exactly as `__init__.py:1047-1052` does it (not stored on the field).
- **Operators / RHSType / visibility levels** — `OPERATORS`(`base/.../__init__.py:1113-1161`),
  `RHSType`(:1202-1205), `Editable|ReadOnly|Hidden(|Mandatory)`(`case/constant/constants.py:1199-1204`) all match.
- **Page entity graph** — Page/Container/Component/FieldMapping/Property/EventMapping/VariableRef/Style and their
  `::` relation keys all confirmed in `page_model.py:99-1725` (+ confirmed in mock blob `Draft_Test_Page_A00.json`).
- **Process steps / Case permissions / Roles** — Activity/Resource/Permission, CasePermission, app_role all verified
  against the generators and serializers cited in `AUTHORING_API_MAP.md` (process.py:104-135, case_model.py:161-223).
- **Expression engine** — `ExpressionEngine`(`expression_engine.py:31`), function registry
  (`function_definition.py:1-217`, operator aliases :236-238), error `KISSFLOW_ERROR_01088`(:54-67), and the
  `Price*Qty → Node{Syntax:"Infix"}` shape verified against fixture `PurchaseRequest.json:200-213`.

### Discrepancies / clarifications
1. **Application container fields live on the FLOW DOC, not the metadata app blob.** `Theme/CustomColors`,
   `Languages/_is_translation_enabled`, `BuildNumber/VersionNumber`, `AppTemplate` are flow-doc constants
   (`flow.py:113-114,137,325,336,651-653`; `flow/utils/constants/__init__.py:459`). The metadata
   `application_model.py` generator only defines `Name/Description/DefaultPage/Navigation`. The observed
   `/app/{appId}/info` payload is the flow-doc view, which is correct — just sourced from a different module
   than one might first grep.
2. **Node `Type:"RefField"` is not a NodeType enum value.** Source enum (`engine/__init__.py:1-7`) is
   `Function|Static|Field|AggregateFunction|AggregateField|FetchField`. The observed "RefField" reflects a
   **Field-type node carrying `RefField`/`RefModel` keys** (reference lookup via `Node.get_field` cross-ref,
   `__init__.py:1090`), not a separate node type. `Syntax` (`Infix`/`Chain`) is a free-form string key, not an enum.
3. **`Property Type:"Code"` is not in the `PropertyTypes` enum.** Enum (`page_model_constants.py:88`) =
   Page/SimpleFilter/FilterParam/Object/Value/Variable. `"Code"` (the JSAction JS body) is a free-form string,
   documented at `page.md:1239`, present in page mocks — handled but not enumerated.
4. **`EventMapping Type` values (`JSAction`/`Redirection`/`OpenPopup`) are free-form strings, not a Python enum.**
   Documented at `page.md:924-1239`; pervasive in page mock JSONs. Same status for page `Component.Script.web`
   manifest paths (e.g. `view/list`, `general/card`, `report/chart`).
5. **Page `InputParameter` is not a top-level blob entity with a `Page::InputParameter` relation.** It lives in
   `SysConfig.InputParameters[]` on the page doc (still has `Kind:"InputParameter"`, `Name`, `DataType`,
   `IsRequired`, `DefaultValue`). The observed list-item shape is correct; the relation-key in the entity-graph
   section is the only inaccuracy.
6. **Report appearance keys (`ViewType`, `ReportAppearance`, `ColorPalette`) are not named enum constants.**
   They are service-class behavior (`report_service.py` `FormBarColumnChartReportService`/`FormPieChartReportService`)
   + free-form runtime JSON. Only `ReportType` is a named constant (`reportbase/reportcore/utils/constants.py:153`).
7. **Integration `Entities` nesting differs in presentation.** Observed nests `Entities[]` under `Connectors[]`;
   source stores `Integration::Trigger`/`Integration::Action` id-lists with a `Connector{Kind:"Connector"}`
   sub-object (fixture `kissflow_integration.json`). Same underlying data.

### Source-only (not seen live but present in source)
- Extended field types beyond the observed set (RichText, StarRating, Signature, Scanner, Grid, Counter, Image,
  Geolocation, TableField, StepField, Roles, Custom) — `metadata/utils/constants/model_constants.py:1-62`.
- App-variable DataTypes beyond Number/Text: DateTime/Boolean/Json/ObjectList/StringList (`application_variables.py:30-39`).
- NodeTypes `AggregateFunction`/`AggregateField`/`FetchField` (aggregation/fetch fields) not in the observed expressions.
- `Field::Constraint` (Unique), `FieldRequirement::Criteria`, `ColumnVisibility::Criteria`, `Aggregate::QueryDefinition`
  — the observed app simply did not use these, but they are first-class field children (`__init__.py:907-991`).

### Live-only (observed but NOT found in source)
- None that are genuinely absent. Every observed key was located. The four "free-form string vs enum" items
  (RefField node, Code property, JSAction/Redirection event, ColorPalette) **exist in the data/docs** but are not
  backed by a Python enum constant — they are stored as plain strings the page/expression engine reads, so they
  are valid blob values even though there's no constant to cite. This is the single most important caveat for a
  code-generating author: do not assume an enum guard exists for these.

---

## 4. Authoring Order (dependency-driven build sequence)

Reachability tags per `AUTHORING_API_MAP.md`: **[AK]** = access-key reachable (`X-Access-Key-*` or `X-Api-Key`
in docstring); **[apikey]** = public `X-Api-Key`-family draft/publish on an existing flow; **[internal]** =
`/metadata/kfv2/…` service-only (no public route); **[session]** = RBAC/session only, no API-key advertised.

1. **Application shell** — `POST /flow/2/{acct}/application/` **[session/rbac User]**
   (the app-shell create has no explicit access-key block; `application.py:1060`). Portal shell is the one
   app-level create that IS explicit access-key (`portal/app.py:439`).
   - App metadata blob then bootstrapped **[internal]** (`internal.py:1276`); app draft/publish is rbac-Admin **[session]**.
2. **Lists / Datasets first** (referenced by Reference/lookup fields downstream) —
   `POST /flow/2/{acct}/dataset/` **[AK]** (shell) → model bootstrap **[internal]** → fields via
   `PUT /metadata/2/{acct}/dataset/{id}/draft` **[apikey]**.
3. **Forms** (the data backbone other flows reference) — `POST /flow/2/{acct}/form/` **[AK]** →
   model bootstrap **[internal]** → fields/layout/expressions/queryDefs/criteria via
   `PUT /metadata/2/{acct}/form/{id}/draft` **[apikey]** → `POST …/publish`.
   - Computed fields: add `Expression`+`Node` tree, link `Field::Expression`; validate via
     `POST /form/2/{acct}/{id}/expression/{exprId}/execute`. Reference fields: add `QueryDefinition`
     with `LHSModel:<targetFormId>` (target form must already exist → forms ordered by dependency).
4. **Processes / Cases** (reference forms & datasets) — `POST /flow/2/{acct}/{process|case}/` **[AK]** →
   bootstrap **[internal]** → fields **+ workflow/caseflow** via `PUT /metadata/2/{acct}/{process|case}/{id}/draft`
   **[apikey]** → publish. Case statuses via `caseflow` draft; process steps as `Workflow.Step[]`/`Activity[]`.
5. **Views** (need the model's fields to exist) — view shell in `flow/` **[session]**, then
   `PUT /metadata/2/{acct}/{type}/{id}/{type}view/{viewId}/draft` **[apikey]** → softpublish.
6. **Roles** (`app_role`) — `POST /app_role/2/{acct}/` **[AK]** (works live with access key). Create before
   permission wiring so step/status/field perms can reference role `_id`.
7. **Permissions** (need roles + steps/statuses/views to exist) —
   - Process: bind role as step assignee (`Resource{ValueType:"AppRole",Value:<roleId>}`) + `Activity::Permission`
     in the **process draft** **[apikey]**.
   - Case: `Permission{Status,Column,Permission}` under `CasePermission::Permission` via
     `PUT /case/2/{acct}/{caseId}/case-permission/{cpId}` **[apikey]**.
   - Form view: `Permission{Column,Permission}` under `Model::Permission` in the **form-view draft** **[apikey]**.
   - App access: `POST /flow/2/{acct}/application/{appId}/member/batch` **[session]** / role↔app
     `POST /app_role/2/{acct}/application/{appId}/external/batch` **[AK]**.
8. **App (session) Variables** — `POST /application/2/{acct}/{appId}/variable/` **[session]** (NOT access-key).
   Author before pages, since page components/JS read them.
9. **Integrations** (optional) — model bootstrap **[internal]** only; no public author route.
10. **Custom Components** (optional, before pages that embed them) —
    `POST /application/2/{acct}/{appId}/component/custom/` **[AK]**.
11. **Pages last** (consume flows, views, app variables, custom components) — shell
    `POST /flow/2/{acct}/application/{appId}/page/` **[session]** → layout/components/bindings via
    `PUT /metadata/2/{acct}/application/{appId}/page/{pageId}/draft` **[session, mbac Admin/Edit]** → publish.
    AI page generation is the one page route that IS explicit access-key:
    `POST …/flow_builder/application/{appId}/page/create` **[AK]** (`flow_builder.py:784`).
12. **Theme / Languages** — flow-doc keys on the application; set via app update/draft **[session]**.
13. **App Templates** (publish/distribute) — `appstore/` **[session, rbac/abac]**.

> **Access-key reality (from AUTHORING_API_MAP):** an access key can mint flow shells, create/manage roles,
> create custom components, and drive the AI flow/page builder. It CANNOT directly create a model or field
> (those are INTERNAL bootstrap + `X-Api-Key`-gated draft/publish on an already-created flow). So the practical
> bootstrap is: **[AK] create shell → [internal] auto-creates default model → [apikey] PUT draft/publish to
> author fields/layout/workflow/views/permissions.**

---

## Source-citation index (anchors)

- Metadata classes: `businessobject/core/server/metadata/__init__.py` — Field:726, is_computed_field:848,
  Expression:1062, Node:1076, QueryDefinition:1134, AggregateDefinition:1305, Criteria:1316, Constraint:1343,
  Condition:1354, VisibilityCondition:1425, RequirementCondition:1440; User/Ref synth:1047-1052.
- Relation/key constants: `base/base/constants/metadata/metadata_blob.py` — OneToMany@37, BlobConstants@188;
  Expression::Node:46, Row::Column:45, QD::Criteria:50, FieldValidation::Criteria:51, FieldRequirement::Criteria:52,
  Field::Constraint(53/99), ColumnVisibility::Criteria:54, CaseFlow::Status:56, CasePermission::Permission:58,
  Column::Field:65, Field::QueryDefinition:93, Field::Expression:96, Model::Row:108, Model::Field:109,
  Model::Permission:120, Activity::Permission:129, Permission:210, Column:238, Required:282, CurrencyTypes:290,
  ReferredList:325, LookupField:383, SortBy:385, MinValue:410, MaxValue:411, ExpressionStr:423, HiddenField:429.
- Node/engine: `businessobject/core/engine/__init__.py:1-7` (NodeType); `expression_engine.py:31,54-67`;
  `function/function_definition.py:1-217,236-238`; `condition_evaluator.py:270-327`;
  `services/ai_formula_service.py:42-587`; fixture `tests/server/metadata/storage/PurchaseRequest.json:200-213`.
- Operators/RHSType: `base/base/constants/__init__.py:1113-1161,1202-1205`.
- Field types: `base/base/constants/metadata/__init__.py:72` (FieldType); `metadata/utils/constants/model_constants.py:1-62` (FieldTypes).
- Page schema: `metadata/server/generator/model/page_model.py` — Page:99-191, Container:440-792(rels 783-788),
  Component:858-1115, Style:1248-1313, FieldMapping:1316-1379(Property rel 1367), EventMapping:1382-1449(Property 1438),
  Property:1452-1552(VariableRef 1536, FieldMapping 1537), VariableRef:1700-1725;
  `metadata/utils/constants/page_model_constants.py:73-94` (ContainerType, PropertyTypes); docs `page.md:924-1239`.
- App/flow doc: `base/base/constants/metadata/flow.py:113-114,137,325,336,385-392,651-653`;
  `flow/utils/constants/__init__.py:459`; `application/services/app_variable_service.py:71-103`;
  `application/schema/app_variable.py:11-19`; `base/.../application_variables.py:10,30-39`.
- Permissions/roles: `base/base/auth/permissions.py`, `base/base/auth/roles.py:174-1030`;
  `metadata/server/generator/process.py:104-135`; `case_model.py:161-223`; serializers `view_serializer.py:42-138`,
  `case_serializer.py:85-189`.

_All endpoint/auth claims trace to `AUTHORING_API_MAP.md` (which cites `add_url_rule` file:line per route)._
