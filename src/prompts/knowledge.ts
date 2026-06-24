// =============================================================================
// ServiceNow Platform Knowledge — Embedded Reference for Capabilities
// =============================================================================
// Each export is a structured string constant that capabilities can import
// and inject into their prompts to give the AI model deep platform context.
// =============================================================================

export const FLOW_DESIGNER_KNOWLEDGE = `
## Flow Designer — Platform Reference

### Trigger Types
- **Record Triggers**: Before Insert, After Insert, Before Update, After Update, Before Delete, After Delete
  - Conditions: field-level conditions, advanced scripting conditions
  - Run-as: System or triggering user (security context matters)
- **Scheduled Triggers**: Run once, daily, weekly, monthly, or cron expression
  - Time zone aware, supports repeat-until and count-based limits
- **Application Triggers**: REST trigger (inbound webhook), Email trigger (inbound email parse),
  Custom trigger (raised by script via sn_fd.FlowAPI.startFlow)
- **Inbound Email Trigger**: Matches on subject, sender, body regex; parses attachments

### Action Types
- **Core Actions**: Create Record, Update Record, Delete Record, Log, Assign Record, Request Approval,
  Wait for Approval, Send Notification, Set Value, Ask for Input
- **Flow Logic**: If / Else If / Else, For Each (loop), Wait For (duration/condition),
  Do Until (loop with condition), Parallel (fan-out), Collect (fan-in)
- **Advanced Actions**: Run Script (GlideRecord, GlideQuery, scoped APIs), Call REST (outbound HTTP),
  Call Subflow (reusable logic), Publish Event (event queue), Transform (data mapping),
  Call Action (custom spoke actions), Raise Error (halt execution)

### Error Handling
- **Try / Catch / Finally**: Wrap actions in try-catch; catch outputs error.message, error.detail
- **Rollback Actions**: Delete or revert records created before error
- **Error Outputs**: Every action exposes .error_message and .is_error output variables
- **Compensation**: Use catch block to trigger compensating subflows

### Variables & Data
- **Input/Output Variables**: Defined on flow/subflow signature; typed (string, reference, integer, etc.)
- **Scratch Variables**: Temporary flow-scoped storage, not exposed externally
- **Dot-Walking**: Access related record fields via dot notation (e.g., trigger.current.caller_id.email)
- **Data Pills**: Visual references to any upstream action output or trigger field

### Limits & Performance
- Maximum 100 actions per flow; 200 actions per subflow
- Execution depth limit: 500 (nested subflow calls)
- Synchronous flow timeout: 60 seconds
- Asynchronous flow timeout: 24 hours (configurable)
- Batch operations: use For Each with limit, or GlideQuery bulk operations in Run Script
- Avoid GlideRecord loops in Run Script; prefer GlideQuery with .toArray()
`;

