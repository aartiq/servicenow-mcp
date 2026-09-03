# NowAIKit attachment flow for Copilot Studio (import, don't build)

This is the one piece a conversational Copilot agent needs to attach a **pasted** file to ServiceNow.
Everything else (files already in ServiceNow, files at a URL, generating a KB from a document's
content, small files) is handled directly by the NowAIKit MCP tools and needs no flow:

- `read_attachment` , read/return the text of a file already in ServiceNow.
- `copy_attachment` , copy an existing attachment from one record to another, server-side.
- `upload_attachment` with `source_url` , fetch a file from a link and attach it, server-side.
- `upload_attachment` with `content_base64` , small files inline.

The flow below only exists because Microsoft never streams a chat-uploaded file to an MCP tool.
It captures the file on the platform side and hands the bytes to ServiceNow.

## What the flow does
Input: the uploaded `File`, the target `KBSysId`, and `FileName`.
Action: POST the raw bytes to ServiceNow's native attachment endpoint.
Output: the new attachment's details / a success message.

## Flow definition (recreate once, then export as a managed solution)
1. Trigger: **Run a flow from Copilot**.
2. Inputs:
   - `File` (type **File**)
   - `KBSysId` (text)
   - `FileName` (text)
3. Action: **HTTP** (premium connector)
   - Method: `POST`
   - URI:
     ```
     https://<instance>.service-now.com/api/now/attachment/file?table_name=kb_knowledge&table_sys_id=@{triggerBody()['KBSysId']}&file_name=@{triggerBody()['FileName']}
     ```
   - Headers: `Content-Type: application/octet-stream`  (ServiceNow reads the real type from the file name)
   - Body: `@{base64ToBinary(triggerBody()?['File']?['contentBytes'])}`
   - Authentication: the customer's ServiceNow connection (Basic or OAuth), least-privilege user
     with knowledge write + attachment create.
4. Respond to Copilot: return `Attachment added to @{triggerBody()['FileName']}` and the record link.

## Wiring into the agent (conversational / generative orchestration)
1. Add one topic (trigger phrases: "attach a file", "upload a document to a KB").
2. **Question node → Identify: File**, tick **Include file metadata** → variable `Topic.userReceipt`.
3. Add the flow as an action. Map its `File` input with **Custom value** (Power Fx), NOT "Dynamically fill with AI":
   ```
   { contentBytes: Topic.userReceipt.Content, name: Topic.userReceipt.Name }
   ```
   Map `FileName` = `Topic.userReceipt.Name`, and `KBSysId` from context (the agent can resolve it
   from a KB number via NowAIKit `query_records` on `kb_knowledge`).
4. Add one instruction line so the orchestrator routes file uploads to this topic.

Environment must be on **2025.7.2** or higher for file inputs to flows/tools.

## Packaging as an importable solution
Once recreated in a maker environment, export it as a **managed solution** (`.zip`) with the ServiceNow
connection as a connection reference and the instance host as an environment variable. Customers then
**import** it and set two values (instance host + connection), rather than building anything.

## Alternative: route through NowAIKit instead of the native endpoint
Instead of the HTTP action, the flow can stage the file to a URL and call NowAIKit `upload_attachment`
with `source_url`. Use this if you want the upload to go through the gateway (audit, SSRF guard,
consistent behaviour across clients) rather than straight to ServiceNow.
