# DELTA — Professional Services app: PAGE & CUSTOM-COMPONENT findings

## Source verification

> **Source-verified against** `/Users/dinesh/Projects/kissflow-xg` (the company's own Kissflow source — authorized).
> **Date of pass:** 2026-06-25.
>
> An earlier pass used the wrong path (`/Users/dinesh/Projects/kf-framework/kissflow-xg/`, which does not exist) and so marked everything "(data-only)". This pass greps the real source. Each NEW attribute / entity-type / enum value below now carries a confirming `file:line` where found, or keeps "(data-only)" with a stated reason where genuinely absent.
>
> **Primary source locations used:**
> - `metadata/migration/new_app_builder/mappings.py` — the canonical component registry: maps every `Script.web` id → widget `Type`, `Path`, and full `Data` block (`manifest_id/category/visualization_type/flow_type/view_id`), the `report` `Path_map` (all chart `visualization_type`s incl. `barcolumnchart/barrowchart/piechart/doughnutchart/autochart/tabular/pivot`), and `style_value_maps` (the `var(--kf-app-*)` token → `{ref:…}` table).
> - `metadata/utils/page_builder/component_catalog.py` — `COMPONENT_REGISTRY`: builder-side widget registry (`Label/Button/Card/Icon/Image/.../ChartReport/Tab/Popup` → script_path/visualization_type/category).
> - `metadata/utils/page_builder/entity_factory.py` — entity constructors (exact emitted key sets for Page/Container/Component/FieldMapping/Property/Style/EventMapping/VariableRef/Popup/Tabs/Tab).
> - `metadata/utils/constants/page_model_constants.py` — `ContainerType`, `PropertyTypes`, `StyleConstants` (Style.Value keys).
> - `metadata/utils/constants/model_constants.py` — `VariableRefTypes`, `FlowType`.
> - `base/base/constants/page_component_constants.py` — `BaseProperty`: the canonical `Data`-key string constants (`manifest_id/category/subcategory/visualization_type/view_id/sub_view_type/...`).
> - `base/base/constants/application_constants.py` — `component_id` Data-key constant.
> - **Real page-export fixtures** under `metadata/tests/mock/metadata/` and `…/draft/` (e.g. `draft/Page001.json`, `draft/Process_Views_Page_A00.json`, `Draft_General_Widgets_Page_A00.json`) — these are committed real exports and are treated as source confirmation for export-shaped enum values (the FieldMapping `Type` enum, the `Settings` shape, `category/subcategory`, event names, etc.).
> - `metadata/config/axiom/context/page.md` — authoring-context doc confirming EventMapping `JSAction/OpenPopup/Redirection`, `on_click/on_load`.
>
> **Most important confirmations:** the component/visualization registry is `mappings.py` (+ `component_catalog.py`); FieldMapping/Property/EventMapping enums confirmed in `page_model_constants.py` + real export fixtures; the `var(--kf-app-*)` ↔ `{ref}` relationship is explicit in `mappings.py:530-609`.
>
> **NO source backing (flagged — metadata is sacrosanct):**
> - **Event names `on_close` and `on_tab_change`** — ZERO hits anywhere in source (constants, fixtures, or page.md). The export carries these but the source generator/registry does not define them. Treat with caution.
> - **manifest_id names `CaseForm`/`CaseViewKanban`/`FormViewGallery`/`FormAllItems`/`MyTasks`** — NOT in source. The source `mappings.py` emits `Form`/`Kanban`/`Gallery`/`Table` as `manifest_id` (with paths `case/form`, `case/views/kanban`, `form/views/gallery`, `process/mytasks`). The compound names in this delta appear to be the delta author's own labels, not source constants.
> - **`category` values `Case` / subcategory `report` / subcategory `view`** — NOT found as literals. Source `mappings.py` uses `category:"view"` for all view/case/form widgets; fixtures only show `category` ∈ {`general`,`Form`,`Process`,`custom`} and `subcategory` ∈ {`system`,`custom`}. The `Case` category and `report`/`view` subcategory values in this export are unconfirmed by source.
> - **`Theme.CustomColors`** — ZERO hits (see METADATA_ATTRIBUTES §5.2).

---


> **Source export:** `/Users/dinesh/Projects/kf-framework/ProfServAppMetadata/` (real published app
> `Professional_Services_Executive_Da_A00`, account `Ac3yZk6rUFHf`).
> **Compared against:** `reference/METADATA_ATTRIBUTES_page.md` (the source-derived catalog) and
> `reference/OBSERVED_OBJECTS.md` (the prior live-observation catalog).
>
> **Verification status:** the kissflow-xg source tree is **not present** at
> `/Users/dinesh/Projects/kf-framework/kissflow-xg/`, so every NEW item below is from the export only
> and is marked **(data-only)**. Citations are `file` paths relative to the export root
> `ProfServAppMetadata/application/Professional_Services_Executive_Da_A00/page/`.
>
> Pages walked: 11 page metadata blobs — dashboards (`manager_dashboard_page_A00` 433 KB,
> `copy_of_manager_dashboard_page_A00` 405 KB, `team_member_dashboard_page_A00` 69 KB), boards
> (`projects_board_page_A00`, `enquiry_board_page_A00`, `tasks_board_page_A00`), form pages
> (`add_modify_customer_master_page_A00`, `add_modify_project_details_master__A00`,
> `view_customer_master_page_A00`), and `customer_feedback_page_A01`, `home_page_A48`.
> Entity-instance counts across all 11: Property 1321, FieldMapping 1267, Style 639, Container 630,
> Component 208, VariableRef 59, EventMapping 37, Page 11, Popup 9, Tab 6, Tabs 2.

---

## 0. Headline new findings

- **New Component visualization_types** beyond the catalog's `card/report/pivot/table/form`:
  `barcolumnchart`, `barrowchart`, `autochart`, `piechart`, `doughnutchart`, `tabular`, `table`,
  `label`, `button`, `icon`, `image`, `kanban`, `gallery`, `form`, `tab`, `custom`.
  **CONFIRMED** — chart viz types in `metadata/migration/new_app_builder/mappings.py:447-460` (`report.Path_map`);
  `kanban`/`gallery`/`matrix`/`timeline` at mappings.py:393,352,419,432; `label/button/icon/card/image/tab`
  in `component_catalog.py:30,39,52,65,78,176` and mappings.py Type keys; `custom` mappings.py:495.
- **New Script `web` ids** (the widget renderer paths): `general/label`, `general/card`,
  `general/button`, `general/icon`, `general/image`, `general/tab`, `report` (charts/tabular),
  `case/form`, `case/views/kanban`, `dataform/allitems`, `dataform/views/gallery`,
  `process/mytasks`, and a **custom-component path** form
  `<acct>/application/<appId>/<ccId>/<bundleId>/index.html`.
  **CONFIRMED** as registry keys in `mappings.py`: `general/label`(125), `general/card`(106), `general/button`(9),
  `general/icon`(91), `general/image`(226), `general/tab`(200), `report`(439), `case/form`(332),
  `case/views/kanban`(387), `process/mytasks`(290). Also `component_catalog.py` `script_path`s (28-187).
  NOTE: source uses `form/views/gallery`(346) and `form/allitems`(247), not `dataform/...`; the
  `dataform/` prefix in this export is a runtime alias — **(data-only for the `dataform/` spelling)**.
  Custom-component HTML path is a free-form served-bundle URL — **(data-only: per-instance string, no constant)**.
- **New `manifest_id` inventory** (the canonical widget-type id, in `Data.manifest_id`):
  `Label, Card, Button, Icon, Tab, ChartReport, TabularReport, CaseForm, CaseViewKanban,
  FormAllItems, FormViewGallery, MyTasks`.
  **PARTIALLY CONFIRMED.** `Label/Card/Button/Icon/Image/Hyperlink/Iframe/Progressbar/Richtext/Masterdetail`
  confirmed as manifest_ids in real fixture `Draft_General_Widgets_Page_A00.json` and as `Type` keys in mappings.py.
  `ChartReport`/`TabularReport` confirmed (mappings.py:442-443 `Path_map`; component_catalog.py:146).
  **NOT IN SOURCE:** `CaseForm`, `CaseViewKanban`, `FormAllItems`, `FormViewGallery`, `MyTasks` — source emits
  `Form`/`Kanban`/`Table`/`Gallery` as manifest_id (mappings.py:310,391,251,350) under paths `case/form`,
  `case/views/kanban`, `form/allitems`, `form/views/gallery`, `process/mytasks`. The compound names here are
  unconfirmed by source — **(data-only; likely the delta author's own composite labels, NOT source constants)**.
- **New FieldMapping.Type enum values**: `Style`, `Icon`, `Toggle`, `Dropdown` (catalog only had
  `Value/Variable/FilterParam/Code/Popup/Richtext` + unverified `Object/TypePicker/Hiddenproperty/TooltipPositionPicker`;
  `Object/Hiddenproperty/TooltipPositionPicker` are now **confirmed in data**).
- **New EventMapping.Name enum values**: `on_close`, `on_tab_change`, `on_submit`, `on_discard`
  (catalog had only `on_click/on_load` confirmed).
- **Style.Value shape differs from catalog**: here it is a flat `{ "<cssKey>": "<string>" }` map whose
  values are CSS-variable strings (`"var(--kf-app-color-primary-500)"`), **not** the
  `{value:…}|{ref:"Color.White"}` wrapper documented in OBSERVED_OBJECTS.md §9.
  **CONFIRMED** — both forms are real and the migration bridges them: `mappings.py:530-609` `style_value_maps`
  maps the flat CSS-token strings (`"var(--kf-app-color-primary-500)"`) to the `{ref:"Color.Primary.500"}`
  wrapper. So the flat-string form is the published/runtime shape, the `{ref}` form is the authoring-model
  shape; entity_factory.create_style (entity_factory.py:127-137) writes `Value: <style_value dict>`.
- **Containers carry NO `LayoutType`/`LayoutConfig`/`isHidden`/`IsSystem`/`haveHeightLimit`** in this
  export — geometry is expressed entirely through child `Style` entities (`width`, `minHeight`,
  margins, paddings, radius, `background`, `boxShadow`, flex alignment). The grid/flex LayoutConfig
  model in the catalog (§1.2) is absent here.
- **Custom-component manifest** is a `Manifest`/`DraftManifest` envelope with
  `{Source, category, subcategory, visualization_type, layout[], manifest_version, name,
  template_id, properties{general:[]}, scripts{web}, type:"External", version}`.

---

## 1. New / refined page-entity attributes (per Kind)

All entities are stored in a **flat dict keyed by `Id`**, `Root`→pageId; same convention as the catalog.
Below: attributes **observed** in this export, flagging any **not in the catalog** or **shaped differently**.

### 1.1 Page
Observed keys: `Id, Kind:"Page", Name, Description, FlowType:"Page", Settings, Page::Container,
Page::Component, Page::Popup, Page::VariableRef`.
- `Settings` concrete shape (catalog said opaque `{}`): **`{Background:"Colour", Colour:"--page-bg-2", Height:100, Width:100}`**. **CONFIRMED** — exact shape in real fixture `metadata/tests/mock/metadata/draft/Page001.json:8-13` (`Background:"Colour", Colour:"--page-bg-2", Height:100, Width:100`). `Colour` is a CSS-var token name; `Height`/`Width` are numbers (percent).
- `FlowType` value is `"Page"` (catalog noted FlowType exists but not its page value). **CONFIRMED** — `entity_factory.create_page` hard-codes `"FlowType": "Page"` (entity_factory.py:20); also fixture `draft/Page001.json:4`.
- **Not present here:** `Page::Variable`, `Page::Popup` appears on only 5/11 pages, `Page::VariableRef` on 3/11. No `Application`/`_application_id` key inside the schema blob (those live in the flow doc, §5).

### 1.2 Container
Observed keys: `Id, Kind, Type, Name, Container(parent), Container::Style, Container::Container,
Container::Component, Container::FieldMapping, Container::VariableRef, Container::EventMapping`, plus
parent back-refs `Page` / `Tab` / `Popup`.
- **Parent back-ref variety** (one of): `Container` (604), `Popup` (9), `Tab` (6), `Page` (4 — the Body
  containers), `NONE` (7). No `MasterDetail` parent seen. *(catalog lists Tab/Popup/MasterDetail back-refs; **MasterDetail confirmed absent**, Tab/Popup confirmed present)*
- `Container::VariableRef` relation array — present (57×), **not in the catalog's Container relation list**
  (catalog had Style/Container/Component/FieldMapping/EventMapping/Criteria). **(data-only)** — the
  builder's `entity_factory.create_container` (entity_factory.py:55-59) only seeds
  `Container::Container/Component/FieldMapping/Style/EventMapping`; `Container::VariableRef` is a real
  relation in exports but is not seeded by this constructor, so no constant pins it here.
- **Absent in this export** (catalog attrs §1.2): `LayoutType`, `LayoutConfig`, `isHidden`, `IsSystem`,
  `haveHeightLimit`, `Container::Criteria`. Layout is done via `Container::Style`.

### 1.3 Component
Observed keys: `Id, Kind, Name, Container, Page, Script:{web}, Data, Type?, Component::Tabs?`.
- `Script` is **always** `{web:"<path>"}` (single key). *(file: all)*
- `Type` appears only on the 2 tab-host components (`Type:"Tab"`); otherwise absent.
- `Component::Tabs` present on tab hosts; **`Component::MasterDetail` never appears** in this export.
- **`Data` object — confirmed richer key set** than catalog §1.3 (`manifest_id/visualization_type/category/_application_id`).
  Full observed key set: `category, subcategory, visualization_type` (on all 208),
  `manifest_id` (197), `flow_id`+`flow_type` (56), `report_id` (46), `view_id` (4),
  `component_id` (2, custom comps), `sub_view_type` (1).
  **CONFIRMED as canonical Data-key constants** in `base/base/constants/page_component_constants.py` class
  `BaseProperty`: `manifest_id`(11), `category`(12), `subcategory`(13), `visualization_type`(14),
  `sub_view_type`(18), `view_id`(19); `flow_id`/`flow_type` constants in `base/base/constants/application_constants.py:17`
  + `auth_config.py:38-39` + `notification_constants.py:271-272`; `component_id` in `application_constants.py:3`.
  The `Data` block contents are emitted by `entity_factory.create_component` (entity_factory.py:77-81) and the
  per-widget `Data` dicts in `mappings.py` (e.g. `case/form` Data mappings.py:335-340, `process/mytasks` 293-298).
  `report_id` is a free-form report reference string — **(data-only: no dedicated string constant in base; carried as a Data key)**.
  `_application_id` from the catalog is **not** present in Data here (correct — it lives in the flow doc, §5).
  - `category` values: `general`(150), `Case`(52), `Form`(3), `Process`(1), `custom`(2).
    **CONFIRMED:** `general` (component_catalog.py:31; fixture), `Form` (fixture `draft/Page001.json:901`),
    `Process` (fixture `Draft_Process_Views_Page_A00.json`), `custom` (fixture; mappings.py:495).
    **NOT IN SOURCE:** `category:"Case"` — zero hits repo-wide. Source uses `category:"view"` for case/form/process
    view widgets (mappings.py:252,377,etc.); the `Case` category in this export is **(data-only, unconfirmed)**.
  - `subcategory` values: `system`(156), `report`(46), `view`(4), `custom`(2).
    **CONFIRMED:** `system` (fixture `Draft_Process_Views_Page_A00.json`), `custom` (fixture).
    **NOT IN SOURCE:** `subcategory:"report"` and `subcategory:"view"` — zero hits repo-wide — **(data-only, unconfirmed)**.
  - Example report Data: `{"manifest_id":"ChartReport","category":"Case","subcategory":"report","visualization_type":"barcolumnchart","flow_id":"Professional_Services_Projects_A00","flow_type":"Case","report_id":"Active_Projects_Revenue_Quarterly_A00"}` *(file: manager_dashboard_page_A00)*
  - Example case-view Data: `{"manifest_id":"CaseViewKanban","category":"Case","subcategory":"view","visualization_type":"kanban","flow_id":"...","flow_type":"Case","view_id":"Main_View_A00"}`
  - Example gallery Data (has `sub_view_type`): `{"manifest_id":"FormViewGallery","category":"Form","subcategory":"view","visualization_type":"gallery","sub_view_type":"matrix","flow_id":"Customer_Data_A00","flow_type":"Form","view_id":"Customer_Master_View_A00"}`
  - Example custom Data: `{"category":"custom","subcategory":"custom","visualization_type":"custom","component_id":"CC6cAIoZI9wB"}`

### 1.4 FieldMapping
Observed keys: `Id, Kind, Name, Type?, Label?, Container|Popup(parent), Property?, FieldMapping::Property`.
- `Type` present on 781/1267 (absent ⇒ plain value-binding mapping).
- `Label` present on 42 (only on user-facing config like `title/color/backgroundColor/textStyle/fontSize/size`).
- **New Type values** (see §3.4).
- `FieldMapping::Property` is the child-property array (present on 1257). `Property` back-ref appears on 4.

### 1.5 Property
Observed keys: `Id, Kind, Type, Value?, Name?, FieldMapping|EventMapping(parent),
Property::VariableRef?, Property::FieldMapping?`.
- `Value` is heterogeneous by `Type`:
  - `Value` type → literal string/number/object (e.g. `"12px"`, `"#fff"`, `{"fontWeight":"bold"}`,
    or the sentinel string `"inheritProperty"`).
  - `Code` type → a JS string (the on-click/on-load script body calling `kf.app.page.getComponent(...).show()/.hide()`, `kf.api(...)`, `kf.app.setVariable(...)`).
  - `Popup` type → a popup id string (`"Popup_1cDl7-Fnj"`).
  - `Variable`/`SimpleFilter`/`FilterParam` → `Value:null`; the binding is carried by
    `Property::VariableRef` (Variable) or a sibling SimpleFilter/FilterParam structure.
- `Property::VariableRef` (59) and `Property::FieldMapping` (4) confirmed.

### 1.6 EventMapping
Observed keys: `Id, Kind, Name, Type, Container|Popup(parent), EventMapping::Property`.
- `Type`: `JSAction`(28), `OpenPopup`(9). **No `Redirection`** in this export (catalog had it unverified).
- `Name`: `on_click`(25), `on_load`(3), `on_close`(3), `on_tab_change`(2), `on_submit`(2), `on_discard`(2).
- Parent is `Container`(34) or `Popup`(3). No `Component`/`Page`/`Property` parent in this export.
- `OpenPopup` example: `{Kind:"EventMapping", Name:"on_click", Type:"OpenPopup", Container:..., EventMapping::Property:[<one Property of Type:"Popup">]}` — the popup target is the child Property's `Value`.

### 1.7 VariableRef
Observed keys: `Id, Kind, Type:"ApplicationVariable", Variable, Container, Page, Property`.
- Every VariableRef here is `Type:"ApplicationVariable"`; carries **both** `Variable` (the app-var name,
  e.g. `"Active_Projects"`) **and** parent back-refs `Container` + `Page` + `Property`.
- Catalog §1.7 lists the back-ref `Variable` plus Page/Container/Property/Popup; this export uses
  `Variable`+`Container`+`Page`+`Property` together (no `Popup` here). **CONFIRMED** — the exact emitted
  key set (`Type, Variable, Container, Page, Property`) is `entity_factory.create_variable_ref`
  (entity_factory.py:187-195). `Type:"ApplicationVariable"` confirmed in fixtures (e.g.
  `Draft_General_Widgets_Page_A00.json`) and `VariableRefTypes.APPLICATION_VARIABLE` (model_constants.py:169).

### 1.8 Style
Observed keys: `Id, Kind, Value, Container|Popup(parent)`.
- **`Value` is a flat `{cssKey: "stringValue"}` map** (all 2585 leaf values are JSON strings). This is a
  **different shape** from OBSERVED_OBJECTS.md §9 (`{"<Dotted.Style.Key>":{value:…}|{ref:…}}`). Here keys
  are plain camelCase CSS keys and values are CSS strings, frequently `var(--kf-app-…)` tokens.
  **CONFIRMED** — `Style.Value` is created as a raw dict by `entity_factory.create_style` (entity_factory.py:131-136);
  the camelCase keys are `StyleConstants` (page_model_constants.py:4-62); the `var(--kf-app-*)` string values and
  their `{ref}` equivalents are the `style_value_maps` table (mappings.py:530-609). So flat-CSS-string is the
  published-blob form (confirmed real), the wrapped `{value}|{ref}` form is the authoring-model form.
- Parent is `Container`(630) or `Popup`(9). **No `Appearance` parent** seen (catalog/OBSERVED noted `Container|Appearance`).
- Observed `Value` keys (top): `width, borderStartStartRadius, borderStartEndRadius, borderEndStartRadius,
  borderEndEndRadius, marginInlineStart/End, marginBlockStart/End, paddingBlockStart/End,
  paddingInlineStart/End, background, borderColor, boxShadow, minHeight, height,
  borderInlineStartWidth, borderInlineEndWidth, borderBlockStartWidth, borderBlockEndWidth,
  borderStyle, justifyContent, alignItems, alignContent, cursor, minWidth, maxHeight, boxSizing, overflow`.
  All within the catalog §6.9 Style-key set (no new keys), but **value form = CSS string, not wrapped object**.

### 1.9 Popup
Observed: `{Id, Kind:"Popup", Name, Script:{web}, Page, Popup::Container, Popup::Style,
Popup::FieldMapping, Popup::EventMapping?}`. Matches catalog §1.10. **CONFIRMED** — `entity_factory.create_popup` (entity_factory.py:250-259) emits `{Id, Kind:"Popup", Script:{web:"general/popup"}, Name, Page, Popup::Container, Popup::FieldMapping, Popup::Style}`.

### 1.10 Tabs / Tab
- `Tabs`: `{Id, Kind:"Tabs", Component, Tabs::Tab:[…], DefaultTab}` — matches catalog.
- `Tab`: `{Id, Kind:"Tab", Name, hasBadge:bool, Tabs(parent), Tab::Container:[…]}` — matches catalog.
- The tab host is a `Component` with `Type:"Tab"`, `Script:{web:"general/tab"}`,
  `Data:{manifest_id:"Tab",category:"general",subcategory:"system",visualization_type:"tab"}`,
  and a `Component::Tabs` array.

---

## 2. Component inventory (what a page generator can place)

This is the full census of placeable widgets in this app, keyed by `Data.manifest_id` /
`Script.web` / `Data.visualization_type`. **Registry source: `metadata/migration/new_app_builder/mappings.py`
+ `metadata/utils/page_builder/component_catalog.py`.** Script.web ids and visualization_types are confirmed
there (see §0); the compound `manifest_id` labels in the first column (`CaseViewKanban`/`FormViewGallery`/
`FormAllItems`/`MyTasks`/`CaseForm`) are **NOT in source** — source emits `Kanban`/`Gallery`/`Table`/`Form` — so
those manifest_id cells are **(data-only, author labels)**. The `general/*`, `report`, `case/*`, `process/*`
script paths and all listed `visualization_type`s are **CONFIRMED**.

| manifest_id | Script.web | visualization_type(s) | category / subcategory | extra Data keys | count |
|---|---|---|---|---|---|
| `Label` | `general/label` | `label` | general / system | — | 75 |
| `Card` | `general/card` | `card` | general / system | — | 35 |
| `Button` | `general/button` | `button` | general / system | — | 23 |
| `Icon` | `general/icon` | `icon` | general / system | — | 8 |
| `Tab` | `general/tab` | `tab` | general / system | (Component::Tabs) | 2 |
| (none) | `general/image` | `image` | general / system | — | 1 |
| `ChartReport` | `report` | `barcolumnchart`, `barrowchart`, `autochart`, `piechart`, `doughnutchart` | Case/Form / report | `flow_id, flow_type, report_id` | 38 |
| `TabularReport` | `report` | `tabular`, `table` | Case / report | `flow_id, flow_type, report_id` | 8 |
| `CaseViewKanban` | `case/views/kanban` | `kanban` | Case / view | `flow_id, flow_type, view_id` | 3 |
| `CaseForm` | `case/form` | `form` | Case / system | `flow_id, flow_type` | 1 |
| `FormAllItems` | `dataform/allitems` | `table` | Form / system | `flow_id, flow_type` | 2 |
| `FormViewGallery` | `dataform/views/gallery` | `gallery` | Form / view | `flow_id, flow_type, view_id, sub_view_type` | 1 |
| `MyTasks` | `process/mytasks` | `custom`? | Process / system | `flow_id, flow_type` | 1 |
| (custom) | `<acct>/application/<appId>/<ccId>/<bundleId>/index.html` | `custom` | custom / custom | `component_id` | 2 |

Notes:
- **`report` is one Script id** that fans out into chart and tabular widgets via
  `manifest_id` (`ChartReport`/`TabularReport`) + `visualization_type` (the chart kind).
  `visualization_type` values seen across reports: `barcolumnchart`(20), `piechart`(7),
  `doughnutchart`(7), `tabular`(8), `table`(3), `barrowchart`(2), `autochart`(2).
- **No `report/pivot`** Script id appears in this export (catalog mentioned it; not present here).
- **No `general/text`/`general/richtext` Script** — rich text is a *FieldMapping.Type* (`Richtext`) on
  Label/Card components, not its own widget.
- View-bound widgets (`CaseViewKanban`, `FormViewGallery`, `FormAllItems`) reference a published
  view via `view_id` (+ `flow_id`/`flow_type`); report widgets reference a published report via `report_id`.

### Per-widget FieldMapping `Name` vocabulary (config knobs)
Distinct FieldMapping `Name`s observed (these are the config properties each widget exposes):
`color, backgroundColor, title, textStyle, fontSize, simpleFilter, report_type, report_id, flow_id,
flow_type, tooltipPosition, tooltipContent, captionColor, count, label, iconColor,
iconBackgroundColor, icon, cardType, caption, size, isBadgeType, iconUrl, badgeIndicationType,
badgeIndicationCount, badgeColor, showform, view_id, instance_id, filterParameters, case_id, sort,
search, steps, imageSrc, fillType, tabType, newItem, import, hoverColor, activeColor`.

---

## 3. New enum values (vs catalog §6)

### 3.1 Container Type — catalog §6.1 had `Container/Body/Tab/Popup/MasterDetail/Column/Layout` (7)
Observed: `Container`(267), `Component`(208), `Column`(96), `Layout`(33), `Body`(11), `Popup`(9), `Tab`(6).
- **CONFIRMED.** `Container/Body/Tab/Popup/MasterDetail/Column/Layout` are the `ContainerType` constants
  (page_model_constants.py:73-80). `Component` as a Container.Type is confirmed both in source
  (reverse_transformer.py:454 keys on `entity.get("Type")=="Component"`) and in real fixture
  `draft/Page001.json` (11× `"Type":"Component"`). `Body/Column/Layout/Tab` Container.Types all appear in
  draft fixtures (verified via grep across `metadata/tests/mock/metadata/draft/*.json`).
- **`Component` is used as a Container.Type** (wrapper around a placed widget) — **Confirmed in data, heavily used** (reverse_transformer.py:454).
- `MasterDetail` Type **not observed** in this export (but is a real `ContainerType` constant, page_model_constants.py:78).

### 3.2 Property.Type — catalog §6.5 had `Page/SimpleFilter/FilterParam/Object/Value/Variable` (+unverified Code/Popup)
Observed: `Value`(1092), `Object`(79), `Variable`(59), `SimpleFilter`(49), `Code`(28), `Popup`(11), `FilterParam`(3).
- **CONFIRMED.** `Page/SimpleFilter/FilterParam/Object/Value/Variable` are `PropertyTypes` constants
  (page_model_constants.py:88-94). `Code` and `Popup` are emitted by `entity_factory.create_code_property`
  (Type:"Code", entity_factory.py:239) and `create_popup_property` (Type:"Popup", entity_factory.py:270),
  and reverse_transformer reads them (reverse_transformer.py:720,723). Also confirmed in real fixtures:
  `draft/Page001.json` carries `"Type":"Code"`, `"Type":"FilterParam"`, `"Type":"Popup"`, `"Type":"SimpleFilter"`.
  No `Page` Property type seen here (but it is a valid `PropertyTypes.PAGE` constant, page_model_constants.py:89).

### 3.3 EventMapping.Type / Name — catalog §6.6/§6.7
- Type: `JSAction`, `OpenPopup`. **CONFIRMED** — emitted by `entity_factory.create_event_mapping`
  default `JSAction` (entity_factory.py:216) and `OpenPopup` via widget_transformer.py:131,343; also
  authoring doc `metadata/config/axiom/context/page.md:1234`. `Redirection` **not seen in this export** but
  **IS a real source value** (page.md:924,1234,1237; `base/base/constants/metadata/notification.py:104`).
- Name: `on_click`, `on_load` **CONFIRMED** (entity_factory.py:116,186; page.md:1232,1241).
  `on_submit`, `on_discard` **CONFIRMED in real export fixtures** (`on_submit` in
  `Draft_Add_menu_list_A00.json`; `on_discard` in `Schema_Process_Views_Page_A00.json`).
  **`on_close` and `on_tab_change` — NO SOURCE BACKING: zero hits anywhere** (no constant, no fixture, not in
  page.md). **(data-only — flag: present in export but undefined in source; treat with caution.)**
  `on_change` (catalog unverified) **not seen** here, though it appears in `base/base/util/notification_metadata.py:2914`.

### 3.4 FieldMapping.Type — catalog §6.4 had `Value/Variable/FilterParam/Code/Popup/Richtext` (+unverified Object/TypePicker/Hiddenproperty/TooltipPositionPicker)
Observed: `Style`(581), `Hiddenproperty`(54), `Object`(52), `Richtext`(45), `Icon`(43), `Toggle`(3),
`Dropdown`(2), `TooltipPositionPicker`(1).
- **ALL CONFIRMED in real page-export fixtures** (committed in source under `metadata/tests/mock/metadata/draft/`):
  - `Style` → `draft/migration_test_page_A00.json:224` (`"Type":"Style"`), 30 occurrences repo-wide.
  - `Icon` → `Draft_General_Widgets_Page_A00.json:267` (and builder widget_transformer.py:146).
  - `Toggle` → `draft/Page001.json:1312`.
  - `Dropdown` → `draft/Page001.json:165`.
  - `Hiddenproperty` → `draft/Page001.json:827`.
  - `TooltipPositionPicker` → `draft/Page001.json:1401`.
  - `Object` → `widget_transformer.py:648,849` (FieldMapping for `filterParameters`) + fixtures.
  - `Richtext` → `serializer_constants.py:366` (PROPERTY_TYPE_MAPPING) + `test_024_integration_serializer.py:138`.
- `TypePicker` from the catalog **not seen** anywhere in source (zero hits) — **(data-only: genuinely absent, no constant)**.
- Type→Name correspondences: `Icon`→`icon`/`iconUrl`; `Toggle`→`import`/`newItem`/`showform`;
  `Dropdown`→`size`; `TooltipPositionPicker`→`tooltipPosition`; `Style`→the styling FieldMappings
  (`color`/`backgroundColor`/`fontSize`/`textStyle`/…).

### 3.5 VariableRef.Type — catalog §6.8 had `InputParameter/ApplicationVariable/EventParameter/DatasourceParameter`
Observed: only `ApplicationVariable`(59). No new value; the others simply don't appear here.

### 3.6 Style.Value keys — catalog §6.9
All observed keys are within the catalog set (`StyleConstants`, page_model_constants.py:4-62).
**The novelty is the value *form*** (flat CSS string, incl. `var(--kf-app-*)` design tokens), not the key set.
**CONFIRMED** — the `var(--kf-app-*)` token strings are enumerated in `mappings.py:530-609` `style_value_maps`
(each mapped to its `{ref}` design-token equivalent).

---

## 4. Custom-component manifest shape & bundle layout

**Manifest file:** `customcomponent/<ccId>/manifest/<ccId>.json`
(example `customcomponent/CC6cAIoZI9wB/manifest/CC6cAIoZI9wB.json`).
**CONFIRMED.** The inner manifest template is `application/server/metadata/Custom.py:1-16` `CustomMeta`:
`{Source:"Zip", subcategory:"custom", visualization_type:"custom", layout:[], manifest_version:1,
name:"Custom", template_id:"Custom", properties:{general:[]}, scripts:{web:""}, type:"External", version:"1.0.0",
_created_at, _created_by, _is_active}`. The envelope fields `Layout`, `DraftManifest`, `Status` are schema
fields in `application/schema/custom_component.py:111,114,115`. The Data-key constants (`category`,
`subcategory`, `visualization_type`, `template_id`, `properties`, `scripts`, `web`) are `BaseProperty`
(page_component_constants.py:12-17). The per-instance served `scripts.web` URL is a free-form bundle path
— **(data-only: free-form path string, no constant)**.

```jsonc
{
  "_id": "CC6cAIoZI9wB",
  "_created_at": "...Z", "_created_by": {_id,Name,Kind:"User"},
  "_modified_at": "...Z", "_modified_by": {...},
  "Name": "Customer Feedback Carousel",
  "Description": "",
  "Layout": "Web",
  "_application_id": "Professional_Services_Executive_Da_A00",
  "Status": "Live",
  "Source": "Zip",
  "_doc_version": "...",
  "LastPublishedAt": "...Z",
  "DraftManifest": { /* same shape as Manifest, the editable copy */ },
  "Manifest": {
    "Source": "Zip",
    "category": "custom",
    "subcategory": "custom",
    "visualization_type": "custom",
    "layout": ["Web"],
    "manifest_version": 1,
    "name": "Customer Feedback Carousel",
    "template_id": "Custom",
    "properties": { "general": [] },     // declared config props (empty here)
    "scripts": { "web": "<acct>/application/<appId>/<ccId>/<bundleId>/index.html" },
    "type": "External",
    "version": "1.0.0",
    "_created_at": "...Z", "_created_by": {_id,Name,Kind:"User"}
  }
}
```

Key points:
- Envelope wraps **two** identical manifest blobs: `Manifest` (published) and `DraftManifest` (editable),
  plus top-level audit/`Status`/`Layout`/`Source` fields.
- The inner manifest is the authoritative widget descriptor:
  `Source:"Zip"`, `type:"External"`, `template_id:"Custom"`, `manifest_version:1`,
  `category/subcategory/visualization_type` all `"custom"`, `layout:["Web"]`, `version` (semver),
  `properties.general:[]` (the configurable-prop schema; empty for this component),
  `scripts.web` → the entry HTML path inside the served bundle.
- **How a page references it:** a page `Component` with
  `Script.web = "<acct>/application/<appId>/<ccId>/<bundleId>/index.html"` and
  `Data = {category:"custom", subcategory:"custom", visualization_type:"custom", component_id:"<ccId>"}`.
  Note the page references a per-instance bundle id (`zp5xZ2D2swte`, `zp5tQiuFUeZS`) distinct from the
  manifest's own bundle id (`zp6cAIol_Kr0`) — each placement gets its own served bundle path.

**Bundle layout:** `customcomponent/<ccId>/<bundleId>/`
```
customcomponent/CC6cAIoZI9wB/
├── manifest/CC6cAIoZI9wB.json
└── zp85RphkiLHl/                # the unzipped web bundle
    ├── index.html              # entry; plain HTML/CSS, references index.js
    ├── index.js                # uses global `kf` (kf.api("/id"), kf SDK)
    └── __MACOSX/               # zip cruft (ignore)
```
The bundle is a **plain static HTML/JS** widget (no React build here) that consumes the injected global
`kf` SDK (`kf.api(...)`, profile lookups). `index.html` carries inline `<style>` and an
`id="testim"` carousel DOM that `index.js` drives.

---

## 5. Page flow doc (`page/*/flow/*.json`)

Small doc (~1 KB) — the page list/registry record, **not** the schema. `SysConfig.InputParameters`
**CONFIRMED** — `serializer_constants.py:489-494` class `SysConfig` defines `SYS_CONFIG="SysConfig"` and
`INPUT_PARAMETERS="InputParameters"`. The rest of the envelope (audit fields, `Parent`, `PageAccess`,
`Permission`) is the generic flow-doc registry shape; the concrete field *values* below are free-form —
**(data-only for the literal field layout; the SysConfig.InputParameters key itself is source-confirmed)**:
```jsonc
{ "_id", "_created_at", "_created_by":{_id,Name,Kind}, "_modified_at", "_modified_by",
  "Name", "Description", "Type":"Page", "Icon":null, "Status":"Live",
  "Parent":{ "_id":<appId>, "Type":"Application", "Name" },
  "ChildTables":[ {"_id","Name"} ],
  "_application_id":<appId>, "SharedWith":[], 
  "PageAccess":[ {"_id","Name","Kind","PageScore",audit...,"Permission":["Admin"]} ],
  "SysConfig":{ "InputParameters":[] },          // page input params live HERE, not in the schema blob
  "_doc_version", "LastPublishedAt" }
```
- `SysConfig.InputParameters` is the page's declared input-parameter list (empty for all pages in this
  export). This is **where the catalog's `InputParameters`/`Page::InputParameter` actually lives** at the
  flow-doc level (the schema blob carries `Page::VariableRef` for app-var bindings instead).
- `PageAccess[].Permission` uses the `["Admin"]` capability list; `PageScore` is a per-user score int.

---

## 6. Catalog items NOT seen in this export (so not contradicted, just absent)
`report/pivot` Script; Container `LayoutType`/`LayoutConfig`/`isHidden`/`IsSystem`/`haveHeightLimit`/`Container::Criteria`;
`MasterDetail`/`Component::MasterDetail`; EventMapping `Redirection` type and `on_change` name;
FieldMapping `TypePicker`; Property `Page` type; VariableRef types other than `ApplicationVariable`;
Style `Appearance` parent / `{value}|{ref}` wrapper form; `Page::Variable`.