export const PORTAL_WIDGET_KNOWLEDGE = `
## Service Portal Widget — Platform Reference

### Lifecycle
1. **Server Script** executes first (server-side, GlideRecord access, secure)
2. **Client Controller** initializes with data from server (\`c.data\` binding)
3. **HTML Template** renders using AngularJS directives and \`c.data\`
4. Interactions trigger \`c.server.update()\` for round-trip back to server

### Server Script
- **data object**: Populate \`data.fieldName = value\` to pass to client
- **input object**: Receive client-sent data via \`input.fieldName\`
- **$sp API**: getParameter(name), getPortalRecord(), getUser(), getWidget(widgetId, options),
  getStream(table, sys_id), getValues(gr, fieldList), setRedirectURL(url),
  getDisplayValue(fieldName), getInstanceRecord(), getKBCategoryArticles(kbId, categoryId)
- **GlideRecord**: Full server-side access; always enforce ACLs with gr.canRead()
- **Options**: Widget instance options accessible via \`options.optionName\`

### Client Controller
- **\`c.data\`**: Two-way bound to server data object
- **\`c.options\`**: Read-only widget instance options
- **\`c.server.update()\`**: Send c.data back to server; returns promise
- **\`c.server.get({action: 'name'})\`**: Call server with specific action; returns promise
- **spUtil API**: update(widget), addInfoMessage(msg), addErrorMessage(msg),
  addTrivialMessage(msg), createChangeHandler(scope, data, callback),
  recordWatch(scope, table, filter, callback), format(template, data), get(widgetId, options)
- **$scope**: AngularJS scope; use \`\$scope.\$on('event', handler)\` for cross-widget communication
- **\$rootScope.\$broadcast('event', data)**: Emit events to all widgets on page

### HTML Template
- **Directives**: ng-repeat, ng-if, ng-show/ng-hide, ng-click, ng-model, ng-class, ng-style,
  ng-change, ng-submit, ng-disabled, ng-href, ng-src
- **Widget Embedding**: \`<sp-widget widget="c.data.myWidget"></sp-widget>\`
- **Filters**: {{ value | limitTo:50 }}, {{ date | date:'yyyy-MM-dd' }}, {{ text | uppercase }}
- **Translation**: \`\${Message text}\` syntax for internationalization

### CSS / SCSS
- Scoped to widget automatically (no bleed to other widgets)
- SCSS variables: \$sp-primary, \$sp-secondary, \$sp-navbar-bg, \$sp-tagline-color
- BEM convention recommended: .widget-name__element--modifier
- Bootstrap 3 grid system available (col-xs, col-sm, col-md, col-lg)

### Security
- **XSS Prevention**: Use ng-bind (not ng-bind-html) for untrusted data; use $sanitize service
- **Server-Side Validation**: Always validate input on server; client validation is bypassable
- **ACL Enforcement**: Use gr.canRead()/canWrite() before returning data
- **Sensitive Data**: Never send sys_ids of admin records; filter server-side
`;

export const UIB_COMPONENT_KNOWLEDGE = `
## UI Builder (UIB) / Now Experience — Platform Reference

### Architecture
- **Macroponent**: Top-level container component; composes child components
- **Child Components**: Reusable elements within a macroponent
- **Data Resources**: Feed data into components (GraphQL, REST, Script, Record Watcher, Transform)
- **Variants**: Different configurations of a macroponent for different use cases
- **Page**: Collection of macroponents arranged in layout regions

### @seismic/core (Now Experience Framework)
- \`createCustomElement(tag, { ...config })\`: Register a custom web component
- \`actionTypes.COMPONENT_PROPERTY_CHANGED\`: Dispatched when a property value changes
- \`actionTypes.COMPONENT_CONNECTED\`: Component attached to DOM
- \`actionTypes.COMPONENT_DISCONNECTED\`: Component removed from DOM
- \`actionTypes.COMPONENT_BOOTSTRAPPED\`: Component first initialized
- Action handlers: \`actionHandlers: { [actionType]: (coeffects) => newState }\`
- Coeffects: \`{ action, state, dispatch, updateState, properties }\`

### Data Resources
- **GraphQL**: Query Now Platform GraphQL APIs; supports variables and fragments
- **REST**: Call REST APIs (internal or external); configure auth and headers
- **Script**: Server-side Script Include execution; returns JSON
- **Record Watcher**: Real-time updates via AMB (Ambient Messaging Bus) channel
- **Transform**: Map and reshape data from other resources

### Now Experience Design System (NEDS)
- Core components: now-button, now-heading, now-card, now-card-hero, now-dropdown,
  now-modal, now-icon, now-avatar, now-badge, now-toggle, now-input, now-textarea,
  now-select, now-radio-buttons, now-checkbox, now-tabs, now-alert, now-loading,
  now-rich-text, now-label-value, now-template-card
- Layout: now-grid, now-split, now-stack (flexbox-based)
- Theming: CSS custom properties (--now-color-*, --now-font-*, --now-spacing-*)

### Properties & Events
- \`@property({ type: String }) label\`: Declare configurable properties
- Properties configurable via Variant Editor in UI Builder
- \`dispatch('EVENT_NAME', { detail: payload })\`: Emit custom events
- \`update({ propName: newValue })\`: Update component state
- Lifecycle: connected -> bootstrapped -> property changes -> disconnected

### Responsive Design
- Breakpoints: mobile (<768px), tablet (768-1024px), desktop (>1024px)
- CSS grid and flexbox for layout; container queries for component-level responsiveness
- Use now-grid regions for adaptive layouts
`;

export const CMDB_KNOWLEDGE = `
## CMDB (Configuration Management Database) — Platform Reference

### Class Hierarchy (Inheritance)
- \`cmdb\` (base) -> \`cmdb_ci\` (Configuration Item base)
  - \`cmdb_ci_hardware\` -> \`cmdb_ci_computer\` -> \`cmdb_ci_server\` / \`cmdb_ci_vm_instance\`
  - \`cmdb_ci_hardware\` -> \`cmdb_ci_computer\` -> \`cmdb_ci_pc_hardware\`
  - \`cmdb_ci_hardware\` -> \`cmdb_ci_netgear\` -> \`cmdb_ci_ip_router\` / \`cmdb_ci_ip_switch\` / \`cmdb_ci_ip_firewall\`
  - \`cmdb_ci_service\` -> \`cmdb_ci_service_auto\` / \`cmdb_ci_service_technical\` / \`cmdb_ci_service_business\`
  - \`cmdb_ci_appl\` -> \`cmdb_ci_app_server\` (Tomcat, WebSphere, etc.)
  - \`cmdb_ci_db_instance\` (MySQL, Oracle, SQL Server, PostgreSQL)
  - \`cmdb_ci_cloud_service_account\` (AWS, Azure, GCP)
  - \`cmdb_ci_kubernetes_cluster\`, \`cmdb_ci_kubernetes_node\`, \`cmdb_ci_kubernetes_pod\`
  - \`cmdb_ci_storage_device\`, \`cmdb_ci_network_adapter\`, \`cmdb_ci_disk\`

### Relationship Types (cmdb_rel_type)
- **Depends on::Used by** — Service A depends on Server B
- **Runs on::Runs** — Application runs on Server
- **Housed in::Houses** — Server housed in Rack
- **Connected to::Connected by** — Network adjacency
- **Cluster of::Cluster is** — Cluster membership
- **Provided by::Provides** — Cloud service provider relationship
- **Members::Member of** — Group membership
- **Hosted on::Hosts** — VM hosted on Hypervisor

### IRE (Identification & Reconciliation Engine)
- **Identification Rules**: Match incoming CI data to existing CIs using identifier fields (e.g., serial_number + name)
- **Reconciliation Rules**: Determine which data source wins conflicts (priority-based)
- **Data Source Priority**: Discovery > SCCM > Manual > Import Set (configurable)
- **Duplicate Detection**: IRE flags potential duplicates via identification mismatches
- **Reclassification**: Automatically moves CIs to correct class based on discovered attributes

### Discovery
- **Schedule Types**: Full, Incremental, Quick (IP range limited)
- **MID Server Roles**: Discovery, ITOM, Event Management, Orchestration
- **Horizontal Discovery**: IP-based; finds devices on network (ping, SNMP, WMI, SSH)
- **Vertical Discovery** (Pattern-based): Deep application topology; uses Service Mapping patterns
- **Cloud Discovery**: AWS, Azure, GCP via service account credentials
- **Credential-less Discovery**: Agent-based (ACC-M) for environments without shared credentials

### CMDB Health
- **Data Completeness**: Percentage of required fields populated per CI class
- **Staleness**: CIs not updated within defined threshold (e.g., 30 days)
- **Orphan CIs**: CIs with no relationships (isolated in the graph)
- **Relationship Density**: Average relationships per CI; low density indicates poor mapping
- **Compliance Score**: Combined metric of completeness + freshness + relationship health
- **Duplicate Rate**: Percentage of CIs flagged as potential duplicates
`;

export const GLIDE_QUERY_PATTERNS = `
## Glide Query Patterns — Platform Reference

### GlideQuery (Modern — Preferred for new development, scoped apps)
\`\`\`javascript
// Basic select
var results = new GlideQuery('incident')
  .where('priority', 1)
  .where('state', '!=', 6)
  .orderByDesc('sys_created_on')
  .select('number', 'short_description', 'caller_id$DISPLAY')
  .toArray(100);

// Select one record
var record = new GlideQuery('sys_user')
  .where('user_name', 'admin')
  .selectOne('sys_id', 'name', 'email')
  .orElse({ name: 'Not found' });

// Aggregates
var counts = new GlideQuery('incident')
  .where('state', '!=', 7)
  .aggregate('COUNT')
  .groupBy('priority')
  .select();

// Insert
var sysId = new GlideQuery('incident')
  .insert({
    short_description: 'New incident',
    caller_id: callerSysId,
    priority: 3
  })
  .get('sys_id');

// Update (returns count of updated records)
new GlideQuery('incident')
  .where('sys_id', incidentId)
  .update({ state: 2, assigned_to: userSysId });

// Null checks
new GlideQuery('cmdb_ci')
  .whereNull('assigned_to')
  .whereNotNull('name')
  .select('name')
  .toArray(50);

// Disable business rules for bulk operations
new GlideQuery('table').disableWorkflow().where(...).update({...});
\`\`\`

### GlideRecord (Legacy — still dominant in global scope and existing code)
\`\`\`javascript
// Basic query
var gr = new GlideRecord('incident');
gr.addQuery('priority', 1);
gr.addQuery('state', '!=', 6);
gr.orderByDesc('sys_created_on');
gr.setLimit(100);
gr.query();
while (gr.next()) {
  var number = gr.getValue('number');
  var desc = gr.getDisplayValue('short_description');
}

// Encoded query (complex conditions)
var gr = new GlideRecord('incident');
gr.addEncodedQuery('priority=1^stateNOT IN6,7^sys_created_on>=javascript:gs.daysAgo(30)');
gr.query();

// Get single record
var gr = new GlideRecord('incident');
if (gr.get('number', 'INC0010001')) {
  // record found
}
\`\`\`

### Best Practices
- **Use getDisplayValue()** for reference fields, choice fields (returns label not sys_id)
- **Use getValue()** when you need the raw stored value (sys_id, integer, etc.)
- **Always setLimit()** before query() to prevent unbounded result sets
- **getRowCount() is expensive** — it queries all rows; use GlideAggregate COUNT instead
- **addEncodedQuery** for complex OR conditions, date math, CONTAINS, STARTSWITH
- **toString() caution**: gr.field returns GlideElement, not string; use getValue() or toString()

### GlideAggregate
\`\`\`javascript
var ga = new GlideAggregate('incident');
ga.addQuery('active', true);
ga.addAggregate('COUNT');
ga.addAggregate('AVG', 'reassignment_count');
ga.groupBy('priority');
ga.query();
while (ga.next()) {
  var priority = ga.getValue('priority');
  var count = ga.getAggregate('COUNT');
  var avgReassign = ga.getAggregate('AVG', 'reassignment_count');
}
\`\`\`

### GlideAjax (Client-to-Server round-trip)
\`\`\`javascript
// Client-side call
var ga = new GlideAjax('MyScriptInclude');
ga.addParam('sysparm_name', 'myMethod');
ga.addParam('sysparm_my_param', 'value');
ga.getXMLAnswer(function(answer) {
  // answer is the string returned by the script include
  var result = JSON.parse(answer);
});

// Server-side Script Include (must extend AbstractAjaxProcessor)
var MyScriptInclude = Class.create();
MyScriptInclude.prototype = Object.extendsObject(AbstractAjaxProcessor, {
  myMethod: function() {
    var param = this.getParameter('sysparm_my_param');
    return JSON.stringify({ success: true, data: param });
  },
  type: 'MyScriptInclude'
});
\`\`\`
`;

export const COMMON_ANTI_PATTERNS = `
## Common ServiceNow Anti-Patterns — Reference

### Query Anti-Patterns
- **GlideRecord in a loop (N+1 problem)**: Each iteration fires a separate SQL query.
  Fix: Use addEncodedQuery with IN operator, or GlideQuery with a single query returning all needed records.
- **No query limit**: Unbounded queries can return millions of rows, causing performance degradation and timeouts.
  Fix: Always call setLimit() or use .toArray(maxCount) with GlideQuery.
- **getRowCount() for existence check**: Queries ALL matching rows just to check if any exist.
  Fix: Use setLimit(1) + query() + hasNext(), or GlideQuery .selectOne().isPresent().
- **String concatenation for queries**: Building query strings manually is error-prone and vulnerable to injection.
  Fix: Use addQuery(), addOrCondition(), or addEncodedQuery() with proper escaping.
- **SELECT * pattern**: Retrieving all fields when only a few are needed wastes memory and bandwidth.
  Fix: Use GlideQuery .select('field1', 'field2') or setDisplayValue(false) with specific getValue() calls.

### Scripting Anti-Patterns
- **Hardcoded sys_ids**: Break across instances (dev/test/prod) and upgrades.
  Fix: Use system properties (gs.getProperty), GlideRecord lookups by name, or sys_properties.
- **eval() usage**: Severe security risk; allows arbitrary code execution.
  Fix: Never use eval(). Use JSON.parse() for data, function references for dynamic dispatch.
- **gs.print() in production**: Writes to system log inefficiently, not filterable.
  Fix: Use gs.log(), gs.debug(), gs.info(), gs.warn(), gs.error() with source parameter.
- **current.update() in Before business rules**: Triggers another update, causing infinite recursion.
  Fix: Set field values directly on current (current.field = value); the platform saves automatically in Before rules.
- **Synchronous GlideAjax**: Blocks the browser UI thread, causes freezing.
  Fix: Always use getXMLAnswer(callback) or getXMLWait() with async patterns.
- **Direct DOM manipulation in client scripts**: Breaks on form redesign, not upgrade-safe.
  Fix: Use g_form API exclusively (setValue, setDisplay, setVisible, setMandatory, etc.).

### Business Rule Anti-Patterns
- **No condition on business rule**: Fires on EVERY insert/update/delete regardless of relevance.
  Fix: Always set a condition (filter or script condition) to narrow execution scope.
- **Heavy computation in synchronous rules**: Blocks the user transaction, causes slow form saves.
  Fix: Move heavy logic to async business rules or Flow Designer scheduled flows.
- **Not using setWorkflow(false)**: Bulk operations without disabling business rules cause cascading performance issues.
  Fix: Call gr.setWorkflow(false) for bulk data loads; re-enable after.

### Architecture Anti-Patterns
- **Business logic in UI policies**: UI policies are client-only; logic can be bypassed via API, imports, or scripting.
  Fix: Enforce logic in business rules (server-side) and use UI policies only for form UX.
- **Excessive client scripts**: Too many onChange/onLoad scripts slow form rendering.
  Fix: Consolidate into fewer scripts; use UI policies for simple show/hide/mandatory.
- **Not using update sets**: Making changes directly in production without tracking.
  Fix: Always use update sets; move changes through dev -> test -> prod pipeline.
- **Circular references in script includes**: Script Include A calls B which calls A.
  Fix: Refactor to remove circular dependency; use a shared utility Script Include.
`;

export const API_REFERENCE = `
## ServiceNow API Quick Reference

### g_form (Client-Side Form API)
- **Get/Set Values**: getValue(field), setValue(field, value), clearValue(field)
- **Display Control**: setDisplay(field, bool), setVisible(field, bool), setReadOnly(field, bool),
  setMandatory(field, bool), setDisabled(field, bool)
- **Labels/Options**: setLabel(field, label), getLabelOf(field), addOption(field, value, label),
  removeOption(field, value), clearOptions(field), getOption(field, value)
- **Messages**: showFieldMsg(field, msg, type), hideFieldMsg(field), hideAllFieldMsgs(),
  addInfoMessage(msg), addErrorMessage(msg), clearMessages()
- **References**: getReference(field, callback) — async; returns GlideRecord of referenced record
- **Visual**: flash(field, color, count), setSectionDisplay(section, bool)
- **State**: isNewRecord(), isDatabaseReady(), isLiveUpdating(), isMandatory(field), isReadOnly(field)
- **Sections**: getSections(), setSectionDisplay(sectionName, display), isSectionVisible(sectionName)
- **Save**: save(), submit()

### g_list (Client-Side List API)
- **Get Info**: getQuery(), getTableName(), getTitle(), getOrderBy(), getGroupBy()
- **Set Info**: setQuery(encodedQuery), setOrderBy(orderBy), setGroupBy(groupBy)
- **Refresh**: refresh(), refreshWithOrderBy(orderBy)
- **Row Count**: getRowCount(), getTotalRows()

### GlideRecord (Server-Side Record API)
- **Query Building**: addQuery(field, operator, value), addOrCondition(field, operator, value),
  addEncodedQuery(query), addNullQuery(field), addNotNullQuery(field), orderBy(field),
  orderByDesc(field), setLimit(max), chooseWindow(start, end)
- **Execution**: query(), next(), hasNext(), get(sysId), get(field, value)
- **CRUD**: insert(), update(), deleteRecord(), deleteMultiple(), initialize(), newRecord()
- **Field Access**: getValue(field), setValue(field, value), getDisplayValue(field),
  getElement(field), getUniqueValue(), getRecordClassName(), getTableName()
- **Security**: canRead(), canWrite(), canCreate(), canDelete(), setAbortAction(bool)
- **Workflow**: setWorkflow(bool), autoSysFields(bool), setForceUpdate(bool)
- **Utility**: getEncodedQuery(), getRowCount(), getLink(noStack), getClassDisplayValue(),
  isValid(), isValidField(field), isNewRecord(), isActionAborted(), hasAttachments()

### GlideSystem — gs (Server-Side System API)
- **User Context**: getUserID(), getUserName(), getUser().getFullName(), hasRole(role),
  hasRoleInGroup(role, groupSysId), isLoggedIn(), isInteractive(), getSession()
- **Date/Time**: beginningOfToday(), endOfToday(), beginningOfYesterday(), endOfYesterday(),
  daysAgo(days), daysAgoStart(days), daysAgoEnd(days), hoursAgo(hours), minutesAgo(minutes),
  monthsAgo(months), quartersAgo(quarters), yearsAgo(years), now(), nowDateTime(),
  dateGenerate(date, range)
- **Logging**: log(msg, source), debug(msg, source), info(msg, source), warn(msg, source),
  error(msg, source)
- **Messages**: addInfoMessage(msg), addErrorMessage(msg)
- **Properties**: getProperty(name, defaultValue), setProperty(name, value, description)
- **Utility**: nil(obj), include(scriptIncludeName), tableExists(tableName),
  generateGUID(), getDisplayColumn(table), eventQueue(eventName, gr, parm1, parm2),
  sleep(ms), urlEncode(url), urlDecode(url), xmlToJSON(xml), base64Encode(str), base64Decode(str)
- **Scoped**: getCallerScopeName(), getCurrentScopeName()

### GlideQuery (Server-Side Modern Query API)
- **Build**: new GlideQuery(table), where(field, operator, value), whereNull(field),
  whereNotNull(field), orWhere(field, operator, value)
- **Order**: orderBy(field), orderByDesc(field), limit(count)
- **Execute**: select(field1, field2, ...), selectOne(field1, ...), toArray(maxCount)
- **Aggregate**: aggregate(operation, field), groupBy(field), having(operation, field, operator, value)
- **Mutate**: insert(record), update(record), updateMultiple(record), deleteMultiple()
- **Control**: disableWorkflow(), withAcls(), forceUpdate()
- **Optional (selectOne result)**: get(field), isPresent(), isEmpty(), orElse(default),
  ifPresent(callback), map(callback), flatMap(callback)

### $sp (Portal Server-Side API)
- getParameter(name), getPortalRecord(), getUser(), getUserInitials()
- getWidget(widgetSysId, options), getWidgetFromInstance(instanceSysId)
- getStream(table, sysId), getValues(gr, fieldString)
- setRedirectURL(url), getDisplayValue(field)
- getInstanceRecord(), getRecordElements(gr, fieldNames)
- getKBCategoryArticles(kbSysId, categorySysId), getKBCount(kbSysId)

### spUtil (Portal Client-Side Utility)
- update(widget) — send c.data to server and refresh
- get(widgetSysId, options) — fetch widget model from server
- addInfoMessage(msg), addErrorMessage(msg), addTrivialMessage(msg)
- createChangeHandler(scope, dataObject, callback)
- recordWatch(scope, table, filter, callback) — real-time record updates
- format(templateString, dataObject) — string interpolation
`;

export const CATALOG_KNOWLEDGE = `
## Service Catalog — Platform Reference

### Catalog Structure
- **Catalog** (sc_catalog): Top-level container; an instance can have multiple catalogs
- **Category** (sc_category): Organizational grouping within a catalog; supports nesting (parent/child)
- **Item** (sc_cat_item): Orderable service; can be Record Producer, Order Guide, or standard item
- **Variable Set** (item_option_new_set): Reusable group of variables shared across items
- **Variable** (item_option_new): Individual form field on a catalog item

### Variable Types
- **Text**: Single Line Text (string), Multi-Line Text (textarea), Email, URL, IP Address
- **Numeric**: Integer, Decimal, Currency, Duration, Percent
- **Selection**: Select Box (dropdown), Radio Button, Checkbox, Lookup Select Box (query-driven dropdown)
- **Reference Types**: Reference (single record), List Collector (multi-select reference)
- **Date Types**: Date, Date/Time, Time
- **Rich Content**: HTML, Label (read-only text), Macro, Macro with Label
- **Layout**: Container Start, Container End, Container Split (visual grouping)
- **Advanced**: Multi-Row Variable Set (MRVS — repeatable row groups), Requested For,
  Masked (password-type), Custom (UI Macro based)

### Variable Attributes (Semicolon-delimited on variable record)
- ref_qual_elements=field: Dynamic reference qualifier based on another variable
- ref_auto_completer=AJAXTableCompleter: Auto-complete for reference fields
- max_length=100: Character limit for text fields
- default_value=value: Pre-populated value
- hidden=true: Hide from form (still submitted)
- read_only=true: Display but not editable
- mandatory=true: Require before submission
- include_none=true: Add "-- None --" option to select boxes
- glide_list=true: Enable comma-separated multi-value entry
- no_filter=true: Disable list filter on reference fields

### Request Model (Fulfillment Chain)
- **sc_request**: Parent request record (one per cart checkout)
- **sc_req_item** (RITM): One per catalog item ordered; contains variable values
- **sc_task**: Fulfillment tasks generated from the RITM; assigned to groups
- **Flow**: sc_req_item triggers fulfillment flow (preferred) or legacy workflow

### Approval Engine
- **Approval Rules** (sysapproval_approver): Define who approves and under what conditions
- **States**: Not Yet Requested -> Requested -> Approved / Rejected / Cancelled
- **Types**: User approval, Group approval (any member can act), Scripted approval
- **Generated vs Required**: Generated = system-created; Required = manually added
- **Approval Policies**: Anyone (first responder), Everyone (unanimous), Majority (>50%)

### Fulfillment
- **Flow Designer** (preferred): Trigger on sc_req_item insert; automate task creation, notifications
- **Workflow** (legacy): Visual workflow editor; being replaced by Flow Designer
- **Direct Task Creation**: Execution plan creates sc_task records automatically

### Catalog Client Scripts
- **onChange**: Fires when a variable value changes; receives variableName, oldValue, newValue
  Use: Cascade variable values, dynamic filtering, show/hide variables
- **onLoad**: Fires when the catalog item form loads
  Use: Set default values, initialize variable states, hide sections
- **onSubmit**: Fires on form submission; return false to prevent submit
  Use: Validation, confirmation dialogs, data formatting

### Catalog UI Policies
- Conditions based on variable values (no scripting needed for simple cases)
- Actions: Set mandatory, set visible, set read-only on target variables
- Reverse if false: Automatically undo actions when condition no longer met
- Script-based: Advanced conditions via script expression for complex logic
- Run on load: Execute policy when form first opens (not just on change)
`;

export const REST_API_KNOWLEDGE = `
## REST API — Platform Reference

### Scripted REST API Structure
- **API Definition** (sys_ws_definition): Top-level API with base path, namespace, version
  - Path: /api/{namespace}/{api_id}/v{version}
  - Namespace: Scoped app namespace (e.g., x_myapp) or global (now)
- **Resource** (sys_ws_operation): Individual endpoint within an API
  - Path: Relative to API base; supports path parameters with {param_name}
  - HTTP Method: GET, POST, PUT, PATCH, DELETE (one method per resource)

### Request Object (Scripted REST)
\`\`\`javascript
// Path parameters: /api/x_app/users/{user_id}
var userId = request.pathParams.user_id;

// Query parameters: ?active=true&limit=10
var active = request.queryParams.active;
var limit = request.queryParams.limit;

// Request body (POST/PUT/PATCH)
var body = request.body.data;  // Parsed JSON object
var rawBody = request.body.dataString;  // Raw string

// Headers
var authHeader = request.getHeader('Authorization');
var contentType = request.getHeader('Content-Type');

// Request metadata
var method = request.getMethod();  // GET, POST, etc.
var uri = request.uri;
var queryString = request.queryString;
\`\`\`

### Response Object (Scripted REST)
\`\`\`javascript
// Set status code
response.setStatus(200);  // 200 OK, 201 Created, 204 No Content, etc.

// Set response body
response.setBody({
  result: { id: sysId, name: name },
  status: 'success'
});

// Set headers
response.setHeader('X-Custom-Header', 'value');
response.setContentType('application/json');

// Streaming (large responses)
var writer = response.getStreamWriter();
writer.writeString('data chunk');
\`\`\`

### Error Handling
\`\`\`javascript
// Built-in error classes (sn_ws_err namespace)
throw new sn_ws_err.NotFoundError('Record not found');           // 404
throw new sn_ws_err.BadRequestError('Invalid input');            // 400
throw new sn_ws_err.ServiceError('Internal error');              // 500
throw new sn_ws_err.UnsupportedMediaTypeError('Use JSON');       // 415
throw new sn_ws_err.ConflictError('Record already exists');      // 409

// Custom error with details
var error = new sn_ws_err.ServiceError();
error.setStatus(422);
error.setMessage('Validation failed');
error.setDetail('Field "name" is required');
throw error;
\`\`\`

### Authentication Methods
- **Basic Authentication**: Username/password in Authorization header (Base64)
- **OAuth 2.0**: Client credentials, authorization code, or refresh token grant
  - Token endpoint: /oauth_token.do
  - Authorize endpoint: /oauth_auth.do
- **API Key**: Custom header (x-api-key) validated in Scripted REST preprocessing
- **Mutual TLS**: Client certificate authentication for high-security integrations
- **Session-based**: Cookie-based (jsessionid) for browser clients after login

### Versioning
- Path-based: /api/x_scope/v1/resource vs /api/x_scope/v2/resource
- Each version is a separate API definition or resource set
- Maintain backward compatibility; deprecate old versions with sunset headers

### Best Practices
- **Input Validation**: Always validate request body fields, types, and ranges before processing
- **Try-Catch**: Wrap all logic in try-catch; return consistent error format
- **Status Codes**: Use correct HTTP status codes (200, 201, 204, 400, 401, 403, 404, 409, 500)
- **Pagination**: Support limit and offset query params; return total count and next/prev links
  - response.setBody({ result: records, meta: { total: count, limit: limit, offset: offset } })
- **ETags**: Return ETag header for cacheable responses; support If-None-Match for conditional requests
- **Rate Limiting**: Configure via system property glide.rest.rate_limit.* or custom Scripted REST logic
- **CORS**: Configure via sys_cors_rule; specify allowed origins, methods (GET, POST, etc.), headers
  - Preflight: OPTIONS request auto-handled when CORS rule exists
  - Credentials: Set allow_credentials to true for cookie-based auth from browsers
- **Security**: Never expose internal sys_ids unnecessarily; use display values or mapped identifiers
- **Logging**: Log request/response in Scripted REST for debugging; use gs.debug() not gs.log()
`;
